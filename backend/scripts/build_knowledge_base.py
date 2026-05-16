"""
M1 — Knowledge Base Builder (local embeddings, no OpenAI required)
Embeds all 29 chunks from chunks.json into a local ChromaDB collection
using the free sentence-transformers model — only your Anthropic API key needed.

Usage:
    cd escape-the-core/backend
    pip install -r requirements.txt
    python scripts/build_knowledge_base.py

First run downloads ~90MB model from HuggingFace (one-time, then cached).
"""

import json
import os
from pathlib import Path
from dotenv import load_dotenv
from tqdm import tqdm
import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction

# ── Config ────────────────────────────────────────────────────────────────────
load_dotenv()

BASE_DIR    = Path(__file__).resolve().parent.parent
CHUNKS_PATH = BASE_DIR / "knowledge_base" / "chunks.json"
CHROMA_DIR  = BASE_DIR / "knowledge_base" / "chroma_db"
COLLECTION  = "escape_the_core"
# all-MiniLM-L6-v2: 90MB, fast, excellent for English semantic retrieval
EMBED_MODEL = "all-MiniLM-L6-v2"
# ─────────────────────────────────────────────────────────────────────────────


def build():
    # Load chunks
    with open(CHUNKS_PATH, "r", encoding="utf-8") as f:
        chunks = json.load(f)
    print(f"Loaded {len(chunks)} chunks from {CHUNKS_PATH}")

    # Init ChromaDB (persistent, local)
    CHROMA_DIR.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))

    # Delete existing collection if rebuilding
    try:
        client.delete_collection(COLLECTION)
        print(f"Deleted existing collection '{COLLECTION}'")
    except Exception:
        pass

    # Local embedding function — downloads model on first run, then cached
    print(f"Loading embedding model '{EMBED_MODEL}' (downloads ~90MB on first run)...")
    embed_fn = SentenceTransformerEmbeddingFunction(model_name=EMBED_MODEL)

    collection = client.create_collection(
        name=COLLECTION,
        embedding_function=embed_fn,
        metadata={"hnsw:space": "cosine"},
    )

    # Prepare data
    ids       = []
    documents = []
    metadatas = []

    for chunk in tqdm(chunks, desc="Preparing chunks"):
        ids.append(chunk["chunk_id"])

        # Text that gets embedded: concept title + content + analogy (if any)
        doc_text = f"{chunk['concept']}. {chunk['content']}"
        if chunk.get("analogy"):
            doc_text += f" Analogy: {chunk['analogy']}"
        documents.append(doc_text)

        # ChromaDB metadata: only str, int, float, bool allowed
        metadatas.append({
            "chunk_id":        chunk["chunk_id"],
            "lesson":          chunk["lesson"],
            "section":         chunk["section"],
            "concept":         chunk["concept"],
            "content_type":    chunk["content_type"],
            "difficulty":      chunk["difficulty"],
            "game_room":       chunk["game_room"],
            "dda_trigger":     chunk["dda_trigger"],
            "keywords":        ", ".join(chunk["keywords"]),
            "linked_activity": chunk["linked_activity"],
            "has_analogy":     bool(chunk.get("analogy")),
        })

    # Upsert everything
    print(f"\nEmbedding {len(ids)} chunks locally...")
    collection.upsert(ids=ids, documents=documents, metadatas=metadatas)

    print(f"\n✓ Knowledge base built: {len(ids)} chunks in '{COLLECTION}'")
    print(f"  Stored at: {CHROMA_DIR}\n")

    _verify(collection)


def _verify(collection):
    """Spot-check three retrieval scenarios matching DDA states."""
    print("── Verification queries ──────────────────────────────────────────")

    tests = [
        {
            "label": "Track A · room_1, struggling — should return analogy chunks",
            "query": "human machine communication gap language comprehension",
            "where": {
                "$and": [
                    {"game_room":   {"$eq": "room_1"}},
                    {"dda_trigger": {"$in": ["struggling", "confused"]}},
                    {"difficulty":  {"$eq": "basic"}},
                ]
            },
            "k": 2,
        },
        {
            "label": "Track B · room_2 — wrong answer: picked Instruct for code task",
            "query": "generate code snippets automate inventory management",
            "where": {"game_room": {"$eq": "room_2"}},
            "k": 3,
        },
        {
            "label": "Track A · room_3, struggling — vague prompt challenge",
            "query": "prompt is too vague unclear missing detail",
            "where": {
                "$and": [
                    {"game_room":   {"$eq": "room_3"}},
                    {"dda_trigger": {"$in": ["struggling", "stuck"]}},
                ]
            },
            "k": 2,
        },
    ]

    all_ok = True
    for t in tests:
        results = collection.query(
            query_texts=[t["query"]],
            n_results=t["k"],
            where=t["where"],
        )
        hits = list(zip(results["ids"][0], results["distances"][0]))
        print(f"\n  [{t['label']}]")
        if hits:
            for cid, dist in hits:
                print(f"    {cid}  (cosine distance={dist:.4f})")
        else:
            print("    ⚠ No results returned — check metadata filters")
            all_ok = False

    print()
    if all_ok:
        print("── All verification queries passed ✓ ────────────────────────────")
    else:
        print("── Some queries returned no results — review chunk metadata ─────")


if __name__ == "__main__":
    build()
