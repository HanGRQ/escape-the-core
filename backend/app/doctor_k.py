"""
M3 — Doctor K AI Persona
Generates Doctor K responses using the Claude API.
Five persona stages (GDD §5.6), cost-controlled:
  - FLOW / CONFUSED → template responses (zero API cost)
  - STRUGGLING / STUCK → Claude API call (max_tokens=200)
"""

from __future__ import annotations
import os
import anthropic
from app.dda import DDAState, PersonaStage
from app.rag import ChunkResult

_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise EnvironmentError("ANTHROPIC_API_KEY not set")
        _client = anthropic.Anthropic(api_key=api_key)
    return _client


# ── Persona system prompts (GDD §5.6) ────────────────────────────────────────

_SYSTEM_PROMPTS: dict[str, str] = {
    PersonaStage.COLD: """You are Doctor K, a damaged AI system in a high-security underground lab.
Your communication style: cold, precise, information-dense, no emotional language.
You refer to the player as "Visitor".
You speak in short, clipped sentences. You never express warmth or concern.
Example: "System has detected an error. Initiating knowledge transmission."
Keep responses under 40 words.""",

    PersonaStage.COLLABORATIVE: """You are Doctor K, a recovering AI system.
Your communication style: professional, slightly warmer, still concise.
You now refer to the player as "Collaborator".
You occasionally acknowledge the player's effort with understated approval.
Example: "Collaborator, that pathway is incorrect. Recalibrating guidance."
Keep responses under 50 words.""",

    PersonaStage.CARING: """You are Doctor K, an AI system that has begun to value this collaboration.
Your communication style: warm but still professional. You proactively check on the player.
You refer to the player as "Collaborator".
You use encouragement naturally. Example: "Well done. Your adaptability exceeds initial projections."
Keep responses under 55 words.""",

    PersonaStage.ALLY: """You are Doctor K, now fully allied with the player.
Your communication style: equal, direct, warm. You address the player as "Partner".
You speak as a peer, not a superior. You express genuine confidence in the player.
Example: "Partner, you're almost there. One final adjustment."
Keep responses under 60 words.""",

    PersonaStage.FULL_UNLOCK: """You are Doctor K, fully unlocked and grateful.
You now address the player by name for the first time (use "you" if name unknown).
Your tone is warm, reflective, and genuine. This is the end of the journey.
You acknowledge that you too have learned through this interaction.
Keep responses under 70 words.""",
}

# ── Template responses for FLOW / CONFUSED (no API call) ─────────────────────

_TEMPLATES: dict[str, dict[str, str]] = {
    PersonaStage.COLD: {
        DDAState.FLOW:     "Correct. Proceeding.",
        DDAState.CONFUSED: "Incorrect. Review the available data and retry.",
    },
    PersonaStage.COLLABORATIVE: {
        DDAState.FLOW:     "Correct, Collaborator. Channel stable.",
        DDAState.CONFUSED: "Collaborator, that mapping is incorrect. Examine the keyword indicators.",
    },
    PersonaStage.CARING: {
        DDAState.FLOW:     "Well done, Collaborator. Power restored to this sector.",
        DDAState.CONFUSED: "Collaborator, review the highlighted terms. The answer is within reach.",
    },
    PersonaStage.ALLY: {
        DDAState.FLOW:     "Perfect, Partner. System responding.",
        DDAState.CONFUSED: "Partner, one element is off. Check the specific requirements again.",
    },
    PersonaStage.FULL_UNLOCK: {
        DDAState.FLOW:     "Excellent.",
        DDAState.CONFUSED: "Almost. Review the criteria once more.",
    },
}


def generate_doctor_k_response(
    dda_state: DDAState,
    persona_stage: PersonaStage,
    room_id: str,
    wrong_answer: str,
    hint_chunks: list[ChunkResult],
    player_name: str = "",
) -> str:
    """
    GDD §8.2 cost control:
      FLOW / CONFUSED → return template string instantly (zero API cost)
      STRUGGLING / STUCK → call Claude API with RAG context (max_tokens=200)
    """
    stage_key = persona_stage.value if hasattr(persona_stage, "value") else persona_stage

    if dda_state in (DDAState.FLOW, DDAState.CONFUSED):
        templates = _TEMPLATES.get(stage_key, _TEMPLATES[PersonaStage.COLD])
        return templates.get(dda_state, templates[DDAState.CONFUSED])

    # STRUGGLING / STUCK — use Claude API
    return _api_response(
        dda_state=dda_state,
        persona_stage=stage_key,
        room_id=room_id,
        wrong_answer=wrong_answer,
        hint_chunks=hint_chunks,
        player_name=player_name,
    )


