"""
End-to-End Integration Tests
Five high-value scenarios that each exercise a complete slice of the
system: HTTP layer → DDA engine → RAG retrieval → LLM feedback →
Firestore persistence → session reload.

Run:
    cd escape-the-core/backend
    pip install pytest
    pytest tests/test_e2e.py -v

All external services (Firebase, Claude API) are replaced by in-memory
stubs defined in conftest.py.  RAG uses the real ChromaDB when it is
available (build_knowledge_base.py has been run), otherwise falls back
to a lightweight stub so the suite can run in a clean environment.

Scenario inventory
1. FLOW — correct answer keeps state FLOW and saves progress to Firestore
2. STRUGGLING — two consecutive wrong answers escalate state and return scaffold
3. HINT / CONFUSED — help-seeking signal triggers CONFUSED and returns content
4. SESSION RELOAD — refreshing the page restores room progress and DDA state
5. LLM FAILURE FALLBACK — Claude API error returns a safe message without
                           losing game progress or returning HTTP 500
"""

import pytest
from tests.conftest import start_session, submit


# ═══════════════════════════════════════════════════════════════════════════════
# Scenario 1 — FLOW
# Correct answer → state stays FLOW, scaffold=False, progress persisted
# ═══════════════════════════════════════════════════════════════════════════════

class TestScenario1_Flow:
    """
    A player answers correctly on the first attempt.

    Expected behaviour
    ──────────────────
    • HTTP 200
    • dda_state = "FLOW"
    • show_scaffold = False  (no intervention needed)
    • doctor_k_msg is empty  (Doctor K is silent when the player is doing well)
    • Firestore save_session was called with the correct room state
    """

    def test_correct_answer_returns_flow(self, client):
        uid, sid = start_session(client)
        res = submit(client, "room_1", uid, sid, is_correct=True,
                     answer="virtual_assistants")

        assert res.status_code == 200
        body = res.json()
        assert body["dda_state"]     == "FLOW"
        assert body["show_scaffold"] is False
        assert body.get("doctor_k_msg", "") == ""

    def test_correct_answer_increments_attempt_count(self, client, firestore):
        uid, sid = start_session(client)
        submit(client, "room_1", uid, sid, is_correct=True)

        # Firestore should have saved a session with 1 attempt in room_1
        saved = firestore._sessions.get(sid)
        assert saved is not None, "Session was not saved to Firestore"
        room_data = saved.get("rooms", {}).get("room_1", {})
        assert room_data.get("attempts") == 1

    def test_correct_answer_does_not_set_help_requested(self, client, firestore):
        uid, sid = start_session(client)
        submit(client, "room_1", uid, sid, is_correct=True)

        saved = firestore._sessions.get(sid)
        room_data = saved.get("rooms", {}).get("room_1", {})
        assert room_data.get("help_requested", False) is False

    def test_flow_state_persisted_in_firestore(self, client, firestore):
        uid, sid = start_session(client)
        submit(client, "room_1", uid, sid, is_correct=True)

        saved = firestore._sessions.get(sid)
        room_data = saved.get("rooms", {}).get("room_1", {})
        assert room_data.get("current_state") == "FLOW"


# ═══════════════════════════════════════════════════════════════════════════════
# Scenario 2 — STRUGGLING
# Two consecutive wrong answers escalate state and return scaffold + feedback
# ═══════════════════════════════════════════════════════════════════════════════

class TestScenario2_Struggling:
    """
    A player submits two wrong answers in a row.

    Expected behaviour
    ──────────────────
    • After 1st wrong answer: dda_state may be FLOW or CONFUSED
    • After 2nd wrong answer: dda_state = "STRUGGLING", show_scaffold = True
    • doctor_k_msg is a non-empty string (DDA-triggered feedback from Doctor K)
    • Firestore records consecutive_errors = 2 and current_state = STRUGGLING
    """

    def test_two_errors_produce_struggling(self, client):
        uid, sid = start_session(client)
        submit(client, "room_1", uid, sid, is_correct=False, answer="wrong_1")
        res = submit(client, "room_1", uid, sid, is_correct=False, answer="wrong_2")

        assert res.status_code == 200
        body = res.json()
        assert body["dda_state"]     == "STRUGGLING"
        assert body["show_scaffold"] is True

    def test_struggling_returns_doctor_k_message(self, client):
        uid, sid = start_session(client)
        submit(client, "room_1", uid, sid, is_correct=False)
        res = submit(client, "room_1", uid, sid, is_correct=False)

        msg = res.json().get("doctor_k_msg", "")
        assert isinstance(msg, str) and len(msg) > 0, \
            "Expected non-empty Doctor K message when STRUGGLING"

    def test_struggling_state_persisted(self, client, firestore):
        uid, sid = start_session(client)
        submit(client, "room_1", uid, sid, is_correct=False)
        submit(client, "room_1", uid, sid, is_correct=False)

        saved = firestore._sessions.get(sid)
        room_data = saved.get("rooms", {}).get("room_1", {})
        assert room_data.get("consecutive_errors") == 2
        assert room_data.get("current_state")      == "STRUGGLING"

    def test_three_errors_produce_stuck(self, client):
        uid, sid = start_session(client)
        for _ in range(3):
            res = submit(client, "room_1", uid, sid, is_correct=False)
        assert res.json()["dda_state"] == "STUCK"

    def test_correct_answer_after_struggling_returns_flow(self, client):
        uid, sid = start_session(client)
        submit(client, "room_1", uid, sid, is_correct=False)
        submit(client, "room_1", uid, sid, is_correct=False)
        res = submit(client, "room_1", uid, sid, is_correct=True)

        assert res.json()["dda_state"] == "FLOW"


