"""
M2 — Dual-Track RAG Retriever
Implements the two retrieval strategies defined in GDD §4.4:
  Track A: metadata filter  — fetches analogies/use-cases for current room + DDA state
  Track B: semantic search  — fetches content that addresses the player's specific mistake

Usage (in DDA engine or API handler):
    retriever = RAGRetriever()
    result = retriever.retrieve_for_dda(
        player_state="struggling",
        wrong_answer="I chose Granite Instruct but the task was about code",
        room="room_2",
    )
    print(result.track_a)   # metadata-filtered chunks
    print(result.track_b)   # semantic chunks
    print(result.combined)  # deduplicated merge, best chunks first

Fixes in this version:
  - anonymized_telemetry=False: silences the harmless
    "Failed to send telemetry event … capture() takes 1 positional
    argument but 3 were given" warnings caused by a ChromaDB/PostHog
    version mismatch.
  - k=0 guard in _track_a and _track_b: ChromaDB raises TypeError when
    n_results=0. Both methods now return [] immediately when k <= 0,
    so callers can safely pass k_a=0 or k_b=0 to isolate one track.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from pathlib import Path
import chromadb
from chromadb.config import Settings
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction

# ── Config ────────────────────────────────────────────────────────────────────
CHROMA_DIR  = Path(__file__).resolve().parent.parent / "knowledge_base" / "chroma_db"
COLLECTION  = "escape_the_core"
EMBED_MODEL = "all-MiniLM-L6-v2"

# Which content_types to prefer in Track A per DDA state
_TRACK_A_TYPES: dict[str, list[str]] = {
    "confused":   ["analogy", "use_case", "concept", "step"],
    "struggling": ["analogy", "use_case", "case_study", "challenge_solution", "step"],
    "stuck":      ["case_study", "challenge_solution", "analogy"],
}
# ─────────────────────────────────────────────────────────────────────────────


@dataclass
class ChunkResult:
    chunk_id:     str
    concept:      str
    content_type: str
    difficulty:   str
    content:      str          # raw document text stored in ChromaDB
    distance:     float
    track:        str          # "A", "B", or "A+B"


@dataclass
class RetrievalResult:
    track_a:  list[ChunkResult] = field(default_factory=list)
    track_b:  list[ChunkResult] = field(default_factory=list)
    combined: list[ChunkResult] = field(default_factory=list)


class RAGRetriever:
    """Singleton-safe retriever — instantiate once and reuse across requests."""

    def __init__(self):
        embed_fn = SentenceTransformerEmbeddingFunction(model_name=EMBED_MODEL)
        client   = chromadb.PersistentClient(
            path=str(CHROMA_DIR),
            settings=Settings(anonymized_telemetry=False),
        )
        self._col = client.get_collection(
            name=COLLECTION,
            embedding_function=embed_fn,
        )

    # ── Public API ────────────────────────────────────────────────────────────

    def retrieve_for_dda(
        self,
        player_state: str,   # "confused" | "struggling" | "stuck"
        wrong_answer: str,   # the player's incorrect answer text (used for semantic search)
        room: str,           # "room_1" | "room_2" | "room_3"
        k_a: int = 2,
        k_b: int = 3,
    ) -> RetrievalResult:
        """
        Dual-track retrieval as specified in GDD §4.4.

        Track A — metadata filter:
            Fetches simplified analogies / use-cases / case-studies
            for the current room + DDA state + difficulty=basic.

        Track B — semantic search:
            Fetches content that best addresses the player's specific
            misconception, scoped to the current room.

        Passing k_a=0 or k_b=0 is safe — that track is skipped and
        returns an empty list.  This lets callers isolate one track
        for testing without triggering a ChromaDB TypeError.
        """
        track_a = self._track_a(player_state, room, k_a)
        track_b = self._track_b(wrong_answer, room, k_b)
        combined = self._merge(track_a, track_b)
        return RetrievalResult(track_a=track_a, track_b=track_b, combined=combined)

    def get_chunk_by_id(self, chunk_id: str) -> ChunkResult | None:
        """Fetch a specific chunk by its ID (for direct Doctor K references)."""
        try:
            res = self._col.get(ids=[chunk_id], include=["documents", "metadatas"])
            if not res["ids"]:
                return None
            return self._to_chunk(
                chunk_id, res["documents"][0], res["metadatas"][0], 0.0, "direct"
            )
        except Exception:
            return None

    # ── Track A ───────────────────────────────────────────────────────────────

    def _track_a(self, player_state: str, room: str, k: int) -> list[ChunkResult]:
        # Guard: ChromaDB raises TypeError if n_results=0
        if k <= 0:
            return []

        content_types = _TRACK_A_TYPES.get(player_state, ["analogy", "use_case"])

        where: dict = {
            "$and": [
                {"game_room":    {"$eq": room}},
                {"dda_trigger":  {"$in": [player_state, "confused"]}},
                {"difficulty":   {"$eq": "basic"}},
                {"content_type": {"$in": content_types}},
            ]
        }

        # Use a neutral query — Track A is metadata-driven, not semantic
        res = self._col.query(
            query_texts=["teaching hint explanation analogy"],
            n_results=min(k, self._count_matching(where)),
            where=where,
            include=["documents", "metadatas", "distances"],
        )
        return self._parse_results(res, "A")

    # ── Track B ───────────────────────────────────────────────────────────────

    def _track_b(self, wrong_answer: str, room: str, k: int) -> list[ChunkResult]:
        # Guard: ChromaDB raises TypeError if n_results=0
        if k <= 0:
            return []

        # Fall back to a neutral query if wrong_answer is empty
        query = wrong_answer.strip() if wrong_answer and wrong_answer.strip() else "general error"

        where: dict = {"game_room": {"$eq": room}}
        res = self._col.query(
            query_texts=[query],
            n_results=k,
            where=where,
            include=["documents", "metadatas", "distances"],
        )
        return self._parse_results(res, "B")

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _count_matching(self, where: dict) -> int:
        """Count docs matching a where clause so we don't ask for more than exist."""
        try:
            res = self._col.get(where=where, include=[])
            return max(len(res["ids"]), 1)
        except Exception:
            return 1

    def _parse_results(self, res: dict, track: str) -> list[ChunkResult]:
        chunks = []
        if not res["ids"] or not res["ids"][0]:
            return chunks
        for cid, doc, meta, dist in zip(
            res["ids"][0],
            res["documents"][0],
            res["metadatas"][0],
            res["distances"][0],
        ):
            chunks.append(self._to_chunk(cid, doc, meta, dist, track))
        return chunks

    @staticmethod
    def _to_chunk(chunk_id, doc, meta, distance, track) -> ChunkResult:
        return ChunkResult(
            chunk_id=chunk_id,
            concept=meta.get("concept", ""),
            content_type=meta.get("content_type", ""),
            difficulty=meta.get("difficulty", ""),
            content=doc,
            distance=distance,
            track=track,
        )

    @staticmethod
    def _merge(a: list[ChunkResult], b: list[ChunkResult]) -> list[ChunkResult]:
        """Merge Track A + B, deduplicate by chunk_id, Track A results first."""
        seen: set[str] = set()
        merged: list[ChunkResult] = []
        for chunk in a:
            if chunk.chunk_id not in seen:
                chunk.track = "A+B" if any(x.chunk_id == chunk.chunk_id for x in b) else "A"
                merged.append(chunk)
                seen.add(chunk.chunk_id)
        for chunk in b:
            if chunk.chunk_id not in seen:
                merged.append(chunk)
                seen.add(chunk.chunk_id)
        return merged
