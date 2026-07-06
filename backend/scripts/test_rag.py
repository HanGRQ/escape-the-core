"""
Complete RAG Pipeline Test Suite  (with metrics output)
=========================================================
Tests the dual-track RAG retriever (GDD §4.4) against the live ChromaDB
knowledge base. Run build_knowledge_base.py first if the DB is empty.

Usage:
    cd escape-the-core/backend
    python scripts/test_rag.py

Printed metrics
───────────────
Each test prints the exact numbers from ChromaDB so you can judge quality:

  • [DIST]       cosine distance between the query vector and the chunk vector
                   0.00 = identical  |  1.00 = unrelated  |  2.00 = opposite
  • [SIM %]      similarity = (1 − dist) × 100 %  (higher is better)
  • [CHUNKS]     number of chunks returned by each track / combined
  • [TRACK]      "A" = metadata-filtered  |  "B" = semantic search
  • [TOP RESULT] the single best-matching chunk_id and its concept
"""

import sys
import re
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.rag import RAGRetriever, ChunkResult, _TRACK_A_TYPES

# ── Helpers ───────────────────────────────────────────────────────────────────

PASS_COUNT = 0
FAIL_COUNT = 0

def ok(label):
    global PASS_COUNT; PASS_COUNT += 1
    print(f"  ✓  {label}")

def fail(label, detail=""):
    global FAIL_COUNT; FAIL_COUNT += 1
    print(f"  ✗  {label}")
    if detail:
        print(f"       {detail}")

def check(label, condition, detail=""):
    if condition: ok(label)
    else: fail(label, detail)

def sim(dist):
    """Convert distance to similarity percentage."""
    return max(0.0, (1.0 - dist) * 100.0)

def print_chunks(chunks, label="chunks", max_show=5):
    """Print a ranked table of chunks with dist and similarity."""
    print(f"       {label} ({len(chunks)} total):")
    if not chunks:
        print("         (none)")
        return
    for i, c in enumerate(chunks[:max_show]):
        bar_len = int(sim(c.distance) / 5)
        bar = "█" * bar_len + "░" * (20 - bar_len)
        print(f"         {i+1}. [{c.track}] {c.chunk_id:<10} "
              f"dist={c.distance:.4f}  sim={sim(c.distance):5.1f}%  {bar}  "
              f"{c.concept[:35]}")
    if len(chunks) > max_show:
        print(f"         … and {len(chunks) - max_show} more")

def metric(key, value, note=""):
    tag = f"[{key}]"
    print(f"       {tag:<14} {value}{'  ← ' + note if note else ''}")

def section(title):
    print(f"\n── {title} {'─' * max(0, 60 - len(title))}")

# ── Load retriever ────────────────────────────────────────────────────────────

print("Loading RAGRetriever…")
try:
    r = RAGRetriever()
    print("✓ Retriever ready\n")
except Exception as exc:
    print(f"✗ Failed to load RAGRetriever: {exc}")
    print("  Did you run: python scripts/build_knowledge_base.py ?")
    sys.exit(1)

KNOWN_CHUNK_IDS = {
    "room_1": ["L1_C01", "L1_C04", "L1_C10"],
    "room_2": ["L2_C01", "L2_C08", "L2_C11", "L2_C12"],
    "room_3": ["L3_C01", "L3_C06", "L3_C07"],
}
ALL_ROOMS  = ["room_1", "room_2", "room_3"]
DDA_STATES = ["confused", "struggling", "stuck"]

SAMPLE_WRONG = {
    "room_1": "I selected the wrong LLM use case for this business scenario",
    "room_2": "I placed the task into the wrong Granite model slot",
    "room_3": "My prompt was too vague and did not specify the task clearly",
}

# ═══════════════════════════════════════════════════════════════════════════════
# A. BASIC RETRIEVAL — all 9 combinations return at least 1 chunk
# ═══════════════════════════════════════════════════════════════════════════════
section("A. Basic retrieval — 9 room × DDA-state combinations")

for room in ALL_ROOMS:
    for state in DDA_STATES:
        result = r.retrieve_for_dda(
            player_state=state,
            wrong_answer=SAMPLE_WRONG[room],
            room=room,
        )
        n_a, n_b, n_c = len(result.track_a), len(result.track_b), len(result.combined)
        best = result.combined[0] if result.combined else None
        label = f"{room} / {state}"

        metric("CHUNKS", f"trackA={n_a}  trackB={n_b}  combined={n_c}",
               label)
        if best:
            metric("TOP RESULT",
                   f"{best.chunk_id}  dist={best.distance:.4f}  "
                   f"sim={sim(best.distance):.1f}%  [{best.track}]  {best.concept[:40]}")

        check(f"{label} → combined not empty",
              n_c > 0, f"got {n_c} chunks")