# ═══════════════════════════════════════════════════════════════════════════════
# Scenario 3 — HINT / CONFUSED
# Player clicks HINT → help_requested flag set, state ≥ CONFUSED, content returned
# ═══════════════════════════════════════════════════════════════════════════════

class TestScenario3_Hint:
    """
    A player clicks the HINT button during a room task.

    Expected behaviour
    ──────────────────
    • HTTP 200
    • dda_state is CONFUSED (or higher if errors preceded the hint)
    • doctor_k_msg is non-empty
    • help_requested is True in Firestore
    • Repeated hint clicks escalate the intervention level
    """

    def _hint(self, client, room_id, uid, sid):
        return client.get(f"/api/room/{room_id}/hint",
                          params={"session_id": sid, "user_id": uid})

    def test_hint_returns_confused_state(self, client):
        uid, sid = start_session(client)
        res = self._hint(client, "room_1", uid, sid)

        assert res.status_code == 200
        body = res.json()
        assert body["dda_state"] in ("CONFUSED", "STRUGGLING", "STUCK"), \
            f"Expected ≥ CONFUSED, got {body['dda_state']}"

    def test_hint_returns_doctor_k_message(self, client):
        uid, sid = start_session(client)
        res = self._hint(client, "room_1", uid, sid)

        msg = res.json().get("doctor_k_msg", "")
        assert isinstance(msg, str) and len(msg) > 0, \
            "Expected non-empty hint message"

    def test_hint_sets_help_requested_in_firestore(self, client, firestore):
        uid, sid = start_session(client)
        self._hint(client, "room_1", uid, sid)

        saved = firestore._sessions.get(sid)
        room_data = saved.get("rooms", {}).get("room_1", {})
        assert room_data.get("help_requested") is True, \
            "help_requested flag was not persisted to Firestore"

    def test_repeated_hints_escalate_message_not_error(self, client):
        """Three hint clicks should not crash and should each return content."""
        uid, sid = start_session(client)
        for _ in range(3):
            res = self._hint(client, "room_1", uid, sid)
            assert res.status_code == 200
            assert len(res.json().get("doctor_k_msg", "")) > 0

    def test_hint_after_wrong_answer_uses_last_wrong_answer(self, client):
        """
        After a wrong answer, the hint endpoint should produce a message
        targeted at the specific wrong answer (not a generic placeholder).
        The raw message content is LLM-generated, so we only assert that
        the response is non-empty and the HTTP status is 200.
        """
        uid, sid = start_session(client)
        submit(client, "room_1", uid, sid, is_correct=False,
               answer="I thought this was question_answering")
        res = self._hint(client, "room_1", uid, sid)

        assert res.status_code == 200
        assert len(res.json().get("doctor_k_msg", "")) > 0


# ═══════════════════════════════════════════════════════════════════════════════
# Scenario 4 — SESSION RELOAD
# Refreshing the page restores room progress and DDA state from Firestore
# ═══════════════════════════════════════════════════════════════════════════════

