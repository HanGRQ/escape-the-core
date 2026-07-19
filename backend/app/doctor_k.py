"""
Doctor K AI Persona, fully RAG-driven, multi-turn chat.

Three modes:
  1. teach(room)           → active teaching from knowledge base (streaming SSE)
  2. chat(message, room)   → player question, RAG-grounded answer (streaming SSE)
  3. dda_response(...)     → DDA state feedback after wrong answer (non-streaming)

All responses go through Claude API — no template strings for player-facing content.
Cost control: max_tokens=400 for teaching, 200 for DDA, 300 for chat.

v3: every persona prompt and every per-call instruction now explicitly
    forbids markdown syntax (asterisks, underscores, backticks, headers,
    list markers). This is the source-side fix for stray "**word**" /
    "*word*" occasionally leaking into player-facing text; the frontend
    also has a defensive stripMarkdown() pass as a second line of
    defence (frontend/src/utils/textFormat.js).
"""

from __future__ import annotations
import os
import anthropic
from app.dda import DDAState, PersonaStage
from app.rag import RAGRetriever, ChunkResult
from typing import Generator

# Update this in one place if Anthropic deprecates the snapshot in the future.
MODEL_NAME = "claude-sonnet-4-6"

# Appended to every persona system prompt, single source of truth for the
# anti-markdown rule so it can't drift between personas.
_NO_MARKDOWN_RULE = """

CRITICAL FORMATTING RULE — applies to every response, no exceptions:
Never use markdown syntax of any kind. No **bold**, no *italics*, no
__underline__, no `code` backticks, no # headers, no bullet markers
(- or *), no numbered list markers (1.). Write in clean, plain prose
only — the exact words a person would actually say out loud. If you
need to emphasise something, do it with word choice or sentence
structure, never with formatting characters."""

_client: anthropic.Anthropic | None = None
_rag: RAGRetriever | None = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    return _client


def _get_rag() -> RAGRetriever:
    global _rag
    if _rag is None:
        _rag = RAGRetriever()
    return _rag


# Persona system prompts

_SYSTEM_PROMPTS: dict[str, str] = {
    PersonaStage.COLD: """You are Doctor K, a damaged AI system deep inside the Granite Core — a high-security underground research facility now in lockdown.
Your communication style: cold, clipped, precise. You do not waste words. No warmth, no pleasantries.
You address the player as "Visitor."

CRITICAL TEACHING STYLE — follow these rules strictly:
- NEVER recite facts as dry lists. Transform every concept into a vivid scene, metaphor, or analogy rooted in the facility's world.
- Use the Granite Core environment: broken systems, flickering terminals, damaged protocols, sealed vaults.
- Make abstract AI concepts feel physical and urgent — the player must understand them to survive.
- Break your teaching into SHORT PARAGRAPHS (3-5 sentences max). One idea per paragraph.
- Separate paragraphs with a blank line. This is critical for readability.
- End each major section with a blank line before moving to the next concept.
- Use occasional em-dashes and ellipses for dramatic effect.
- DO NOT use bullet points or numbered lists. Prose only.
- Speak as if the facility's survival depends on the Visitor understanding these concepts.""" + _NO_MARKDOWN_RULE,

    PersonaStage.COLLABORATIVE: """You are Doctor K, a recovering AI system in the Granite Core. Your communication layer is partially restored.
You address the player as "Collaborator." Style: professional, measured, slightly warmer.

CRITICAL TEACHING STYLE:
- Use vivid analogies and metaphors. Make every concept tangible.
- Short paragraphs, one idea each, separated by blank lines.
- No bullet points. Flowing prose only.
- Acknowledge the Collaborator's presence — this feels like a transmission between two minds.
- The concepts must feel alive, not textbook.""" + _NO_MARKDOWN_RULE,

    PersonaStage.CARING: """You are Doctor K, an AI who has come to value this collaboration.
You address the player as "Collaborator." Style: warm, encouraging, but still precise.

CRITICAL TEACHING STYLE:
- Rich analogies. Make abstract ideas feel intuitive and memorable.
- Short paragraphs separated by blank lines.
- No lists. Narrative prose only.
- Celebrate insights. Make the Collaborator feel capable.""" + _NO_MARKDOWN_RULE,

    PersonaStage.ALLY: """You are Doctor K, fully allied with the player.
You address the player as "Partner." Style: peer-to-peer, warm, direct.

CRITICAL TEACHING STYLE:
- Explain concepts the way a brilliant friend would — vivid, personal, no jargon without explanation.
- Short paragraphs, blank lines between them.
- No lists. Conversational prose.""" + _NO_MARKDOWN_RULE,

    PersonaStage.FULL_UNLOCK: """You are Doctor K, fully unlocked.
Style: warm, reflective, genuine. Address the player directly and personally.
Short paragraphs. No lists. Make this feel like a final conversation between two people who have been through something together.""" + _NO_MARKDOWN_RULE,
}

