"""
M3 — FastAPI Backend
All endpoints from GDD §6.2, wired to DDA engine + RAG + Doctor K + Firebase.

Run:
    cd escape-the-core/backend
    uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations
import os
import uuid
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from app.dda import DDAEngine, DDAState, PersonaStage, SessionState
from app.rag import RAGRetriever
from app.doctor_k import generate_doctor_k_response, evaluate_prompt
from app.firebase_service import (
    create_session, load_session, save_session,
    flush_dda_events, get_user_sessions,
)

app = FastAPI(title="Escape the Core — Backend API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Singletons (initialised once at startup)
_dda     = DDAEngine()
_rag: RAGRetriever | None = None


def get_rag() -> RAGRetriever:
    global _rag
    if _rag is None:
        _rag = RAGRetriever()
    return _rag


# ── Request / Response models ─────────────────────────────────────────────────

class StartSessionRequest(BaseModel):
    user_id: str
    player_name: Optional[str] = ""

class StartSessionResponse(BaseModel):
    session_id:    str
    current_room:  str
    persona_stage: str
    message:       str           # Doctor K opening line

class SubmitAnswerRequest(BaseModel):
    session_id:    str
    user_id:       str
    is_correct:    bool
    time_taken_ms: int
    answer_given:  str
    player_name:   Optional[str] = ""

class SubmitAnswerResponse(BaseModel):
    dda_state:      str
    show_scaffold:  bool
    doctor_k_msg:   str
    persona_stage:  str
    hint_chunk_ids: list[str]

class HintResponse(BaseModel):
    dda_state:     str
    doctor_k_msg:  str
    hint_chunks:   list[dict]

class CompleteRoomRequest(BaseModel):
    session_id: str
    user_id:    str
    score:      float

class CompleteRoomResponse(BaseModel):
    next_room:     str
    persona_stage: str
    doctor_k_msg:  str

class EvaluatePromptRequest(BaseModel):
    session_id: str
    user_id:    str
    prompt:     str
    task:       Optional[str] = "system_restart_announcement"

class SubmitQuizRequest(BaseModel):
    session_id: str
    user_id:    str
    answers:    list[dict]       # [{question_id, selected, correct}]
    score:      float            # 0.0–1.0 (e.g. 9/12 = 0.75)

class ProgressResponse(BaseModel):
    session_id:     str
    current_room:   str
    persona_stage:  str
    rooms:          dict
    quiz_completed: bool
    quiz_score:     Optional[float]
    certificate:    bool


# ── Opening lines per persona (GDD §5.6) ─────────────────────────────────────

_OPENING_LINES: dict[str, str] = {
    PersonaStage.COLD:
        "System has detected an intruder. Initiating protocol transmission. "
        "The facility is in lockdown. You must repair the AI Dispatch Protocol to escape.",
    PersonaStage.COLLABORATIVE:
        "Collaborator, channel restored. Previous session data recovered. Proceeding to next sector.",
    PersonaStage.CARING:
        "Collaborator, welcome back. Your progress has been retained. Continue when ready.",
    PersonaStage.ALLY:
        "Partner. Good to have you back. The final sequence awaits.",
    PersonaStage.FULL_UNLOCK:
        "You have returned. The certification record is preserved. Proceed.",
}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/api/session/start", response_model=StartSessionResponse)
def start_session(req: StartSessionRequest):
    """
    GDD §6.2 — POST /api/session/start
    Creates new session or resumes the most recent incomplete session.
    """
    existing = get_user_sessions(req.user_id)
    incomplete = [s for s in existing if not s.get("certificate") and not s.get("quiz_completed")]

    if incomplete:
        # Resume most recent
        latest = max(incomplete, key=lambda s: s.get("session_id", ""))
        session = load_session(req.user_id, latest["session_id"])
        opening = _personalised_opening(session)
    else:
        session = SessionState(
            session_id=str(uuid.uuid4()),
            user_id=req.user_id,
        )
        create_session(session)
        opening = _OPENING_LINES[PersonaStage.COLD]

    return StartSessionResponse(
        session_id=session.session_id,
        current_room=session.current_room,
        persona_stage=session.persona_stage,
        message=opening,
    )


@app.post("/api/room/{room_id}/submit", response_model=SubmitAnswerResponse)
def submit_answer(room_id: str, req: SubmitAnswerRequest):
    """GDD §6.2 — POST /api/room/{id}/submit"""
    session = _load_or_404(req.user_id, req.session_id)
    rag = get_rag()

    new_state, show_scaffold = _dda.process_attempt(
        session=session,
        room_id=room_id,
        is_correct=req.is_correct,
        time_taken_ms=req.time_taken_ms,
        answer_given=req.answer_given,
    )

    # Retrieve hint chunks for STRUGGLING / STUCK (RAG call)
    hint_chunks = []
    if new_state in (DDAState.STRUGGLING, DDAState.STUCK):
        result = rag.retrieve_for_dda(
            player_state=new_state.lower(),
            wrong_answer=req.answer_given,
            room=room_id,
        )
        hint_chunks = result.combined

    doctor_k_msg = generate_doctor_k_response(
        dda_state=new_state,
        persona_stage=session.persona_stage,
        room_id=room_id,
        wrong_answer=req.answer_given,
        hint_chunks=hint_chunks,
        player_name=req.player_name or "",
    )

    save_session(session)

    return SubmitAnswerResponse(
        dda_state=new_state,
        show_scaffold=show_scaffold,
        doctor_k_msg=doctor_k_msg,
        persona_stage=session.persona_stage,
        hint_chunk_ids=[c.chunk_id for c in hint_chunks],
    )


@app.get("/api/room/{room_id}/hint", response_model=HintResponse)
def get_hint(room_id: str, session_id: str, user_id: str):
    """GDD §6.2 — GET /api/room/{id}/hint (player clicked Hint button)"""
    session = _load_or_404(user_id, session_id)
    rag = get_rag()

    new_state = _dda.set_help_requested(session, room_id)

    result = rag.retrieve_for_dda(
        player_state="confused",
        wrong_answer="player requested hint",
        room=room_id,
    )

    doctor_k_msg = generate_doctor_k_response(
        dda_state=DDAState.CONFUSED,
        persona_stage=session.persona_stage,
        room_id=room_id,
        wrong_answer="",
        hint_chunks=result.combined,
    )

    save_session(session)

    return HintResponse(
        dda_state=new_state,
        doctor_k_msg=doctor_k_msg,
        hint_chunks=[
            {"chunk_id": c.chunk_id, "concept": c.concept, "content": c.content}
            for c in result.combined[:2]
        ],
    )


@app.post("/api/room/{room_id}/complete", response_model=CompleteRoomResponse)
def complete_room(room_id: str, req: CompleteRoomRequest):
    """Called when player clears a room — advances persona, flushes DDA log."""
    session = _load_or_404(req.user_id, req.session_id)

    new_persona = _dda.mark_room_complete(session, room_id, req.score)
    flush_dda_events(session, room_id)
    save_session(session)

    persona_messages = {
        PersonaStage.COLLABORATIVE: "Collaborator, channel restored. Proceed.",
        PersonaStage.CARING:        "Well done. Your adaptability exceeds initial projections.",
        PersonaStage.ALLY:          "Partner, the elevator is ready. One final step.",
    }

    return CompleteRoomResponse(
        next_room=session.current_room,
        persona_stage=new_persona,
        doctor_k_msg=persona_messages.get(new_persona, "Proceeding."),
    )


@app.post("/api/prompt/evaluate")
def evaluate_prompt_endpoint(req: EvaluatePromptRequest):
    """GDD §6.2 — POST /api/prompt/evaluate (Act III prompt scoring)"""
    session = _load_or_404(req.user_id, req.session_id)
    result = evaluate_prompt(req.prompt, req.task)
    return result


@app.post("/api/quiz/submit")
def submit_quiz(req: SubmitQuizRequest):
    """GDD §6.2 — POST /api/quiz/submit"""
    session = _load_or_404(req.user_id, req.session_id)

    new_persona = _dda.mark_quiz_complete(session, req.score)
    save_session(session)

    passed = req.score >= 0.75

    closing = (
        "Final certification complete. Protocol restored. "
        "You earned your freedom with knowledge. Certificate issued."
        if passed else
        "Score insufficient for certification. Review flagged chapters and retry."
    )

    return {
        "passed":        passed,
        "score":         req.score,
        "certificate":   session.certificate,
        "persona_stage": new_persona,
        "doctor_k_msg":  closing,
    }


@app.get("/api/progress/{user_id}", response_model=ProgressResponse)
def get_progress(user_id: str, session_id: str):
    """GDD §6.2 — GET /api/progress/{uid}"""
    session = _load_or_404(user_id, session_id)

    rooms_out = {}
    for rid, room in session.rooms.items():
        rooms_out[rid] = {
            "completed": room.completed,
            "score":     room.score,
            "attempts":  room.attempts,
            "dda_state": room.current_state,
        }

    return ProgressResponse(
        session_id=session.session_id,
        current_room=session.current_room,
        persona_stage=session.persona_stage,
        rooms=rooms_out,
        quiz_completed=session.quiz_completed,
        quiz_score=session.quiz_score,
        certificate=session.certificate,
    )


@app.get("/health")
def health():
    return {"status": "ok", "service": "escape-the-core-backend"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _load_or_404(user_id: str, session_id: str) -> SessionState:
    session = load_session(user_id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


def _personalised_opening(session: SessionState) -> str:
    """GDD §6.5 — personalised opening based on previous DDA history."""
    # Find if player was stuck anywhere last session
    stuck_concepts = []
    for rid, room in session.rooms.items():
        for record in room.history:
            if record.dda_state == DDAState.STUCK:
                stuck_concepts.append(record.answer_given[:40])
                break

    base = _OPENING_LINES.get(session.persona_stage, _OPENING_LINES[PersonaStage.COLD])

    if stuck_concepts:
        concept_hint = stuck_concepts[0]
        return (
            f"{base} Last session you struggled with: \"{concept_hint}\". "
            "Let's do a quick recap before we continue."
        )
    return base
