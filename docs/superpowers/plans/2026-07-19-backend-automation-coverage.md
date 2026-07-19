# Backend Automation Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the three existing backend automation suites prove every requested non-frontend requirement and generate machine-readable plus combined HTML reports without changing production behavior.

**Architecture:** Keep state-machine, real-Chroma integration, and HTTP-boundary responsibilities in their existing suites. Add deterministic spies and serialization round trips where result-only assertions cannot prove ordering or implementation paths. Extend report schemas compatibly with PASS/FAIL/SKIP and requirement identifiers.

**Tech Stack:** Python 3.12, pytest, FastAPI TestClient, unittest.mock, ChromaDB, JSON, HTML.

## Global Constraints

- Preserve all original test coverage.
- Do not change application runtime behavior.
- Do not add frontend tests.
- Real ChromaDB absence must be reported explicitly, never silently replaced by a stub.
- Reports must distinguish business failures, environment skips, and infrastructure errors.

---

### Task 1: Reliable report artifacts

**Files:**
- Create: `backend/tests/test_reporting.py`
- Create: `backend/scripts/reporting.py`
- Modify: `backend/scripts/test_dda.py`
- Modify: `backend/scripts/test_rag.py`
- Modify: `backend/tests/conftest.py`
- Modify: `backend/scripts/generate_report.py`

**Interfaces:**
- Produces: `write_json_report(prefix: str, payload: dict) -> pathlib.Path` and status-aware HTML rendering.

- [ ] Write tests that use a temporary results directory and assert JSON creation plus PASS/FAIL/SKIP HTML badges.
- [ ] Run `pytest tests/test_reporting.py -v` and confirm failure because the reporting helper/status support is absent.
- [ ] Implement the shared writer and compatible HTML status rendering.
- [ ] Run `pytest tests/test_reporting.py -v` and confirm pass.

### Task 2: Deterministic RAG evidence

**Files:**
- Modify: `backend/scripts/test_rag.py`
- Create: `backend/tests/test_rag_contract.py`

**Interfaces:**
- Consumes: `RAGRetriever._track_a`, `_track_b`, `_merge`.
- Produces: exact query-contract checks and requirement-tagged RAG report entries.

- [ ] Write failing contract tests asserting Track A `where`, Track B `query_texts`, persistent Chroma identity reporting, and forced-overlap deduplication.
- [ ] Run `pytest tests/test_rag_contract.py -v`; confirm missing reporting metadata fails while existing query contracts pass.
- [ ] Add deterministic script checks and explicit environment status without fallback.
- [ ] Run the contract tests again and confirm pass.

### Task 3: E2E ordering, branching, failure persistence, and reload

**Files:**
- Modify: `backend/tests/conftest.py`
- Modify: `backend/tests/test_e2e.py`

**Interfaces:**
- Produces: event log entries `dda`, `save`, `rag`, `llm`; serialized in-memory Firestore load behavior.

- [ ] Add tests for save-before-Claude, template-only light support, stronger-only LLM invocation, and persisted attempts/state after Claude failure.
- [ ] Run the new targeted tests and confirm the three known runtime gaps fail for the expected assertions.
- [ ] Add serialized reload tests that clear `app.main._mem_sessions` and verify attempts, DDA state, completed, score, help_requested, and current_room.
- [ ] Run reload tests and preserve genuine failures as report results rather than altering application code.
- [ ] Extend pytest JSON records with stable requirement IDs and outcomes.

### Task 4: Full execution and combined report

**Files:**
- Modify only if verification exposes test-infrastructure defects in files already listed above.

**Interfaces:**
- Produces: latest `dda_*.json`, `rag_*.json`, `e2e_*.json`, and `report_*.html`.

- [ ] Run `python scripts/test_dda.py` with UTF-8 output and record exit status.
- [ ] Run `python scripts/test_rag.py` with UTF-8 output and record pass/fail/skip status.
- [ ] Run `pytest tests/test_e2e.py -v` and distinguish expected business requirement failures from infrastructure errors.
- [ ] Run `python scripts/generate_report.py` and verify the HTML file exists and contains all three suite summaries.
- [ ] Inspect latest JSON totals and requirement coverage; report exact results and artifact paths.
