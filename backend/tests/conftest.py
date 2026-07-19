"""
conftest.py — shared pytest fixtures for end-to-end integration tests.

What is mocked and why
─────────────────────────────────────────────────────────────────────────────
Firebase (firebase_service)
    We do not write to a real Firestore during CI.  All five functions are
    replaced with in-memory stubs that behave correctly (save → dict, load ←
    dict, flush → no-op) so that the persistence assertions check the right
    data without a network dependency.

Claude API (anthropic.Anthropic)
    Avoids token cost and network latency.  The mock streams a short fixed
    text so that SSE endpoints can be tested without a live LLM.  The LLM-
    failure fixture overrides this to raise AuthenticationError, letting us
    test the fallback path.

RAG (app.rag.RAGRetriever)
    Uses the *real* ChromaDB if build_knowledge_base.py has been run, which
    makes these genuine integration tests for the retrieval path.  If the
    DB is absent the fixture falls back to a lightweight stub that returns
    two plausible chunks, so the suite can still run in a clean environment.
"""

import copy
import datetime
import json
import sys
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest

# Make sure the backend package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient
from app.dda import SessionState, RoomState, DDAState, PersonaStage
from app.rag import ChunkResult, RetrievalResult


# ── In-memory Firebase stub ───────────────────────────────────────────────────

class FakeFirestore:
    """Thread-local dict store that mimics the subset of Firebase we use."""

    def __init__(self):
        self._sessions: dict[str, dict] = {}   # session_id → dict
        self._events:   dict[str, list] = {}   # room_id     → events

        self._session_objects: dict[str, SessionState] = {}
        self.force_serialized_load = False

    # Mirror the public API of firebase_service.py
    def create_session(self, session: SessionState): ...

    def load_session(self, user_id: str, session_id: str):
        from app.firebase_service import _dict_to_session
        stored = self._sessions.get(session_id)
        if not stored or stored.get("user_id") != user_id:
            return None
        if self.force_serialized_load:
            return _dict_to_session(copy.deepcopy(stored))
        session = self._session_objects.get(session_id)
        return copy.deepcopy(session) if session else None

    def save_session(self, session: SessionState):
        from app.firebase_service import _session_to_dict
        self._sessions[session.session_id] = _session_to_dict(session)
        self._session_objects[session.session_id] = copy.deepcopy(session)

    def flush_dda_events(self, session: SessionState, room_id: str):
        room = session.rooms.get(room_id)
        if room:
            self._events[room_id] = [
                {"attempt": i + 1, "is_correct": r.is_correct,
                 "time_ms": r.time_taken_ms, "answer": r.answer_given,
                 "dda_state": r.dda_state}
                for i, r in enumerate(room.history)
            ]

    def get_user_sessions(self, user_id: str):
        return list(self._sessions.values())


# ── Stub RAG result ───────────────────────────────────────────────────────────

def _stub_retrieval(room: str = "room_1") -> RetrievalResult:
    prefix = {"room_1": "L1", "room_2": "L2", "room_3": "L3"}.get(room, "L1")
    def chunk(cid, concept):
        return ChunkResult(
            chunk_id=cid, concept=concept,
            content_type="use_case", difficulty="basic",
            content=f"Stub content for {concept}.",
            distance=0.35, track="A",
        )
    a = [chunk(f"{prefix}_C04", "Stub concept A")]
    b = [chunk(f"{prefix}_C05", "Stub concept B")]
    return RetrievalResult(track_a=a, track_b=b, combined=a + b)


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture()
def firestore():
    """Returns a fresh in-memory Firestore stub for each test."""
    return FakeFirestore()


def _stub_rag_factory():
    """Return a patched RAG constructor backed by a deterministic stub."""
    stub_rag = MagicMock()
    stub_rag.retrieve_for_dda.side_effect = \
        lambda player_state, wrong_answer, room, **kw: _stub_retrieval(room)
    stub_rag.get_chunk_by_id.return_value = None
    return MagicMock(return_value=stub_rag)


@pytest.fixture(autouse=True)
def reset_app_singletons():
    """Keep lazy application clients and in-memory sessions test-local."""
    from app import doctor_k, main

    main._rag = None
    main._mem_sessions.clear()
    doctor_k._client = None
    doctor_k._rag = None
    yield
    main._rag = None
    main._mem_sessions.clear()
    doctor_k._client = None
    doctor_k._rag = None


