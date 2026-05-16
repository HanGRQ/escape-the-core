"""
M3 — DDA Unit Tests
Tests all state transitions in isolation (no Firebase, no API).

Usage:
    cd escape-the-core/backend
    python scripts/test_dda.py
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.dda import DDAEngine, DDAState, PersonaStage, SessionState


def ok(label: str):
    print(f"  ✓  {label}")

def fail(label: str, got, expected):
    print(f"  ✗  {label}")
    print(f"       expected={expected}  got={got}")
    return False


def assert_state(label, engine, session, room, correct, ms, answer, expected_state):
    state, _ = engine.process_attempt(session, room, correct, ms, answer)
    if state == expected_state:
        ok(label)
        return True
    return fail(label, state, expected_state)


def main():
    engine = DDAEngine()
    all_ok = True

    print("\n── State transitions ────────────────────────────────────────────")

    # FLOW: correct answers stay FLOW
    s = SessionState(session_id="t1", user_id="u1")
    all_ok &= assert_state("Correct answer → FLOW", engine, s, "room_1", True, 2000, "Virtual Assistants", DDAState.FLOW)
    all_ok &= assert_state("Another correct → FLOW", engine, s, "room_1", True, 1800, "Sentiment Analysis", DDAState.FLOW)

    # CONFUSED: slow response (needs ≥3 timings)
    s = SessionState(session_id="t2", user_id="u2")
    engine.process_attempt(s, "room_1", True, 2000, "a")   # baseline
    engine.process_attempt(s, "room_1", True, 2000, "b")   # baseline
    engine.process_attempt(s, "room_1", True, 2000, "c")   # baseline
    state, _ = engine.process_attempt(s, "room_1", False, 9000, "d")  # >2× avg → CONFUSED
    if state == DDAState.CONFUSED:
        ok("Slow response (9s vs 2s avg) → CONFUSED")
    else:
        all_ok = fail("Slow response → CONFUSED", state, DDAState.CONFUSED)

    # CONFUSED: help button
    s = SessionState(session_id="t3", user_id="u3")
    engine.set_help_requested(s, "room_2")
    engine.process_attempt(s, "room_2", False, 2000, "wrong")
    state = s.rooms["room_2"].current_state
    if state in (DDAState.CONFUSED, DDAState.STRUGGLING):
        ok("Help requested → CONFUSED or higher")
    else:
        all_ok = fail("Help requested", state, DDAState.CONFUSED)

    # STRUGGLING: 2 consecutive errors
    s = SessionState(session_id="t4", user_id="u4")
    engine.process_attempt(s, "room_1", False, 2000, "wrong1")
    all_ok &= assert_state("1 error → not STUCK", engine, s, "room_1", False, 2000, "wrong2", DDAState.STRUGGLING)

    # STUCK: 3 consecutive errors
    s = SessionState(session_id="t5", user_id="u5")
    engine.process_attempt(s, "room_2", False, 1000, "e1")
    engine.process_attempt(s, "room_2", False, 1000, "e2")
    all_ok &= assert_state("3rd consecutive error → STUCK", engine, s, "room_2", False, 1000, "e3", DDAState.STUCK)

    # Reset after correct answer
    s = SessionState(session_id="t6", user_id="u6")
    engine.process_attempt(s, "room_3", False, 1000, "e1")
    engine.process_attempt(s, "room_3", False, 1000, "e2")
    all_ok &= assert_state("Correct after errors → FLOW", engine, s, "room_3", True, 1000, "correct", DDAState.FLOW)

    print("\n── Persona progression ──────────────────────────────────────────")

    s = SessionState(session_id="t7", user_id="u7")
    p = engine.mark_room_complete(s, "room_1", 1.0)
    if p == PersonaStage.COLLABORATIVE:
        ok("Room 1 complete → COLLABORATIVE")
    else:
        all_ok = fail("Room 1 persona", p, PersonaStage.COLLABORATIVE)

    p = engine.mark_room_complete(s, "room_2", 0.8)
    if p == PersonaStage.CARING:
        ok("Room 2 complete → CARING")
    else:
        all_ok = fail("Room 2 persona", p, PersonaStage.CARING)

    p = engine.mark_room_complete(s, "room_3", 0.9)
    if p == PersonaStage.ALLY:
        ok("Room 3 complete → ALLY")
    else:
        all_ok = fail("Room 3 persona", p, PersonaStage.ALLY)

    p = engine.mark_quiz_complete(s, 9/12)
    if p == PersonaStage.FULL_UNLOCK and s.certificate:
        ok("Quiz pass (≥75%) → FULL_UNLOCK + certificate=True")
    else:
        all_ok = fail("Quiz pass", (p, s.certificate), (PersonaStage.FULL_UNLOCK, True))

    s2 = SessionState(session_id="t8", user_id="u8")
    p = engine.mark_quiz_complete(s2, 6/12)
    if not s2.certificate:
        ok("Quiz fail (<75%) → certificate=False")
    else:
        all_ok = fail("Quiz fail", s2.certificate, False)

    print("\n── Room navigation ──────────────────────────────────────────────")
    s = SessionState(session_id="t9", user_id="u9")
    engine.mark_room_complete(s, "room_1", 1.0)
    if s.current_room == "room_2":
        ok("After room_1 complete → current_room=room_2")
    else:
        all_ok = fail("Navigation room_1→room_2", s.current_room, "room_2")

    engine.mark_room_complete(s, "room_2", 1.0)
    engine.mark_room_complete(s, "room_3", 1.0)
    if s.current_room == "quiz":
        ok("After room_3 complete → current_room=quiz")
    else:
        all_ok = fail("Navigation room_3→quiz", s.current_room, "quiz")

    print(f"\n{'═'*60}")
    if all_ok:
        print("  ✓  All DDA tests passed — state machine verified")
    else:
        print("  ✗  Some tests failed")
    print('═'*60)


if __name__ == "__main__":
    main()