# ═══════════════════════════════════════════════════════════════════════════════
# B. ROOM ISOLATION — chunks belong to the queried room
# ═══════════════════════════════════════════════════════════════════════════════
section("B. Room isolation — no cross-room leakage")

for room in ALL_ROOMS:
    result = r.retrieve_for_dda("confused", "generic wrong answer", room)
    expected_prefix = f"L{room[-1]}_"
    bad = [c for c in result.combined if not c.chunk_id.startswith(expected_prefix)]
    metric("CHUNKS", f"combined={len(result.combined)}  "
           f"expected prefix={expected_prefix}  bad={len(bad)}", room)
    check(f"{room}: no chunks from other rooms in combined",
          len(bad) == 0,
          f"leaked: {[c.chunk_id for c in bad]}")

    bad_a = [c for c in result.track_a if not c.chunk_id.startswith(expected_prefix)]
    check(f"{room}: Track A chunks all belong to {room}",
          len(bad_a) == 0,
          f"bad: {[c.chunk_id for c in bad_a]}")

# ═══════════════════════════════════════════════════════════════════════════════
# C. TRACK A QUALITY — metadata filters honoured
# ═══════════════════════════════════════════════════════════════════════════════
section("C. Track A quality — metadata fields correct")

for room in ALL_ROOMS:
    for state in DDA_STATES:
        result = r.retrieve_for_dda(state, "wrong answer", room, k_a=3, k_b=0)
        allowed = set(_TRACK_A_TYPES.get(state, ["analogy", "use_case"]))
        for c in result.track_a:
            metric("CHUNK",
                   f"{c.chunk_id}  content_type={c.content_type}  "
                   f"difficulty={c.difficulty}  dist={c.distance:.4f}  "
                   f"sim={sim(c.distance):.1f}%",
                   f"{room}/{state}")
            check(f"{room}/{state}: {c.chunk_id} content_type ∈ allowed set",
                  c.content_type in allowed,
                  f"{c.content_type} not in {allowed}")
            check(f"{room}/{state}: {c.chunk_id} difficulty='basic'",
                  c.difficulty == "basic",
                  f"difficulty={c.difficulty}")

# ═══════════════════════════════════════════════════════════════════════════════
# D. TRACK B QUALITY — chunks belong to queried room
# ═══════════════════════════════════════════════════════════════════════════════
section("D. Track B quality — all results from queried room")

for room in ALL_ROOMS:
    result = r.retrieve_for_dda("stuck", "some wrong answer", room, k_a=0, k_b=3)
    bad_b = [c for c in result.track_b if not c.chunk_id.startswith(f"L{room[-1]}_")]
    metric("CHUNKS", f"trackB={len(result.track_b)}  bad={len(bad_b)}", room)
    if result.track_b:
        metric("DIST range",
               f"min={min(c.distance for c in result.track_b):.4f}  "
               f"max={max(c.distance for c in result.track_b):.4f}")
    check(f"{room}: Track B chunks all belong to {room}",
          len(bad_b) == 0,
          f"bad: {[c.chunk_id for c in bad_b]}")

# ═══════════════════════════════════════════════════════════════════════════════
# E. MERGE / DEDUPLICATION
# ═══════════════════════════════════════════════════════════════════════════════
section("E. Merge deduplication — no duplicate chunk_ids in combined")

for room in ALL_ROOMS:
    for state in DDA_STATES:
        result = r.retrieve_for_dda(state, SAMPLE_WRONG[room], room, k_a=3, k_b=3)
        ids = [c.chunk_id for c in result.combined]
        dupes = [i for i in ids if ids.count(i) > 1]
        metric("CHUNKS",
               f"trackA={len(result.track_a)}  trackB={len(result.track_b)}  "
               f"combined={len(result.combined)}  dupes={len(set(dupes))}",
               f"{room}/{state}")
        check(f"{room}/{state}: combined has no duplicate chunk_ids",
              len(dupes) == 0,
              f"duplicates: {list(set(dupes))}")

# ═══════════════════════════════════════════════════════════════════════════════
# F. SEMANTIC RELEVANCE — wrong answers retrieve the right chunks
# ═══════════════════════════════════════════════════════════════════════════════
section("F. Semantic relevance smoke tests")