class TestScenario4_SessionReload:
    """
    A player makes progress, then "refreshes" (a new session/start call with
    the same user_id is made).  The existing session should be resumed with
    all prior DDA state intact.

    This tests the Firebase persistence round-trip:
        submit × N  →  save_session  →  new session/start
        →  load_session  →  state matches prior session
    """

    def test_existing_incomplete_session_is_resumed(self, client, firestore):
        uid, sid = start_session(client)
        # Make progress: two wrong answers → STRUGGLING
        submit(client, "room_1", uid, sid, is_correct=False)
        submit(client, "room_1", uid, sid, is_correct=False)

        # Simulate page refresh: same user_id, new session/start call
        res2 = client.post("/api/session/start", json={"user_id": uid})
        assert res2.status_code == 200
        body2 = res2.json()

        # The resumed session should be the same one, not a new blank session
        assert body2["session_id"] == sid, \
            "Expected existing session to be resumed, got a new session"

    def test_resumed_session_retains_dda_state(self, client, firestore):
        uid, sid = start_session(client)
        submit(client, "room_1", uid, sid, is_correct=False)
        submit(client, "room_1", uid, sid, is_correct=False)

        # Reload via progress endpoint (frontend would call this after session/start)
        res = client.get(f"/api/progress/{uid}", params={"session_id": sid})
        assert res.status_code == 200
        body = res.json()

        room = body.get("rooms", {}).get("room_1", {})
        assert room.get("dda_state") == "STRUGGLING", \
            f"Expected DDA state STRUGGLING after reload, got {room.get('dda_state')}"

    def test_resumed_session_retains_attempt_count(self, client, firestore):
        uid, sid = start_session(client)
        submit(client, "room_1", uid, sid, is_correct=True)
        submit(client, "room_1", uid, sid, is_correct=False)
        submit(client, "room_1", uid, sid, is_correct=True)

        res = client.get(f"/api/progress/{uid}", params={"session_id": sid})
        room = res.json().get("rooms", {}).get("room_1", {})
        assert room.get("attempts") == 3, \
            f"Expected 3 attempts after reload, got {room.get('attempts')}"

    def test_dda_events_flushed_on_room_complete(self, client, firestore):
        uid, sid = start_session(client)
        submit(client, "room_1", uid, sid, is_correct=False)
        submit(client, "room_1", uid, sid, is_correct=True)

        # Complete the room — this should trigger flush_dda_events
        res = client.post("/api/room/room_1/complete", json={
            "session_id": sid, "user_id": uid, "score": 1.0,
        })
        assert res.status_code == 200

        # Verify events were flushed to Firestore
        events = firestore._events.get("room_1", [])
        assert len(events) == 2, \
            f"Expected 2 DDA events flushed, got {len(events)}"
        assert events[0]["is_correct"] is False
        assert events[1]["is_correct"] is True


# ═══════════════════════════════════════════════════════════════════════════════
# Scenario 5 — LLM FAILURE FALLBACK
# Claude API error returns a safe message; game progress is not lost
# ═══════════════════════════════════════════════════════════════════════════════

class TestScenario5_LLMFailure:
    """
    The Claude API raises an AuthenticationError on every call.

    Expected behaviour
    ──────────────────
    • submit endpoint returns HTTP 200 (not 500)
    • dda_state is correctly computed by the DDA engine (independent of LLM)
    • show_scaffold is correct
    • doctor_k_msg is the safe fallback string (not an empty response or crash)
    • Game progress is still saved to Firestore (session not lost)
    • The teach and chat SSE endpoints emit an error event instead of crashing
    """

    def test_submit_returns_200_despite_llm_failure(self, client_llm_failure):
        uid, sid = start_session(client_llm_failure)
        res = submit(client_llm_failure, "room_1", uid, sid, is_correct=False)

        assert res.status_code == 200, \
            f"Expected 200 even with LLM failure, got {res.status_code}"

    def test_dda_state_correct_despite_llm_failure(self, client_llm_failure):
        uid, sid = start_session(client_llm_failure)
        submit(client_llm_failure, "room_1", uid, sid, is_correct=False)
        res = submit(client_llm_failure, "room_1", uid, sid, is_correct=False)

        body = res.json()
        # DDA computation is LLM-independent — must still return STRUGGLING
        assert body["dda_state"]     == "STRUGGLING"
        assert body["show_scaffold"] is True

    def test_fallback_message_returned_on_llm_failure(self, client_llm_failure):
        uid, sid = start_session(client_llm_failure)
        submit(client_llm_failure, "room_1", uid, sid, is_correct=False)
        res = submit(client_llm_failure, "room_1", uid, sid, is_correct=False)

        msg = res.json().get("doctor_k_msg", "")
        # Should be the hardcoded fallback from main.py, not an empty string
        assert isinstance(msg, str) and len(msg) > 0, \
            "Expected a non-empty fallback message when LLM fails"

    def test_session_saved_despite_llm_failure(self, client_llm_failure, firestore):
        uid, sid = start_session(client_llm_failure)
        submit(client_llm_failure, "room_1", uid, sid, is_correct=False)

        saved = firestore._sessions.get(sid)
        assert saved is not None, \
            "Session was not saved to Firestore despite LLM failure"
        assert "room_1" in saved.get("rooms", {}), \
            "Room state missing from persisted session"

    def test_attempts_and_dda_state_persist_despite_llm_failure(
            self, client_llm_failure, firestore):
        uid, sid = start_session(client_llm_failure)
        submit(client_llm_failure, "room_1", uid, sid, is_correct=False)
        submit(client_llm_failure, "room_1", uid, sid, is_correct=False)

        room = firestore._sessions[sid]["rooms"]["room_1"]
        assert room["attempts"] == 2
        assert room["consecutive_errors"] == 2
        assert room["current_state"] == "STRUGGLING"

    def test_teach_sse_emits_error_event_on_llm_failure(self, client_llm_failure):
        uid, sid = start_session(client_llm_failure)
        res = client_llm_failure.get("/api/room/room_1/teach",
                                     params={"session_id": sid, "user_id": uid})

        # SSE always returns 200 (the error is inside the stream body)
        assert res.status_code == 200
        body = res.text
        # The stream should contain an error event, not hang or 500
        assert "event: error" in body, \
            "Expected SSE error event when LLM fails during teaching"

    def test_hint_returns_200_with_fallback_on_llm_failure(self, client_llm_failure):
        uid, sid = start_session(client_llm_failure)
        res = client_llm_failure.get("/api/room/room_1/hint",
                                     params={"session_id": sid, "user_id": uid})

        assert res.status_code == 200
        msg = res.json().get("doctor_k_msg", "")
        assert isinstance(msg, str) and len(msg) > 0, \
            "Expected non-empty fallback hint message when LLM fails"