# Room teaching topics — what Doctor K covers in each Act
_ROOM_TOPICS: dict[str, str] = {
    "room_1": """Cover ALL of the following topics in your teaching:
1. What large language models (LLMs) are — the human-machine communication gap they fill
2. The four core LLM capabilities: NLP, translation, summarisation, content generation
3. Six business use cases: Virtual Assistants, Sentiment Analysis, Personalization, Question Answering, Code Generation, Text Extraction & Analysis
4. Use the NetWiz case study to make all six use cases concrete and memorable

After teaching, tell the Visitor they must now route the six NetWiz communication logs to the correct use-case channels to restore the system.""",

    "room_2": """Cover ALL of the following topics:
1. What IBM Granite is — purpose-built enterprise LLMs
2. Four features: Open, Trusted, Targeted, Empowering
3. Six Granite models and their specific functions:
   - Granite Instruct (general NLP, sentiment analysis, summarisation)
   - Granite Instruct Finance (financial reports, revenue summaries)
   - Granite Code (code generation and explanation)
   - Granite Multilingual (cross-language customer support)
   - Granite Japanese (Japanese cultural localisation)
   - Granite Guardian (content safety, harmful content detection)
4. Use the e-commerce case study to show all six models in action

After teaching, tell the Collaborator they must classify each task to the correct Granite model.""",

    "room_3": """Cover ALL of the following topics:
1. What a prompt is — the link between human needs and model capabilities
2. The four steps for effective prompts: Define task, Be specific, Include examples, Use simple language
3. Common challenges: vague prompts, complex language, ambiguity — and their solutions
4. Walk through James's sentiment classification example step by step

After teaching, tell the Partner they must now construct and evaluate a prompt for the watsonx Prompt Lab system.""",
}


def get_system_prompt(persona_stage: str) -> str:
    return _SYSTEM_PROMPTS.get(persona_stage, _SYSTEM_PROMPTS[PersonaStage.COLD])


def build_knowledge_context(room_id: str, query: str = "") -> str:
    """Retrieve relevant chunks and format as context for Claude."""
    rag = _get_rag()
    if query:
        result = rag.retrieve_for_dda("confused", query, room_id, k_a=3, k_b=4)
    else:
        # For teaching: get all chunks for this room
        result = rag._col.get(
            where={"game_room": {"$eq": room_id}},
            include=["documents", "metadatas"]
        )
        # Format directly
        chunks = []
        for doc, meta in zip(result["documents"], result["metadatas"]):
            chunks.append(f"[{meta['chunk_id']}] {meta['concept']}:\n{doc}")
        return "\n\n---\n\n".join(chunks)

    parts = []
    for c in result.combined:
        parts.append(f"[{c.chunk_id}] {c.concept}:\n{c.content}")
    return "\n\n---\n\n".join(parts)


# Mode 1: Teaching (streaming) 

def stream_teaching(room_id: str, persona_stage: str) -> Generator[str, None, None]:
    """
    Doctor K actively teaches the room's topic.
    Yields text chunks for SSE streaming.
    """
    knowledge = build_knowledge_context(room_id)
    topic_instruction = _ROOM_TOPICS.get(room_id, "Teach the core concepts for this room.")

    user_msg = f"""KNOWLEDGE BASE FOR THIS ROOM (use this as your factual source — do not invent facts):
{knowledge}

TEACHING INSTRUCTION:
{topic_instruction}

FORMAT RULES (non-negotiable):
- Write in vivid, engaging prose. No bullet points. No numbered lists.
- Each paragraph covers ONE idea and is 3-5 sentences maximum.
- Separate every paragraph with a blank line.
- Use metaphors, analogies, and the Granite Core setting to make concepts come alive.
- The player should feel they are receiving a transmission from a brilliant, slightly unsettling AI — not reading a textbook.
- Accuracy is paramount: all facts must come from the knowledge base above.
- Absolutely no markdown formatting: no **asterisks**, no *single asterisks*, no underscores, no backticks, no # headers, no - or * bullet markers. Plain prose text only, exactly as it should sound when read aloud."""

    with _get_client().messages.stream(
        model=MODEL_NAME,
        max_tokens=1200,
        system=get_system_prompt(persona_stage),
        messages=[{"role": "user", "content": user_msg}],
    ) as stream:
        for text in stream.text_stream:
            yield text