RELEVANCE_CASES = [
    ("room_1","confused",
     "Customers need 24/7 around-the-clock support",
     "L1_C04","24/7 support → Virtual Assistants (L1_C04)"),
    ("room_1","struggling",
     "We need to classify reviews as positive negative or neutral",
     "L1_C05","Classify sentiment → Sentiment Analysis (L1_C05)"),
    ("room_1","stuck",
     "I need help understanding all six NetWiz use cases",
     "L1_C10","NetWiz use cases → case study (L1_C10)"),
    ("room_2","confused",
     "I chose Granite Multilingual but the task was about Japanese cultural localisation",
     "L2_C10","Multilingual vs Japanese confusion → L2_C10"),
    ("room_2","struggling",
     "detect hate speech profanity platform moderation safety",
     "L2_C11","Content safety → Granite Guardian (L2_C11)"),
    ("room_2","stuck",
     "generate code snippets automate inventory management developer",
     "L2_C08","Code generation → Granite Code (L2_C08)"),
    ("room_3","confused",
     "my prompt is missing a format specification word count",
     "L3_C03","Missing constraints → Be specific step (L3_C03)"),
    ("room_3","struggling",
     "the prompt just says analyse this text it is too vague",
     "L3_C06","Vague prompt → challenge-solution (L3_C06)"),
    ("room_3","stuck",
     "using difficult technical vocabulary and multiple interpretations "
     "causes the model to misunderstand what I mean — complex language ambiguity",
     "L3_C07","Complex language/ambiguity → L3_C07"),
]

for room, state, wrong_answer, expected_id, description in RELEVANCE_CASES:
    result = r.retrieve_for_dda(state, wrong_answer, room, k_a=3, k_b=3)
    all_ids = [c.chunk_id for c in result.combined]
    found = any(cid == expected_id or cid.startswith(expected_id) for cid in all_ids)

    # Show the top results with distances regardless of pass/fail
    print_chunks(result.combined[:4], label=f"  results for: {description}")

    # Find the target chunk's rank and distance if present
    target = next((c for c in result.combined if c.chunk_id == expected_id), None)
    if target:
        rank = result.combined.index(target) + 1
        metric("TARGET",
               f"{target.chunk_id}  rank=#{rank}  dist={target.distance:.4f}  "
               f"sim={sim(target.distance):.1f}%  [{target.track}]")
    else:
        metric("TARGET", f"{expected_id} NOT found in combined results")

    check(f"Relevance: {description}", found,
          f"Expected '{expected_id}' in {all_ids[:3]}…")

# ═══════════════════════════════════════════════════════════════════════════════
# G. EDGE CASES
# ═══════════════════════════════════════════════════════════════════════════════
section("G. Edge cases")

# Empty wrong_answer
try:
    result = r.retrieve_for_dda("confused", "", "room_1")
    metric("CHUNKS", f"combined={len(result.combined)} for empty wrong_answer")
    check("Empty wrong_answer does not raise", True)
except Exception as exc:
    fail("Empty wrong_answer raised an exception", str(exc))

# One-word wrong_answer
try:
    result = r.retrieve_for_dda("struggling", "no", "room_2")
    metric("CHUNKS", f"combined={len(result.combined)} for one-word wrong_answer")
    check("One-word wrong_answer does not raise", True)
except Exception as exc:
    fail("One-word wrong_answer raised an exception", str(exc))

# k_b=0
result = r.retrieve_for_dda("confused", "some answer", "room_1", k_a=2, k_b=0)
metric("CHUNKS", f"trackA={len(result.track_a)}  trackB={len(result.track_b)}",
       "k_b=0")
check("k_b=0 → track_b is empty", len(result.track_b) == 0,
      f"track_b had {len(result.track_b)} chunks")

# k_a=0
result = r.retrieve_for_dda("confused", "some answer", "room_1", k_a=0, k_b=2)
metric("CHUNKS", f"trackA={len(result.track_a)}  trackB={len(result.track_b)}",
       "k_a=0")
check("k_a=0 → track_a is empty", len(result.track_a) == 0,
      f"track_a had {len(result.track_a)} chunks")
check("k_a=0 → track_b still has results", len(result.track_b) > 0,
      f"track_b had {len(result.track_b)} chunks")

