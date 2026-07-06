"""
Complete DDA State Machine Test Suite  (with metrics output)
=============================================================
Tests every behaviour specified in GDD §5 without any network calls,
Claude API calls, or Firebase connections — pure Python logic only.

Usage:
    cd escape-the-core/backend
    python scripts/test_dda.py

Printed metrics
───────────────
Each test prints the exact numeric values used so you can see the
underlying numbers, not just pass/fail:

  • [STATE]    the DDA state returned after each attempt
  • [CONSEC]   consecutive error count at that moment
  • [RATIO]    last_response_ms / average_ms  (latency multiplier)
  • [PERSONA]  the persona stage value after a room completes
  • [SCORE]    quiz score and whether the certificate was issued
  • [DIST]     N/A here — distance metrics live in test_rag.py
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.dda import (
    DDAEngine, DDAState, PersonaStage, SessionState,
    _CONSECUTIVE_STUCK, _CONSECUTIVE_STRUGGLING,
    _SLOW_MULTIPLIER, _MIN_TIMES_FOR_SLOW,
)

# ── Helpers ───────────────────────────────────────────────────────────────────

PASS_COUNT = 0
FAIL_COUNT = 0

def ok(label):
    global PASS_COUNT; PASS_COUNT += 1
    print(f"  ✓  {label}")

def fail(label, expected, got):
    global FAIL_COUNT; FAIL_COUNT += 1
    print(f"  ✗  {label}")
    print(f"       expected : {expected}")
    print(f"       got      : {got}")

def check(label, condition, expected="True", got="False"):
    if condition: ok(label)
    else: fail(label, expected, got)

def metric(key, value, note=""):
    tag = f"[{key}]"
    print(f"       {tag:<12} {value}{'  ← ' + note if note else ''}")

def new_session(sid="s1"):
    return DDAEngine(), SessionState(session_id=sid, user_id="u1")

def attempt(engine, session, room, correct, ms, answer="ans"):
    return engine.process_attempt(session, room, correct, ms, answer)

def latency_ratio(room_state, last_ms):
    """Compute last_ms / average_of_prior_ms for display."""
    times = room_state.reaction_times
    if len(times) < 2:
        return None
    prior_avg = sum(times[:-1]) / len(times[:-1])
    return last_ms / prior_avg if prior_avg > 0 else None

def section(title):
    print(f"\n── {title} {'─' * max(0, 60 - len(title))}")

# ═══════════════════════════════════════════════════════════════════════════════
# 1. BASIC STATE TRANSITIONS
# ═══════════════════════════════════════════════════════════════════════════════
section("1. Basic state transitions")

print("  → Correct answer:")
e, s = new_session()
state, scaffold = attempt(e, s, "room_1", True, 2000)
metric("STATE", state)
metric("CONSEC", s.rooms["room_1"].consecutive_errors)
check("Correct answer → FLOW", state == DDAState.FLOW, DDAState.FLOW, state)
check("Correct answer → show_scaffold=False", not scaffold)

print("  → Two consecutive wrong answers:")
e, s = new_session()
attempt(e, s, "room_1", False, 2000)
state, scaffold = attempt(e, s, "room_1", False, 2000)
metric("STATE", state)
metric("CONSEC", s.rooms["room_1"].consecutive_errors,
       f"threshold for STRUGGLING = {_CONSECUTIVE_STRUGGLING}")
check("Two consecutive errors → STRUGGLING",
      state == DDAState.STRUGGLING, DDAState.STRUGGLING, state)
check("STRUGGLING → show_scaffold=True", scaffold)

print("  → Three consecutive wrong answers:")
e, s = new_session()
attempt(e, s, "room_1", False, 2000)
attempt(e, s, "room_1", False, 2000)
state, scaffold = attempt(e, s, "room_1", False, 2000)
metric("STATE", state)
metric("CONSEC", s.rooms["room_1"].consecutive_errors,
       f"threshold for STUCK = {_CONSECUTIVE_STUCK}")
check("Three consecutive errors → STUCK",
      state == DDAState.STUCK, DDAState.STUCK, state)
check("STUCK → show_scaffold=True", scaffold)

# ═══════════════════════════════════════════════════════════════════════════════
# 2. BOUNDARY CONDITIONS
# ═══════════════════════════════════════════════════════════════════════════════
section("2. Boundary conditions (exactly at threshold)")

e, s = new_session()
state, _ = attempt(e, s, "room_1", False, 2000)
consec = s.rooms["room_1"].consecutive_errors
metric("CONSEC", consec, "1 error — must be < STRUGGLING threshold")
metric("STATE",  state)
check("Exactly 1 error → NOT STRUGGLING",
      state != DDAState.STRUGGLING)

e, s = new_session()
for _ in range(_CONSECUTIVE_STRUGGLING - 1):
    attempt(e, s, "room_1", False, 1000)
state, _ = attempt(e, s, "room_1", False, 1000)
consec = s.rooms["room_1"].consecutive_errors
metric("CONSEC", consec, f"= {_CONSECUTIVE_STRUGGLING} (STRUGGLING threshold)")
metric("STATE",  state)
check(f"Exactly {_CONSECUTIVE_STRUGGLING} errors → STRUGGLING",
      state == DDAState.STRUGGLING, DDAState.STRUGGLING, state)

e, s = new_session()
for _ in range(_CONSECUTIVE_STUCK - 1):
    attempt(e, s, "room_1", False, 1000)
state, _ = attempt(e, s, "room_1", False, 1000)
consec = s.rooms["room_1"].consecutive_errors
metric("CONSEC", consec, f"= {_CONSECUTIVE_STUCK} (STUCK threshold)")
metric("STATE",  state)
check(f"Exactly {_CONSECUTIVE_STUCK} errors → STUCK",
      state == DDAState.STUCK, DDAState.STUCK, state)

state2, _ = attempt(e, s, "room_1", False, 1000)
metric("CONSEC", s.rooms["room_1"].consecutive_errors, "4th error — stays STUCK")
metric("STATE",  state2)
check("4th consecutive error → stays STUCK",
      state2 == DDAState.STUCK, DDAState.STUCK, state2)

# ═══════════════════════════════════════════════════════════════════════════════
# 3. LATENCY (SLOW-RESPONSE) DETECTION
# ═══════════════════════════════════════════════════════════════════════════════
section("3. Latency (slow-response) detection")

print(f"  Config: MIN_TIMES_FOR_SLOW={_MIN_TIMES_FOR_SLOW}, "
      f"SLOW_MULTIPLIER={_SLOW_MULTIPLIER}×")

# Not enough timings yet
e, s = new_session()
for _ in range(_MIN_TIMES_FOR_SLOW - 2):
    attempt(e, s, "room_1", True, 1000)
state, _ = attempt(e, s, "room_1", True, 99_000)
r1 = s.rooms["room_1"]
ratio = latency_ratio(r1, r1.reaction_times[-1])
metric("RATIO",  f"{ratio:.1f}×" if ratio else "N/A",
       f"only {len(r1.reaction_times)} timings — slow check NOT applied yet")
metric("STATE",  state)
check(f"Slow response with < {_MIN_TIMES_FOR_SLOW} prior timings → NOT CONFUSED",
      state != DDAState.CONFUSED)

# Enough timings — fires
base_ms = 2000
slow_ms = int(base_ms * _SLOW_MULTIPLIER) + 500
e, s = new_session()
for _ in range(_MIN_TIMES_FOR_SLOW - 1):
    attempt(e, s, "room_1", True, base_ms)
state, _ = attempt(e, s, "room_1", True, slow_ms)
r1 = s.rooms["room_1"]
ratio = latency_ratio(r1, r1.reaction_times[-1])
metric("RATIO",  f"{ratio:.2f}×  (threshold = {_SLOW_MULTIPLIER:.1f}×)",
       f"last={slow_ms}ms, avg_prior={base_ms}ms")
metric("STATE",  state)
check(f"Response > {_SLOW_MULTIPLIER}× average → CONFUSED",
      state == DDAState.CONFUSED, DDAState.CONFUSED, state)

# Just below threshold — should NOT fire
just_under = int(base_ms * _SLOW_MULTIPLIER) - 100
e, s = new_session()
for _ in range(_MIN_TIMES_FOR_SLOW - 1):
    attempt(e, s, "room_1", True, base_ms)
state, _ = attempt(e, s, "room_1", True, just_under)
r1 = s.rooms["room_1"]
ratio = latency_ratio(r1, r1.reaction_times[-1])
metric("RATIO",  f"{ratio:.2f}×  (threshold = {_SLOW_MULTIPLIER:.1f}×)",
       f"last={just_under}ms — just under, should NOT fire")
metric("STATE",  state)
check(f"Response just under {_SLOW_MULTIPLIER}× average → NOT CONFUSED",
      state != DDAState.CONFUSED)

# ═══════════════════════════════════════════════════════════════════════════════
# 4. HELP-SEEKING BEHAVIOUR
# ═══════════════════════════════════════════════════════════════════════════════
section("4. Help-seeking (hint button)")

e, s = new_session()
new_state = e.set_help_requested(s, "room_1")
metric("STATE",  new_state, "immediately after hint click from FLOW")
check("Help requested from FLOW → at least CONFUSED",
      new_state in (DDAState.CONFUSED, DDAState.STRUGGLING, DDAState.STUCK),
      "≥ CONFUSED", new_state)
check("help_requested flag set on room", s.rooms["room_1"].help_requested)

state, _ = attempt(e, s, "room_1", False, 1000)
metric("STATE",  state, "wrong answer after help — must stay ≥ CONFUSED")
check("Wrong answer after help_requested → stays ≥ CONFUSED",
      state in (DDAState.CONFUSED, DDAState.STRUGGLING, DDAState.STUCK))

e, s = new_session()
attempt(e, s, "room_2", False, 1000)
attempt(e, s, "room_2", False, 1000)   # STRUGGLING
new_state = e.set_help_requested(s, "room_2")
metric("STATE",  new_state, "hint from STRUGGLING — must not downgrade")
check("Help requested while STRUGGLING → stays ≥ STRUGGLING",
      new_state in (DDAState.STRUGGLING, DDAState.STUCK),
      "≥ STRUGGLING", new_state)

e, s = new_session()
for _ in range(_CONSECUTIVE_STUCK):
    attempt(e, s, "room_1", False, 1000)
new_state = e.set_help_requested(s, "room_1")
metric("STATE",  new_state, "hint from STUCK — must stay STUCK")
check("Help requested while STUCK → stays STUCK",
      new_state == DDAState.STUCK, DDAState.STUCK, new_state)

# ═══════════════════════════════════════════════════════════════════════════════
# 5. STATE RESET AFTER A CORRECT ANSWER
# ═══════════════════════════════════════════════════════════════════════════════
section("5. State reset after a correct answer")

e, s = new_session()
attempt(e, s, "room_1", False, 1000)
attempt(e, s, "room_1", False, 1000)
state, _ = attempt(e, s, "room_1", True, 1000)
consec = s.rooms["room_1"].consecutive_errors
metric("STATE",  state, "after correct answer following STRUGGLING")
metric("CONSEC", consec, "should be 0")
check("Correct answer after STRUGGLING → FLOW",
      state == DDAState.FLOW, DDAState.FLOW, state)
check("Consecutive error counter reset to 0",
      consec == 0, 0, consec)

e, s = new_session()
for _ in range(_CONSECUTIVE_STUCK):
    attempt(e, s, "room_1", False, 1000)
state, _ = attempt(e, s, "room_1", True, 1000)
consec = s.rooms["room_1"].consecutive_errors
metric("STATE",  state, "after correct answer following STUCK")
metric("CONSEC", consec, "should be 0")
check("Correct answer after STUCK → FLOW",
      state == DDAState.FLOW, DDAState.FLOW, state)

# ═══════════════════════════════════════════════════════════════════════════════
# 6. MULTI-ROOM SESSION ISOLATION
# ═══════════════════════════════════════════════════════════════════════════════
section("6. Multi-room session isolation")

e, s = new_session()
for _ in range(_CONSECUTIVE_STUCK):
    attempt(e, s, "room_1", False, 1000)
state_r2, _ = attempt(e, s, "room_2", True, 1000)
metric("room_1 STATE", s.rooms["room_1"].current_state, "should stay STUCK")
metric("room_2 STATE", state_r2, "should be FLOW (fresh)")
metric("room_2 CONSEC", s.rooms["room_2"].consecutive_errors, "should be 0")
check("room_2 starts in FLOW regardless of room_1 state",
      state_r2 == DDAState.FLOW, DDAState.FLOW, state_r2)
check("room_1 still STUCK after room_2 attempt",
      s.rooms["room_1"].current_state == DDAState.STUCK)
check("room_2 consecutive_errors is 0",
      s.rooms["room_2"].consecutive_errors == 0, 0,
      s.rooms["room_2"].consecutive_errors)

# ═══════════════════════════════════════════════════════════════════════════════
# 7. ATTEMPT HISTORY RECORDING
# ═══════════════════════════════════════════════════════════════════════════════
section("7. Attempt history recording")

e, s = new_session()
attempt(e, s, "room_1", True,  1500, "correct_ans")
attempt(e, s, "room_1", False, 3000, "wrong_ans")
room = s.rooms["room_1"]
metric("attempts",          room.attempts)
metric("history length",    len(room.history))
metric("history[0].ms",     room.history[0].time_taken_ms)
metric("history[0].correct",room.history[0].is_correct)
metric("history[1].ms",     room.history[1].time_taken_ms)
metric("history[1].correct",room.history[1].is_correct)
metric("history[1].state",  room.history[1].dda_state)

check("room.attempts counter = 2",    room.attempts == 2, 2, room.attempts)
check("history has 2 entries",        len(room.history) == 2, 2, len(room.history))
check("history[0].is_correct = True", room.history[0].is_correct)
check("history[1].is_correct = False",not room.history[1].is_correct)
check("history[0].answer_given stored",
      room.history[0].answer_given == "correct_ans")
check("history[1].time_taken_ms stored",
      room.history[1].time_taken_ms == 3000, 3000, room.history[1].time_taken_ms)

# ═══════════════════════════════════════════════════════════════════════════════
# 8. PERSONA PROGRESSION
# ═══════════════════════════════════════════════════════════════════════════════
section("8. Persona stage progression")

e, s = new_session()
metric("PERSONA", s.persona_stage, "initial")
check("Initial persona = COLD",
      s.persona_stage == PersonaStage.COLD, PersonaStage.COLD, s.persona_stage)

p = e.mark_room_complete(s, "room_1", score=1.0)
metric("PERSONA", p, "after room_1")
check("After room_1 → COLLABORATIVE",
      p == PersonaStage.COLLABORATIVE, PersonaStage.COLLABORATIVE, p)

p = e.mark_room_complete(s, "room_2", score=0.8)
metric("PERSONA", p, "after room_2")
check("After room_2 → CARING", p == PersonaStage.CARING, PersonaStage.CARING, p)

p = e.mark_room_complete(s, "room_3", score=0.7)
metric("PERSONA", p, "after room_3")
check("After room_3 → ALLY", p == PersonaStage.ALLY, PersonaStage.ALLY, p)

p = e.mark_quiz_complete(s, score=9/12)
metric("PERSONA", p, "after quiz pass (9/12 = 75 %)")
check("Quiz pass (75 %) → FULL_UNLOCK",
      p == PersonaStage.FULL_UNLOCK, PersonaStage.FULL_UNLOCK, p)
check("certificate = True", s.certificate)

# ═══════════════════════════════════════════════════════════════════════════════
# 9. UNKNOWN ROOM ID
# ═══════════════════════════════════════════════════════════════════════════════
section("9. mark_room_complete with unrecognised room ID")

e, s = new_session()
p_before = s.persona_stage
e.mark_room_complete(s, "room_99", score=1.0)
metric("PERSONA before", p_before)
metric("PERSONA after",  s.persona_stage, "should be unchanged")
check("Unknown room ID does not advance persona",
      s.persona_stage == p_before, p_before, s.persona_stage)

# ═══════════════════════════════════════════════════════════════════════════════
# 10. ROOM-TO-ROOM NAVIGATION
# ═══════════════════════════════════════════════════════════════════════════════
section("10. Room-to-room navigation")

e, s = new_session()
metric("current_room", s.current_room, "initial")
check("Initial current_room = room_1",
      s.current_room == "room_1", "room_1", s.current_room)

e.mark_room_complete(s, "room_1", score=1.0)
metric("current_room", s.current_room, "after room_1")
check("After room_1 complete → room_2",
      s.current_room == "room_2", "room_2", s.current_room)

e.mark_room_complete(s, "room_2", score=1.0)
metric("current_room", s.current_room, "after room_2")
check("After room_2 complete → room_3",
      s.current_room == "room_3", "room_3", s.current_room)

e.mark_room_complete(s, "room_3", score=1.0)
metric("current_room", s.current_room, "after room_3")
check("After room_3 complete → quiz",
      s.current_room == "quiz", "quiz", s.current_room)

# ═══════════════════════════════════════════════════════════════════════════════
# 11. QUIZ PASS AND FAIL
# ═══════════════════════════════════════════════════════════════════════════════
section("11. Quiz pass and fail thresholds")

for raw_score, expect_pass in [(0.75, True), (1.0, True), (0.74, False), (0.0, False)]:
    e2, s2 = new_session()
    p2 = e2.mark_quiz_complete(s2, score=raw_score)
    pct = f"{raw_score*100:.0f} %"
    metric("SCORE",       pct)
    metric("PERSONA",     p2)
    metric("certificate", s2.certificate)
    check(f"Score {pct} → certificate={expect_pass}",
          s2.certificate == expect_pass, expect_pass, s2.certificate)
    check(f"Score {pct} → quiz_completed=True", s2.quiz_completed)

# ═══════════════════════════════════════════════════════════════════════════════
# 12. show_scaffold FLAG
# ═══════════════════════════════════════════════════════════════════════════════
section("12. show_scaffold flag correctness")

for n_errors, expected_scaffold in [(0, False), (1, False),
                                     (_CONSECUTIVE_STRUGGLING, True),
                                     (_CONSECUTIVE_STUCK, True)]:
    e2, s2 = new_session()
    last_state, sc = DDAState.FLOW, False
    for _ in range(n_errors):
        last_state, sc = attempt(e2, s2, "room_1", False, 1000)
    if n_errors == 0:
        last_state, sc = attempt(e2, s2, "room_1", True, 1000)
    consec = s2.rooms["room_1"].consecutive_errors if "room_1" in s2.rooms else 0
    metric("CONSEC",       consec)
    metric("STATE",        last_state)
    metric("show_scaffold",sc, f"expected {expected_scaffold}")
    check(f"{n_errors} error(s) → show_scaffold={expected_scaffold}",
          sc == expected_scaffold, expected_scaffold, sc)

# ═══════════════════════════════════════════════════════════════════════════════
# 13. get_room AUTO-CREATES RoomState
# ═══════════════════════════════════════════════════════════════════════════════
section("13. SessionState.get_room auto-creates RoomState")

e, s = new_session()
metric("rooms count", len(s.rooms), "before first access")
check("rooms dict initially empty", len(s.rooms) == 0, 0, len(s.rooms))
room = s.get_room("room_1")
metric("rooms count", len(s.rooms), "after get_room")
check("get_room creates entry",        "room_1" in s.rooms)
check("created room has room_id set",  room.room_id == "room_1", "room_1", room.room_id)
room_again = s.get_room("room_1")
check("get_room returns same object",  room is room_again)

# ═══════════════════════════════════════════════════════════════════════════════
# 14. mark_room_complete SETS room.completed AND room.score
# ═══════════════════════════════════════════════════════════════════════════════
section("14. mark_room_complete sets room.completed and room.score")

e, s = new_session()
e.mark_room_complete(s, "room_1", score=0.67)
room = s.rooms["room_1"]
metric("room.completed", room.completed)
metric("room.score",     room.score)
check("room.completed = True", room.completed)
check("room.score = 0.67",     room.score == 0.67, 0.67, room.score)

# ═══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════
total = PASS_COUNT + FAIL_COUNT
print(f"\n{'═' * 60}")
if FAIL_COUNT == 0:
    print(f"  ✓  All {total} tests passed — DDA engine verified")
else:
    print(f"  ✗  {FAIL_COUNT} / {total} tests FAILED")
print(f"{'═' * 60}")
if FAIL_COUNT > 0:
    sys.exit(1)