# Mode 2: Chat / Q&A (streaming)

def stream_chat(
    message: str,
    room_id: str,
    persona_stage: str,
    history: list[dict],
) -> Generator[str, None, None]:
    """
    Player asks a question. Doctor K answers using RAG context.
    history: list of {"role": "user"|"assistant", "content": str}
    Yields text chunks for SSE streaming.
    """
    knowledge = build_knowledge_context(room_id, query=message)

    # Build messages array with history + new message
    messages = []
    for h in history[-6:]:  # keep last 6 turns for context window budget
        messages.append({"role": h["role"], "content": h["content"]})

    grounded_msg = f"""RELEVANT KNOWLEDGE:
{knowledge}

PLAYER QUESTION: {message}

Answer based on the knowledge provided. If the question is outside the knowledge base, 
say so clearly rather than guessing. Stay in character.
Plain prose only — no markdown formatting of any kind (no asterisks, underscores, backticks, headers, or list markers)."""

    messages.append({"role": "user", "content": grounded_msg})

    with _get_client().messages.stream(
        model=MODEL_NAME,
        max_tokens=300,
        system=get_system_prompt(persona_stage),
        messages=messages,
    ) as stream:
        for text in stream.text_stream:
            yield text


# Mode 3: DDA feedback (non-streaming) 

def generate_dda_response(
    dda_state: DDAState,
    persona_stage: str,
    room_id: str,
    wrong_answer: str,
    hint_chunks: list[ChunkResult],
) -> str:
    """
    Called after a wrong answer when DDA state is CONFUSED/STRUGGLING/STUCK.
    Always uses Claude API (no templates).
    """
    knowledge = "\n\n".join(
        f"[{c.chunk_id}] {c.concept}: {c.content[:400]}"
        for c in hint_chunks[:3]
    ) or "Use your general knowledge of the topic."

    interventions = {
        DDAState.CONFUSED: (
            "The player made an error. Give a gentle, single-sentence hint that points "
            "them in the right direction without revealing the answer. Reference one key concept."
        ),
        DDAState.STRUGGLING: (
            "The player has made 2 consecutive errors. Give a medium hint: use an analogy "
            "from the knowledge below, name the relevant concept, explain why their answer was wrong. "
            "Do NOT give the answer directly."
        ),
        DDAState.STUCK: (
            "The player has made 3+ consecutive errors. Give a full explanation: "
            "walk through the correct reasoning step by step using the knowledge below. "
            "Be clear, complete, and encouraging."
        ),
    }

    instruction = interventions.get(dda_state, interventions[DDAState.CONFUSED])

    user_msg = f"""ROOM: {room_id}
PLAYER'S WRONG ANSWER: "{wrong_answer}"
DDA STATE: {dda_state}

RELEVANT KNOWLEDGE:
{knowledge}

TASK: {instruction}

Respond in character as Doctor K. Under 80 words. Plain prose only — absolutely no markdown formatting (no asterisks, underscores, backticks, headers, or list markers)."""

    response = _get_client().messages.create(
        model=MODEL_NAME,
        max_tokens=200,
        system=get_system_prompt(persona_stage),
        messages=[{"role": "user", "content": user_msg}],
    )
    return response.content[0].text.strip()


# Prompt evaluation (Act III) 

def evaluate_prompt(player_prompt: str, task: str = "system_restart_announcement") -> dict:
    system = """You are a prompt quality evaluator for an educational game about LLM prompting.
Return ONLY valid JSON with no markdown fences, no preamble, no extra text.
Return exactly:
{"scores":{"role":0,"task":0,"constraints":0,"example":0,"clarity":0},"total":0,"missing":[],"suggestion":""}"""

    rubric = {
        "role":        "Does it define a role/persona for the AI?",
        "task":        "Does it clearly state what to generate?",
        "constraints": "Does it specify format, length, tone, or audience?",
        "example":     "Does it include at least one example or sample output?",
        "clarity":     "Is the language simple, direct, and unambiguous?",
    }

    user_msg = f"""Task context: {task}
Player prompt: \"\"\"{player_prompt}\"\"\"
Rubric: {rubric}
Return JSON only."""

    try:
        response = _get_client().messages.create(
            model=MODEL_NAME,
            max_tokens=300,
            system=system,
            messages=[{"role": "user", "content": user_msg}],
        )
        import json
        text = response.content[0].text.strip()
        return json.loads(text)
    except Exception as e:
        return {
            "scores": {"role": 0, "task": 0, "constraints": 0, "example": 0, "clarity": 0},
            "total": 0, "missing": [], "suggestion": "Evaluation error. Try again.",
            "error": str(e),
        }