# Very large k
try:
    result = r.retrieve_for_dda("stuck", "large k test", "room_3", k_a=100, k_b=100)
    metric("CHUNKS", f"combined={len(result.combined)} for k=100",
           "capped at available docs")
    check("Very large k values do not raise", True)
    check("Large k returns ≤ available chunks", len(result.combined) < 200)
except Exception as exc:
    fail("Very large k values raised an exception", str(exc))

# Unknown DDA state
try:
    result = r.retrieve_for_dda("unknown_state", "test", "room_1")
    metric("CHUNKS", f"combined={len(result.combined)} for unknown DDA state")
    check("Unknown DDA state string does not raise", True)
except Exception as exc:
    fail("Unknown DDA state string raised an exception", str(exc))

# ═══════════════════════════════════════════════════════════════════════════════
# H. DIRECT CHUNK FETCH (get_chunk_by_id)
# ═══════════════════════════════════════════════════════════════════════════════
section("H. Direct chunk fetch — get_chunk_by_id")

for room, ids in KNOWN_CHUNK_IDS.items():
    for cid in ids:
        chunk = r.get_chunk_by_id(cid)
        check(f"get_chunk_by_id({cid}) returns a ChunkResult",
              chunk is not None, f"expected ChunkResult, got None")
        if chunk:
            metric("chunk_id", chunk.chunk_id)
            metric("concept",  chunk.concept[:50])
            metric("content_type", chunk.content_type)
            metric("difficulty",   chunk.difficulty)
            metric("content len",  len(chunk.content), "characters")
            check(f"{cid}: chunk_id field matches requested ID",
                  chunk.chunk_id == cid,
                  f"expected={cid!r}, got={chunk.chunk_id!r}")
            check(f"{cid}: content is non-empty",
                  len(chunk.content) > 10,
                  f"content length={len(chunk.content)}")
            check(f"{cid}: concept is non-empty", len(chunk.concept) > 0)

chunk = r.get_chunk_by_id("L9_C99_DOES_NOT_EXIST")
metric("result", chunk, "for non-existent ID")
check("get_chunk_by_id for non-existent ID returns None",
      chunk is None,
      f"expected None, got {chunk!r}")

# ═══════════════════════════════════════════════════════════════════════════════
# I. CONTENT QUALITY — no stray markdown in stored chunk content
# ═══════════════════════════════════════════════════════════════════════════════
section("I. Content quality — no markdown symbols in chunk content")

MARKDOWN_PATTERN = re.compile(r"\*\*|\*[^*]|\*$|^#{1,6}\s|^[-*+]\s", re.MULTILINE)
all_known_ids = [cid for ids in KNOWN_CHUNK_IDS.values() for cid in ids]

for cid in all_known_ids:
    chunk = r.get_chunk_by_id(cid)
    if chunk is None:
        continue
    has_md = bool(MARKDOWN_PATTERN.search(chunk.content))
    metric("markdown found", has_md, cid)
    check(f"{cid}: content has no markdown formatting",
          not has_md,
          f"found in: {chunk.content[:100]}…")

# ═══════════════════════════════════════════════════════════════════════════════
# SUMMARY — distance statistics across all 9 combinations
# ═══════════════════════════════════════════════════════════════════════════════
section("Overall distance statistics (summary)")

all_top_dists = []
for room in ALL_ROOMS:
    for state in DDA_STATES:
        res = r.retrieve_for_dda(state, SAMPLE_WRONG[room], room)
        if res.combined:
            d = res.combined[0].distance
            all_top_dists.append(d)
            print(f"       {room}/{state:<12}  top dist={d:.4f}  sim={sim(d):.1f}%")

if all_top_dists:
    avg_d = sum(all_top_dists) / len(all_top_dists)
    min_d = min(all_top_dists)
    max_d = max(all_top_dists)
    print(f"\n       Average top-chunk distance across all 9 combos: {avg_d:.4f}  "
          f"(sim={sim(avg_d):.1f}%)")
    print(f"       Best match:  dist={min_d:.4f}  sim={sim(min_d):.1f}%")
    print(f"       Worst match: dist={max_d:.4f}  sim={sim(max_d):.1f}%")

total = PASS_COUNT + FAIL_COUNT
print(f"\n{'═' * 60}")
if FAIL_COUNT == 0:
    print(f"  ✓  All {total} tests passed — RAG pipeline verified")
else:
    print(f"  ✗  {FAIL_COUNT} / {total} tests FAILED")
print(f"{'═' * 60}")
if FAIL_COUNT > 0:
    sys.exit(1)
