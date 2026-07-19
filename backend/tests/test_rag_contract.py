from app.rag import ChunkResult, RAGRetriever


class RecordingCollection:
    def __init__(self):
        self.query_calls = []

    def get(self, **kwargs):
        return {"ids": ["L1_C01", "L1_C02", "L1_C03"]}

    def query(self, **kwargs):
        self.query_calls.append(kwargs)
        return {
            "ids": [["L1_C01"]],
            "documents": [["content"]],
            "metadatas": [[{
                "concept": "concept",
                "content_type": "analogy",
                "difficulty": "basic",
            }]],
            "distances": [[0.2]],
        }


def retriever_with(collection):
    retriever = object.__new__(RAGRetriever)
    retriever._col = collection
    return retriever


def test_track_a_uses_metadata_filter_contract():
    collection = RecordingCollection()
    retriever_with(collection)._track_a("struggling", "room_1", 2)

    call = collection.query_calls[-1]
    clauses = call["where"]["$and"]
    assert {"game_room": {"$eq": "room_1"}} in clauses
    assert {"dda_trigger": {"$in": ["struggling", "confused"]}} in clauses
    assert {"difficulty": {"$eq": "basic"}} in clauses
    assert any("content_type" in clause for clause in clauses)


def test_track_b_uses_wrong_answer_as_semantic_query_and_room_scope():
    collection = RecordingCollection()
    retriever_with(collection)._track_b("specific misconception", "room_2", 3)

    call = collection.query_calls[-1]
    assert call["query_texts"] == ["specific misconception"]
    assert call["where"] == {"game_room": {"$eq": "room_2"}}


def test_merge_deduplicates_forced_cross_track_overlap():
    shared_a = ChunkResult("same", "a", "analogy", "basic", "A", 0.1, "A")
    shared_b = ChunkResult("same", "b", "use_case", "basic", "B", 0.2, "B")
    unique_b = ChunkResult("unique", "c", "use_case", "basic", "C", 0.3, "B")

    combined = RAGRetriever._merge([shared_a], [shared_b, unique_b])

    assert [chunk.chunk_id for chunk in combined] == ["same", "unique"]
    assert combined[0].track == "A+B"


def test_retriever_report_identifies_persistent_chromadb():
    from scripts.reporting import describe_chromadb

    info = describe_chromadb()
    assert info["backend"] == "chromadb.PersistentClient"
    assert info["path"].endswith("chroma_db")
    assert info["collection"]
