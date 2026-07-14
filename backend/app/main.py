"""
FastAPI Backend v2.3
====================
v2.3 fix: get_hint() now retrieves the player's most recent wrong answer
from session history and uses the room's actual DDA state (which may be
STRUGGLING or STUCK, not just CONFUSED) so that:

  - Track B semantic search is targeted at the player's specific
    misconception rather than a fixed "player requested hint" string.
  - Doctor K's intervention level escalates correctly on repeated hint
    clicks (CONFUSED → STRUGGLING → STUCK), matching the GDD §5.2
    three-dimensional monitoring design.

Previously both wrong_answer and dda_state were hardcoded in get_hint(),
which caused every hint click to produce near-identical responses.
"""

from __future__ import annotations
import os, uuid
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import json

from app.dda import DDAEngine, DDAState, PersonaStage, SessionState
from app.rag import RAGRetriever
from app.doctor_k import stream_teaching, stream_chat, generate_dda_response, evaluate_prompt

_firebase_available = False
try:
    from app.firebase_service import (
        create_session, load_session, save_session,
        flush_dda_events, get_user_sessions,
    )
    _firebase_available = True
except Exception as _fb_err:
    print(f"[INFO] Firebase not configured ({_fb_err}) — running in offline mode.")
    def create_session(s): pass
    def load_session(uid, sid): return None
    def save_session(s): pass
    def flush_dda_events(s, r): pass
    def get_user_sessions(uid): return []

app = FastAPI(title="Escape the Core API", version="2.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_dda = DDAEngine()
_rag: RAGRetriever | None = None
_mem_sessions: dict[str, SessionState] = {}


def get_rag() -> RAGRetriever:
    global _rag
    if _rag is None:
        _rag = RAGRetriever()
    return _rag


# ── Pydantic models ────────────────────────────────────────────────────────────

class StartSessionRequest(BaseModel):
    user_id: str
    player_name: Optional[str] = ""

class SubmitAnswerRequest(BaseModel):
    session_id: str
    user_id: str
    is_correct: bool
    time_taken_ms: int
    answer_given: str

class ChatRequest(BaseModel):
    session_id: str
    user_id: str
    message: str
    history: Optional[list[dict]] = []
    persona: Optional[str] = "cold"

class CompleteRoomRequest(BaseModel):
    session_id: str
    user_id: str
    score: float

class EvaluatePromptRequest(BaseModel):
    session_id: str
    user_id: str
    prompt: str
    task: Optional[str] = "system_restart_announcement"

class SubmitQuizRequest(BaseModel):
    session_id: str
    user_id: str
    answers: list[dict]
    score: float


# ── SSE helpers ────────────────────────────────────────────────────────────────

def sse_event(data: str) -> str:
    return f"event: message\ndata: {json.dumps(data)}\n\n"

def sse_done() -> str:
    return "event: done\ndata: {}\n\n"

def sse_error(msg: str) -> str:
    return f"event: error\ndata: {json.dumps({'error': msg})}\n\n"

SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


# ── Session helpers ────────────────────────────────────────────────────────────

def _get_session(user_id: str, session_id: str) -> Optional[SessionState]:
    session = load_session(user_id, session_id)
    if session:
        return session
    return _mem_sessions.get(session_id)

def _save(session: SessionState):
    _mem_sessions[session.session_id] = session
    try:
        save_session(session)
    except Exception:
        pass

def _get_persona(user_id: str, session_id: str, fallback: str = "cold") -> str:
    s = _get_session(user_id, session_id)
    return s.persona_stage if s else fallback


# ── Streaming endpoints ────────────────────────────────────────────────────────

@app.get("/api/room/{room_id}/teach")
def teach_room(
    room_id: str,
    session_id: str,
    user_id: str,
    persona: Optional[str] = "cold",
):
    persona_stage = _get_persona(user_id, session_id, persona)

    def generate():
        try:
            for chunk in stream_teaching(room_id, persona_stage):
                yield sse_event(chunk)
            yield sse_done()
        except Exception as e:
            print(f"[ERROR] /room/{room_id}/teach failed: {e!r}")
            yield sse_error(str(e))

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers=SSE_HEADERS)


