"""
M3 — DDA State Machine
Implements GDD §5: three-dimensional state monitoring (accuracy, latency,
help-seeking) with four states: FLOW / CONFUSED / STRUGGLING / STUCK.

This module is pure logic — no FastAPI, no Firebase imports.
It can be unit-tested in isolation.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional
import time


class DDAState(str, Enum):
    FLOW       = "FLOW"
    CONFUSED   = "CONFUSED"
    STRUGGLING = "STRUGGLING"
    STUCK      = "STUCK"


class PersonaStage(str, Enum):
    COLD          = "cold"           # Game start
    COLLABORATIVE = "collaborative"  # After Act I
    CARING        = "caring"         # After Act II
    ALLY          = "ally"           # After Act III
    FULL_UNLOCK   = "full_unlock"    # After Final Quiz


# GDD §5.3 thresholds
_CONSECUTIVE_STUCK      = 3    # errors on same question → STUCK
_CONSECUTIVE_STRUGGLING = 2    # consecutive errors → STRUGGLING
_SLOW_MULTIPLIER        = 2.0  # response time > N× average → CONFUSED
_MIN_TIMES_FOR_SLOW     = 3    # need at least this many timings before slow check


@dataclass
class AttemptRecord:
    is_correct:    bool
    time_taken_ms: int
    answer_given:  str
    timestamp:     float = field(default_factory=time.time)
    dda_state:     str   = DDAState.FLOW


@dataclass
class RoomState:
    room_id:           str
    attempts:          int                  = 0
    consecutive_errors: int                 = 0
    reaction_times:    list[int]            = field(default_factory=list)
    help_requested:    bool                 = False
    current_state:     DDAState             = DDAState.FLOW
    history:           list[AttemptRecord]  = field(default_factory=list)
    completed:         bool                 = False
    score:             Optional[float]      = None


@dataclass
class SessionState:
    session_id:      str
    user_id:         str
    current_room:    str                     = "room_1"
    persona_stage:   PersonaStage            = PersonaStage.COLD
    rooms:           dict[str, RoomState]    = field(default_factory=dict)
    quiz_completed:  bool                    = False
    quiz_score:      Optional[float]         = None
    certificate:     bool                    = False

    def get_room(self, room_id: str) -> RoomState:
        if room_id not in self.rooms:
            self.rooms[room_id] = RoomState(room_id=room_id)
        return self.rooms[room_id]


class DDAEngine:
    """
    Stateless processor — takes a SessionState, processes an attempt,
    returns the new DDAState and whether to show a scaffold.

    Caller is responsible for persisting SessionState (Firebase).
    """

    def process_attempt(
        self,
        session: SessionState,
        room_id: str,
        is_correct: bool,
        time_taken_ms: int,
        answer_given: str,
    ) -> tuple[DDAState, bool]:
        """
        Returns (new_dda_state, show_scaffold).
        show_scaffold=True when state is STRUGGLING or STUCK.
        Mutates session.rooms[room_id] in place.
        """
        room = session.get_room(room_id)
        room.attempts += 1
        room.reaction_times.append(time_taken_ms)

        if is_correct:
            room.consecutive_errors = 0
        else:
            room.consecutive_errors += 1

        new_state = self._compute_state(room)
        room.current_state = new_state

        record = AttemptRecord(
            is_correct=is_correct,
            time_taken_ms=time_taken_ms,
            answer_given=answer_given,
            dda_state=new_state,
        )
        room.history.append(record)

        show_scaffold = new_state in (DDAState.STRUGGLING, DDAState.STUCK)
        return new_state, show_scaffold

    def mark_room_complete(
        self,
        session: SessionState,
        room_id: str,
        score: float,
    ) -> PersonaStage:
        """
        Mark room done, advance Doctor K persona.
        Returns the new persona stage.
        """
        room = session.get_room(room_id)
        room.completed = True
        room.score = score

        persona_map = {
            "room_1": PersonaStage.COLLABORATIVE,
            "room_2": PersonaStage.CARING,
            "room_3": PersonaStage.ALLY,
        }
        if room_id in persona_map:
            session.persona_stage = persona_map[room_id]

        next_room_map = {
            "room_1": "room_2",
            "room_2": "room_3",
            "room_3": "quiz",
        }
        session.current_room = next_room_map.get(room_id, "quiz")
        return session.persona_stage

    def mark_quiz_complete(
        self,
        session: SessionState,
        score: float,
    ) -> PersonaStage:
        session.quiz_completed = True
        session.quiz_score = score
        if score >= 0.75:
            session.certificate = True
            session.persona_stage = PersonaStage.FULL_UNLOCK
        return session.persona_stage

    def set_help_requested(self, session: SessionState, room_id: str) -> DDAState:
        """Called when player clicks the Hint button."""
        room = session.get_room(room_id)
        room.help_requested = True
        # Help request always triggers at least CONFUSED
        if room.current_state == DDAState.FLOW:
            room.current_state = DDAState.CONFUSED
        return room.current_state

    # ── Internal ──────────────────────────────────────────────────────────────

    @staticmethod
    def _compute_state(room: RoomState) -> DDAState:
        """GDD §5.3 state transition logic."""
        consec = room.consecutive_errors
        times  = room.reaction_times

        # STUCK: 3+ consecutive errors on same question
        if consec >= _CONSECUTIVE_STUCK:
            return DDAState.STUCK

        # STRUGGLING: 2 consecutive errors
        if consec >= _CONSECUTIVE_STRUGGLING:
            return DDAState.STRUGGLING

        # CONFUSED: slow response OR explicit help request
        if room.help_requested:
            return DDAState.CONFUSED

        if len(times) >= _MIN_TIMES_FOR_SLOW:
            avg = sum(times[:-1]) / len(times[:-1])
            if avg > 0 and times[-1] > avg * _SLOW_MULTIPLIER:
                return DDAState.CONFUSED

        return DDAState.FLOW
