"""
M3 — Firebase Service
Handles all Firestore reads/writes for session state and DDA logs.
GDD §6.4 data structure.

Batch-writes DDA events at room completion (not per-attempt) to minimise
Firestore operations — GDD §8.2 risk mitigation.
"""

from __future__ import annotations
import os
import json
from typing import Optional
import firebase_admin
from firebase_admin import credentials, firestore
from app.dda import SessionState, RoomState, PersonaStage, DDAState, AttemptRecord
import dataclasses

_db: Optional[firestore.Client] = None


def _get_db() -> firestore.Client:
    global _db
    if _db is not None:
        return _db

    if not firebase_admin._apps:
        # Support two init methods:
        # 1. GOOGLE_APPLICATION_CREDENTIALS env var pointing to service account JSON
        # 2. Individual env vars (for environments without a file)
        cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        if cred_path and os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
        else:
            # Build credential dict from individual env vars
            private_key = os.getenv("FIREBASE_PRIVATE_KEY", "").replace("\\n", "\n")
            cred = credentials.Certificate({
                "type": "service_account",
                "project_id":     os.getenv("FIREBASE_PROJECT_ID"),
                "private_key_id": os.getenv("FIREBASE_PRIVATE_KEY_ID"),
                "private_key":    private_key,
                "client_email":   os.getenv("FIREBASE_CLIENT_EMAIL"),
                "client_id":      os.getenv("FIREBASE_CLIENT_ID"),
                "auth_uri":       os.getenv("FIREBASE_AUTH_URI", "https://accounts.google.com/o/oauth2/auth"),
                "token_uri":      os.getenv("FIREBASE_TOKEN_URI", "https://oauth2.googleapis.com/token"),
            })
        firebase_admin.initialize_app(cred)

    _db = firestore.client()
    return _db


# ── Session CRUD ──────────────────────────────────────────────────────────────

def create_session(session: SessionState) -> None:
    try:
        db = _get_db()
        doc = _session_to_dict(session)
        db.collection("users").document(session.user_id) \
          .collection("game_progress").document(session.session_id) \
          .set(doc)
    except Exception:
        pass


def load_session(user_id: str, session_id: str) -> Optional[SessionState]:
    try:
        db = _get_db()
        snap = db.collection("users").document(user_id) \
                  .collection("game_progress").document(session_id) \
                  .get()
        if not snap.exists:
            return None
        return _dict_to_session(snap.to_dict())
    except Exception:
        return None  # Firestore unavailable — caller falls back to in-memory


def save_session(session: SessionState) -> None:
    try:
        db = _get_db()
        doc = _session_to_dict(session)
        db.collection("users").document(session.user_id) \
          .collection("game_progress").document(session.session_id) \
          .set(doc, merge=True)
    except Exception:
        pass  # Firestore unavailable — session kept in memory


def get_user_sessions(user_id: str) -> list[dict]:
    try:
        db = _get_db()
        snaps = db.collection("users").document(user_id) \
                   .collection("game_progress").stream()
        return [s.to_dict() for s in snaps]
    except Exception:
        return []


# ── DDA event batch-write (called at room completion) ─────────────────────────

def flush_dda_events(session: SessionState, room_id: str) -> None:
    try:
        db = _get_db()
        room = session.rooms.get(room_id)
        if not room:
            return
        events = [
            {
                "attempt":    i + 1,
                "is_correct": r.is_correct,
                "time_ms":    r.time_taken_ms,
                "answer":     r.answer_given,
                "dda_state":  r.dda_state,
                "timestamp":  r.timestamp,
            }
            for i, r in enumerate(room.history)
        ]
        db.collection("users").document(session.user_id) \
          .collection("game_progress").document(session.session_id) \
          .collection("dda_events").document(room_id) \
          .set({"room_id": room_id, "events": events})
    except Exception:
        pass  # Firestore unavailable


# ── Serialisation helpers ─────────────────────────────────────────────────────

def _session_to_dict(s: SessionState) -> dict:
    rooms_out = {}
    for rid, room in s.rooms.items():
        rooms_out[rid] = {
            "completed":          room.completed,
            "score":              room.score,
            "attempts":           room.attempts,
            "consecutive_errors": room.consecutive_errors,
            "current_state":      room.current_state,
            # history stored separately via flush_dda_events
        }
    return {
        "session_id":     s.session_id,
        "user_id":        s.user_id,
        "current_room":   s.current_room,
        "persona_stage":  s.persona_stage,
        "rooms":          rooms_out,
        "quiz_completed": s.quiz_completed,
        "quiz_score":     s.quiz_score,
        "certificate":    s.certificate,
    }


def _dict_to_session(d: dict) -> SessionState:
    rooms = {}
    for rid, rdata in d.get("rooms", {}).items():
        rooms[rid] = RoomState(
            room_id=rid,
            completed=rdata.get("completed", False),
            score=rdata.get("score"),
            attempts=rdata.get("attempts", 0),
            consecutive_errors=rdata.get("consecutive_errors", 0),
            current_state=rdata.get("current_state", DDAState.FLOW),
        )
    return SessionState(
        session_id=d["session_id"],
        user_id=d["user_id"],
        current_room=d.get("current_room", "room_1"),
        persona_stage=d.get("persona_stage", PersonaStage.COLD),
        rooms=rooms,
        quiz_completed=d.get("quiz_completed", False),
        quiz_score=d.get("quiz_score"),
        certificate=d.get("certificate", False),
    )