@app.post("/api/room/{room_id}/chat")
def chat_with_doctor_k(room_id: str, req: ChatRequest):
    persona_stage = _get_persona(req.user_id, req.session_id, req.persona or "cold")

    def generate():
        try:
            for chunk in stream_chat(
                message=req.message,
                room_id=room_id,
                persona_stage=persona_stage,
                history=req.history or [],
            ):
                yield sse_event(chunk)
            yield sse_done()
        except Exception as e:
            print(f"[ERROR] /room/{room_id}/chat failed: {e!r}")
            yield sse_error(str(e))

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers=SSE_HEADERS)


# ── Session endpoints ──────────────────────────────────────────────────────────

@app.post("/api/session/start")
def start_session(req: StartSessionRequest):
    existing = get_user_sessions(req.user_id)
    incomplete = [s for s in existing if not s.get("certificate")]

    if incomplete:
        latest = max(incomplete, key=lambda s: s.get("session_id", ""))
        session = load_session(req.user_id, latest["session_id"])
        if session:
            return {"session_id": session.session_id,
                    "current_room": session.current_room,
                    "persona_stage": session.persona_stage}

    session = SessionState(session_id=str(uuid.uuid4()), user_id=req.user_id)
    _save(session)

    return {
        "session_id":    session.session_id,
        "current_room":  session.current_room,
        "persona_stage": session.persona_stage,
    }


@app.post("/api/room/{room_id}/submit")
def submit_answer(room_id: str, req: SubmitAnswerRequest):
    session = _get_session(req.user_id, req.session_id)
    if not session:
        session = SessionState(session_id=req.session_id, user_id=req.user_id)

    new_state, show_scaffold = _dda.process_attempt(
        session=session,
        room_id=room_id,
        is_correct=req.is_correct,
        time_taken_ms=req.time_taken_ms,
        answer_given=req.answer_given,
    )

    hint_chunks = []
    doctor_k_msg = ""

    if not req.is_correct:
        try:
            rag = get_rag()
            result = rag.retrieve_for_dda(
                player_state=new_state.lower(),
                wrong_answer=req.answer_given,
                room=room_id,
            )
            hint_chunks = result.combined
            doctor_k_msg = generate_dda_response(
                dda_state=new_state,
                persona_stage=session.persona_stage,
                room_id=room_id,
                wrong_answer=req.answer_given,
                hint_chunks=hint_chunks,
            )
        except Exception as e:
            print(f"[ERROR] /room/{room_id}/submit DDA/RAG generation failed: {e!r}")
            doctor_k_msg = "Signal interference detected. Recalibrating — try again."

    _save(session)

    return {
        "dda_state":      new_state,
        "show_scaffold":  show_scaffold,
        "doctor_k_msg":   doctor_k_msg,
        "persona_stage":  session.persona_stage,
        "hint_chunk_ids": [c.chunk_id for c in hint_chunks],
    }