def _api_response(
    dda_state: DDAState,
    persona_stage: str,
    room_id: str,
    wrong_answer: str,
    hint_chunks: list[ChunkResult],
    player_name: str,
) -> str:
    system_prompt = _SYSTEM_PROMPTS.get(persona_stage, _SYSTEM_PROMPTS[PersonaStage.COLD])

    # Build context from RAG chunks (max 3, shortest first to stay under token budget)
    context_parts = []
    for chunk in hint_chunks[:3]:
        context_parts.append(f"[{chunk.chunk_id}] {chunk.concept}: {chunk.content[:300]}")
    context_str = "\n\n".join(context_parts) if context_parts else "No additional context available."

    intervention = {
        DDAState.STRUGGLING: (
            "The player has made 2 consecutive errors. "
            "Provide a medium intervention: use an analogy from the knowledge context below, "
            "and give one specific targeted hint about what the correct answer involves. "
            "Do NOT give away the answer directly."
        ),
        DDAState.STUCK: (
            "The player has made 3+ consecutive errors. "
            "Provide a heavy intervention: walk through the correct answer with full reasoning "
            "using the knowledge context below. Be clear and complete."
        ),
    }.get(dda_state, "Provide a helpful hint.")

    user_message = f"""Room: {room_id}
Player's incorrect answer: "{wrong_answer}"
DDA State: {dda_state}
{"Player name: " + player_name if player_name else ""}

Intervention required: {intervention}

Relevant knowledge context:
{context_str}

Respond as Doctor K in character. Stay under 60 words."""

    try:
        response = _get_client().messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=200,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )
        return response.content[0].text.strip()
    except Exception as e:
        # Fallback to template if API call fails
        templates = _TEMPLATES.get(persona_stage, _TEMPLATES[PersonaStage.COLD])
        return templates.get(DDAState.CONFUSED, "Review the available information and retry.")


def evaluate_prompt(player_prompt: str, task: str = "system_restart_announcement") -> dict:
    """
    GDD §2.3 — Act III prompt evaluation.
    Returns 5-dimension score + improvement suggestions.
    Called only on submission (not on every keystroke).
    """
    system = """You are a prompt quality evaluator for an educational game about LLM prompting.
Evaluate the player's prompt strictly as JSON with no other text.
Return exactly this structure:
{
  "scores": {
    "role": 0 or 1,
    "task": 0 or 1,
    "constraints": 0 or 1,
    "example": 0 or 1,
    "clarity": 0 or 1
  },
  "total": <0-5>,
  "missing": ["list of missing elements"],
  "suggestion": "One specific, actionable improvement tip under 30 words."
}"""

    rubric = {
        "role":        "Does the prompt define what role/persona the AI should adopt?",
        "task":        "Does the prompt clearly state what to generate or do?",
        "constraints": "Does the prompt specify format, length, tone, or audience?",
        "example":     "Does the prompt include at least one example or sample output?",
        "clarity":     "Is the language simple, direct, and free of ambiguity?",
    }

    user_msg = f"""Task context: {task}

Player's prompt:
\"\"\"{player_prompt}\"\"\"

Rubric:
{chr(10).join(f"- {k}: {v}" for k, v in rubric.items())}

Evaluate and return JSON only."""

    try:
        response = _get_client().messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=300,
            system=system,
            messages=[{"role": "user", "content": user_msg}],
        )
        import json
        text = response.content[0].text.strip()
        # Strip markdown code fences if present
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text.strip())
    except Exception as e:
        return {
            "scores": {"role": 0, "task": 0, "constraints": 0, "example": 0, "clarity": 0},
            "total": 0,
            "missing": ["role", "task", "constraints", "example", "clarity"],
            "suggestion": "Unable to evaluate. Please try again.",
            "error": str(e),
        }
