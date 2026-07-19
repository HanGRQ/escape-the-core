# Backend Automation Coverage Design

## Scope

Enhance the existing DDA script, RAG script, and pytest E2E suite without changing production behavior. Preserve all original checks and add evidence for every requested backend requirement. Frontend rendering is explicitly out of scope.

## Result semantics

Each requirement check reports one of three outcomes:

- `PASS`: the current implementation satisfies the requirement.
- `FAIL`: the test ran and proved that the current implementation does not satisfy it.
- `SKIP`: an explicitly named environment prerequisite, such as the local Chroma collection or embedding model, is unavailable.

Business-requirement failures must not be hidden by mocks or converted to passes. Test infrastructure failures, including report-write errors, must be reported separately.

## Test architecture

`scripts/test_dda.py` remains the direct DDA state-machine regression suite and gains requirement metadata in its JSON output. It does not test Claude or persistence because those boundaries belong to the HTTP integration suite.

`scripts/test_rag.py` remains a real local ChromaDB integration suite. It must identify the persistent collection in its report, test Track A and Track B independently, and add a deterministic merge test with overlapping chunk IDs so deduplication is proven rather than inferred.

`tests/test_e2e.py` continues to exercise FastAPI with in-memory external-service substitutes. New spy fixtures record DDA, save, retrieval, and Claude events so ordering and branch behavior can be asserted. Reload checks must pass through `_session_to_dict` and `_dict_to_session` after clearing the application memory cache, and must verify attempts, DDA state, completed/score state, help state, and current-room progress.

Current production behavior is expected to produce explicit requirement failures for save-before-Claude, light-template support, and stronger-only LLM invocation. Existing regression scenarios remain expected to pass.

## Reporting

All suites write timestamped JSON under `backend/test_results`. Report writing uses a shared robust helper that creates the directory and emits a clear error if the destination is not writable. The HTML generator displays PASS, FAIL, and SKIP distinctly and includes a requirements summary across all three suites.

The three supported commands remain:

```text
python scripts/test_dda.py
python scripts/test_rag.py
pytest tests/test_e2e.py -v
```

Afterwards, `python scripts/generate_report.py` creates the combined HTML report from the latest JSON files.

## Non-goals

- No frontend test framework or browser automation.
- No changes to DDA thresholds, intervention text, Claude branching, persistence timing, or retrieval ranking.
- No real Claude or Firestore network calls.