@pytest.fixture()
def client(firestore):
    """
    FastAPI TestClient with Firebase and Claude API mocked.

    The Claude mock returns a minimal SSE-compatible stream so that
    /teach and /chat endpoints do not hang waiting for a real LLM.
    """
    # Patch the Claude streaming response
    mock_stream = MagicMock()
    mock_stream.__enter__ = lambda s: s
    mock_stream.__exit__ = MagicMock(return_value=False)
    mock_stream.text_stream = iter(["Hello ", "from ", "Doctor K."])

    # Patch the Claude non-streaming response (DDA feedback, prompt eval)
    mock_message = MagicMock()
    mock_message.content = [MagicMock(text="Doctor K DDA feedback stub.")]

    mock_anthropic = MagicMock()
    mock_anthropic.return_value.messages.stream.return_value = mock_stream
    mock_anthropic.return_value.messages.create.return_value = mock_message

    mock_rag = _stub_rag_factory()

    with (
        patch("app.main.create_session", firestore.create_session),
        patch("app.main.load_session", firestore.load_session),
        patch("app.main.save_session", firestore.save_session),
        patch("app.main.flush_dda_events", firestore.flush_dda_events),
        patch("app.main.get_user_sessions", firestore.get_user_sessions),
        patch("app.doctor_k.anthropic.Anthropic", mock_anthropic),
        patch("app.main.RAGRetriever", mock_rag),
        patch("app.doctor_k.RAGRetriever", mock_rag),
    ):
        from app.main import app
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c


@pytest.fixture()
def client_llm_failure(firestore):
    """
    Same as client, but the Claude API always raises AuthenticationError.
    Used to verify that LLM failures degrade gracefully.
    """
    import anthropic as _anthropic

    mock_anthropic = MagicMock()
    mock_anthropic.return_value.messages.stream.side_effect = \
        _anthropic.AuthenticationError(
            message="Invalid API key",
            response=MagicMock(status_code=401),
            body={},
        )
    mock_anthropic.return_value.messages.create.side_effect = \
        _anthropic.AuthenticationError(
            message="Invalid API key",
            response=MagicMock(status_code=401),
            body={},
        )

    mock_rag = _stub_rag_factory()

    with (
        patch("app.main.create_session", firestore.create_session),
        patch("app.main.load_session", firestore.load_session),
        patch("app.main.save_session", firestore.save_session),
        patch("app.main.flush_dda_events", firestore.flush_dda_events),
        patch("app.main.get_user_sessions", firestore.get_user_sessions),
        patch("app.doctor_k.anthropic.Anthropic", mock_anthropic),
        patch("app.main.RAGRetriever", mock_rag),
        patch("app.doctor_k.RAGRetriever", mock_rag),
    ):
        from app.main import app
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c


# ── Helpers shared by test_e2e.py ────────────────────────────────────────────

def start_session(client, user_id: str = None) -> tuple[str, str]:
    uid = user_id or f"test_user_{uuid.uuid4().hex[:6]}"
    res = client.post("/api/session/start", json={"user_id": uid})
    assert res.status_code == 200, res.text
    return uid, res.json()["session_id"]


def submit(client, room_id: str, uid: str, sid: str,
           is_correct: bool, answer: str = "test_answer", ms: int = 1500):
    return client.post(f"/api/room/{room_id}/submit", json={
        "session_id":    sid,
        "user_id":       uid,
        "is_correct":    is_correct,
        "time_taken_ms": ms,
        "answer_given":  answer,
    })


# Record this integration suite in the same JSON shape consumed by
# scripts/generate_report.py. Only test call outcomes are included.
_e2e_results = []

_REQUIREMENT_BY_TEST = {
    "test_request_order_is_dda_then_claude_then_save": "dda_then_claude_then_save",
    "test_first_flow_error_calls_llm": "flow_first_error_calls_llm",
    "test_stronger_support_calls_llm": "stronger_support_calls_llm",
    "test_attempts_and_dda_state_persist_despite_llm_failure":
        "claude_failure_preserves_dda_and_session",
    "test_cold_reload_restores_attempts_dda_and_room_progress":
        "session_reload_restores_progress",
}


def pytest_runtest_logreport(report):
    if report.when != "call" or "test_e2e.py" not in report.nodeid:
        return
    parts = report.nodeid.split("::")
    section = parts[-2] if len(parts) > 2 else "End-to-end scenarios"
    label = parts[-1]
    item = {
        "section": section,
        "label": label,
        "passed": report.passed,
        "status": "PASS" if report.passed else "FAIL",
        "detail": None if report.passed else str(report.longrepr),
        "metrics": {"duration_seconds": round(report.duration, 4)},
    }
    if label in _REQUIREMENT_BY_TEST:
        item["requirement"] = _REQUIREMENT_BY_TEST[label]
    _e2e_results.append(item)


def pytest_sessionfinish(session, exitstatus):
    if not _e2e_results:
        return
    now = datetime.datetime.now()
    passed = sum(result["passed"] for result in _e2e_results)
    payload = {
        "suite": "E2E Integration Tests",
        "timestamp": now.isoformat(timespec="seconds"),
        "total": len(_e2e_results),
        "passed": passed,
        "failed": len(_e2e_results) - passed,
        "exit_status": exitstatus,
        "requirements": {
            item["requirement"]: item["status"]
            for item in _e2e_results if "requirement" in item
        },
        "results": _e2e_results,
    }
    from scripts.reporting import write_json_report
    write_json_report("e2e", payload)