@app.get("/api/room/{room_id}/hint")
def get_hint(room_id: str, session_id: str, user_id: str):
    """
    v2.3 fix — two changes from the original implementation:

    1. wrong_answer: instead of the fixed string "player requested hint",
       we now extract the player's most recent incorrect answer from the
       room's attempt history.  This makes Track B's semantic search
       target the actual misconception, so each hint is genuinely
       tailored to what the player got wrong rather than returning the
       same generic chunks every time.

    2. effective_state: instead of always passing DDAState.CONFUSED to
       generate_dda_response(), we use the room's actual current state
       (which may already be STRUGGLING or STUCK due to earlier wrong
       answers) and then escalate further based on how many times the
       hint button has been clicked in this room session.
       This means:
         1st hint click  → CONFUSED  (gentle nudge)
         2nd hint click  → STRUGGLING (analogy + explanation)
         3rd+ hint click → STUCK     (full walkthrough)
    """
    session = _get_session(user_id, session_id)
    if not session:
        session = SessionState(session_id=session_id, user_id=user_id)

    new_state = _dda.set_help_requested(session, room_id)
    room = session.get_room(room_id)

    # ── Fix 1: use last wrong answer for targeted RAG ─────────────────────
    last_wrong = next(
        (r.answer_given for r in reversed(room.history) if not r.is_correct),
        ""          # fallback: empty string still works for Track B
    )

    # ── Fix 2: escalate state on repeated hint clicks ─────────────────────
    # Count how many times help has been explicitly requested this room.
    # help_count is derived from the history — each time set_help_requested()
    # is called it doesn't add a history record, so we track via a simple
    # attribute we attach to the room object in memory.
    if not hasattr(room, '_hint_count'):
        room._hint_count = 0
    room._hint_count += 1

    if room._hint_count >= 3:
        effective_state = DDAState.STUCK
    elif room._hint_count >= 2:
        effective_state = DDAState.STRUGGLING
    else:
        # Use the higher of CONFUSED or the room's current state
        state_priority = {
            DDAState.FLOW:       0,
            DDAState.CONFUSED:   1,
            DDAState.STRUGGLING: 2,
            DDAState.STUCK:      3,
        }
        effective_state = (
            new_state
            if state_priority.get(new_state, 0) >= 1
            else DDAState.CONFUSED
        )

    print(f"[HINT] room={room_id} hint_count={room._hint_count} "
          f"effective_state={effective_state} last_wrong={last_wrong[:40]!r}")

    doctor_k_msg = "Hint unavailable — recalibrating."
    try:
        rag = get_rag()
        result = rag.retrieve_for_dda(
            player_state=effective_state.lower(),
            wrong_answer=last_wrong if last_wrong else "help requested",
            room=room_id,
        )
        doctor_k_msg = generate_dda_response(
            dda_state=effective_state,
            persona_stage=session.persona_stage,
            room_id=room_id,
            wrong_answer=last_wrong,
            hint_chunks=result.combined,
        )
    except Exception as e:
        print(f"[ERROR] /room/{room_id}/hint generation failed: {e!r}")

    _save(session)
    return {"dda_state": new_state, "doctor_k_msg": doctor_k_msg}


@app.post("/api/room/{room_id}/complete")
def complete_room(room_id: str, req: CompleteRoomRequest):
    session = _get_session(req.user_id, req.session_id)
    if not session:
        session = SessionState(session_id=req.session_id, user_id=req.user_id)
    new_persona = _dda.mark_room_complete(session, room_id, req.score)
    try:
        flush_dda_events(session, room_id)
    except Exception:
        pass
    _save(session)
    return {"next_room": session.current_room, "persona_stage": new_persona}


@app.post("/api/prompt/evaluate")
def evaluate_prompt_endpoint(req: EvaluatePromptRequest):
    try:
        return evaluate_prompt(req.prompt, req.task)
    except Exception as e:
        print(f"[ERROR] /prompt/evaluate failed: {e!r}")
        return {
            "scores": {"role": 0, "task": 0, "constraints": 0,
                       "example": 0, "clarity": 0},
            "total": 0, "missing": [],
            "suggestion": "Evaluation error. Try again.",
        }


@app.post("/api/quiz/submit")
def submit_quiz(req: SubmitQuizRequest):
    session = _get_session(req.user_id, req.session_id)
    if not session:
        session = SessionState(session_id=req.session_id, user_id=req.user_id)
    new_persona = _dda.mark_quiz_complete(session, req.score)
    _save(session)
    passed = req.score >= 0.75
    return {"passed": passed, "score": req.score,
            "certificate": session.certificate, "persona_stage": new_persona}


@app.get("/api/progress/{user_id}")
def get_progress(user_id: str, session_id: str):
    session = _get_session(user_id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    rooms_out = {
        rid: {"completed": r.completed, "score": r.score,
              "attempts": r.attempts, "dda_state": r.current_state}
        for rid, r in session.rooms.items()
    }
    return {
        "session_id":     session.session_id,
        "current_room":   session.current_room,
        "persona_stage":  session.persona_stage,
        "rooms":          rooms_out,
        "quiz_completed": session.quiz_completed,
        "quiz_score":     session.quiz_score,
        "certificate":    session.certificate,
    }


@app.get("/health")
def health():
    return {"status": "ok", "version": "2.3.0",
            "firebase": _firebase_available}