class TestScenario6_RequirementContracts:
    """Requirement-level checks that may expose current production gaps."""

    def test_request_order_is_dda_then_claude_then_save(self, client, monkeypatch):
        from app import main

        events = []
        real_process = main._dda.process_attempt
        real_save = main.save_session
        real_generate = main.generate_dda_response

        def process(*args, **kwargs):
            result = real_process(*args, **kwargs)
            events.append("dda")
            return result

        def save(*args, **kwargs):
            events.append("save")
            return real_save(*args, **kwargs)

        def generate(*args, **kwargs):
            events.append("claude")
            return real_generate(*args, **kwargs)

        monkeypatch.setattr(main._dda, "process_attempt", process)
        monkeypatch.setattr(main, "save_session", save)
        monkeypatch.setattr(main, "generate_dda_response", generate)

        uid, sid = start_session(client)
        events.clear()
        submit(client, "room_1", uid, sid, is_correct=False)

        assert events == ["dda", "claude", "save"]

    def test_first_flow_error_calls_llm(self, client, monkeypatch):
        from app import main

        calls = []
        real_generate = main.generate_dda_response

        def generate(*args, **kwargs):
            calls.append(kwargs.get("dda_state"))
            return real_generate(*args, **kwargs)

        monkeypatch.setattr(main, "generate_dda_response", generate)
        uid, sid = start_session(client)
        response = submit(client, "room_1", uid, sid, is_correct=False)

        assert response.json()["dda_state"] == "FLOW"
        assert response.json()["doctor_k_msg"]
        assert calls == ["FLOW"]

    def test_stronger_support_calls_llm(self, client, monkeypatch):
        from app import main

        calls = []
        real_generate = main.generate_dda_response

        def generate(*args, **kwargs):
            calls.append(kwargs.get("dda_state"))
            return real_generate(*args, **kwargs)

        monkeypatch.setattr(main, "generate_dda_response", generate)
        uid, sid = start_session(client)
        submit(client, "room_1", uid, sid, is_correct=False)
        calls.clear()
        response = submit(client, "room_1", uid, sid, is_correct=False)

        assert response.json()["dda_state"] == "STRUGGLING"
        assert calls == ["STRUGGLING"]

    def test_cold_reload_restores_attempts_dda_and_room_progress(
            self, client, firestore):
        from app import main

        uid, sid = start_session(client)
        submit(client, "room_1", uid, sid, is_correct=False)
        submit(client, "room_1", uid, sid, is_correct=False)
        complete = client.post("/api/room/room_1/complete", json={
            "session_id": sid, "user_id": uid, "score": 0.75,
        })
        assert complete.status_code == 200

        firestore.force_serialized_load = True
        main._mem_sessions.clear()
        response = client.get(f"/api/progress/{uid}", params={"session_id": sid})
        body = response.json()
        room = body["rooms"]["room_1"]

        assert body["current_room"] == "room_2"
        assert room["attempts"] == 2
        assert room["dda_state"] == "STRUGGLING"
        assert room["completed"] is True
        assert room["score"] == 0.75
