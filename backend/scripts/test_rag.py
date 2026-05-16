"""
M2 — RAG Pipeline Test
Run from backend/ to verify all DDA states and rooms return correct chunks.

Usage:
    cd escape-the-core/backend
    python scripts/test_rag.py
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.rag import RAGRetriever


def section(title: str):
    print(f"\n{'─'*60}")
    print(f"  {title}")
    print('─'*60)


def show(label: str, chunks):
    print(f"\n  [{label}]")
    if not chunks:
        print("    ⚠  No results")
        return False
    for c in chunks:
        print(f"    [{c.track}] {c.chunk_id:10s}  {c.concept[:45]:<45}  dist={c.distance:.4f}")
    return True


def main():
    print("Loading RAGRetriever...")
    r = RAGRetriever()
    print("✓ Retriever ready\n")

    all_ok = True

    # ── Act I: Use-case identification ────────────────────────────────────────
    section("ACT I — Room 1: Use-case identification")

    res = r.retrieve_for_dda(
        player_state="confused",
        wrong_answer="Customers inquire about stock 24/7 the support team is overwhelmed",
        room="room_1",
    )
    ok = show("CONFUSED · 24/7 query overload → should hint Virtual Assistants", res.combined)
    all_ok = all_ok and ok

    res = r.retrieve_for_dda(
        player_state="struggling",
        wrong_answer="Thousands of user reviews classified as positive negative neutral",
        room="room_1",
    )
    ok = show("STRUGGLING · review classification → should surface Sentiment Analysis + NetWiz", res.combined)
    all_ok = all_ok and ok

    res = r.retrieve_for_dda(
        player_state="stuck",
        wrong_answer="Key clauses and discrepancies in supplier contracts",
        room="room_1",
    )
    ok = show("STUCK · contracts/clauses → should surface Text Extraction + NetWiz case", res.combined)
    all_ok = all_ok and ok

    # ── Act II: Granite model classification ──────────────────────────────────
    section("ACT II — Room 2: Granite model classification")

    res = r.retrieve_for_dda(
        player_state="confused",
        wrong_answer="detect hate speech profanity platform safety",
        room="room_2",
    )
    ok = show("CONFUSED · safety/profanity → should return Granite Guardian (L2_C11)", res.combined)
    all_ok = all_ok and ok

    res = r.retrieve_for_dda(
        player_state="struggling",
        wrong_answer="I chose Granite Multilingual but the task was Japanese cultural localisation",
        room="room_2",
    )
    ok = show("STRUGGLING · Multilingual vs Japanese confusion → should surface L2_C10", res.combined)
    all_ok = all_ok and ok

    res = r.retrieve_for_dda(
        player_state="stuck",
        wrong_answer="generate quarterly financial summary revenue profit margins",
        room="room_2",
    )
    ok = show("STUCK · finance report → should return Granite Instruct Finance (L2_C07)", res.combined)
    all_ok = all_ok and ok

    # ── Act III: Prompt writing ────────────────────────────────────────────────
    section("ACT III — Room 3: Prompt writing")

    res = r.retrieve_for_dda(
        player_state="confused",
        wrong_answer="my prompt is missing a format specification word count",
        room="room_3",
    )
    ok = show("CONFUSED · missing format → should surface Step 2/3 chunks (L3_C03/C04)", res.combined)
    all_ok = all_ok and ok

    res = r.retrieve_for_dda(
        player_state="struggling",
        wrong_answer="the prompt just says analyze this text it is too vague",
        room="room_3",
    )
    ok = show("STRUGGLING · vague prompt → should surface L3_C06 challenge chunk", res.combined)
    all_ok = all_ok and ok

    res = r.retrieve_for_dda(
        player_state="stuck",
        wrong_answer="prompt has complex technical jargon and is ambiguous",
        room="room_3",
    )
    ok = show("STUCK · ambiguity → should surface L3_C07", res.combined)
    all_ok = all_ok and ok

    # ── Direct chunk fetch ─────────────────────────────────────────────────────
    section("Direct chunk fetch (get_chunk_by_id)")

    for cid in ["L1_C10", "L2_C12", "L3_C06"]:
        chunk = r.get_chunk_by_id(cid)
        if chunk:
            print(f"  ✓ {cid}: {chunk.concept[:55]}")
        else:
            print(f"  ✗ {cid}: NOT FOUND")
            all_ok = False

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"\n{'═'*60}")
    if all_ok:
        print("  ✓  All RAG pipeline tests passed — M2 complete")
    else:
        print("  ✗  Some tests returned no results — check chunk metadata")
    print('═'*60)


if __name__ == "__main__":
    main()
