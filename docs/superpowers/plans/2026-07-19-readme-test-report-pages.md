# README and GitHub Pages Test Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Document the current architecture, test/report paths, and knowledge-base build flow, then automatically publish the generated HTML test report through GitHub Pages.

**Architecture:** A repository-level GitHub Actions workflow runs the credential-free backend test suites, generates the combined report, stages it as `index.html`, and deploys it with the official Pages actions. The README describes the same paths and data flow with repository-relative links and a Mermaid diagram.

**Tech Stack:** Markdown, Mermaid, GitHub Actions, Python 3.12, pytest, ChromaDB, GitHub Pages

## Global Constraints

- Current report outputs live in `backend/test_reports/`; `backend/test_results/` is legacy.
- Knowledge-base input is `backend/knowledge_base/chunks.json`; generated storage is `backend/knowledge_base/chroma_db/`.
- CI tests must not require Anthropic or Firebase credentials; unavailable external-service tests must skip explicitly.
- Pages deployment uses `contents: read`, `pages: write`, and `id-token: write` permissions.

---

### Task 1: GitHub Pages test-report workflow

**Files:**
- Create: `.github/workflows/test-report-pages.yml`

**Interfaces:**
- Consumes: `backend/requirements.txt`, `backend/scripts/build_knowledge_base.py`, `backend/scripts/test_dda.py`, `backend/scripts/test_rag.py`, `backend/scripts/generate_report.py`, and `backend/tests/`.
- Produces: `_site/index.html` plus JSON evidence files deployed to the `github-pages` environment.

- [ ] **Step 1: Create the workflow with push and manual triggers**

Use `main` path filters for backend application/test/report/knowledge-base files and the workflow itself. Add a concurrency group that cancels superseded Pages deployments.

- [ ] **Step 2: Configure Python and caches**

Use `actions/setup-python` with Python 3.12 and pip caching against `backend/requirements.txt`; cache the Hugging Face model directory keyed by OS and requirements hash.

- [ ] **Step 3: Run the credential-free validation pipeline**

From `backend/`, install requirements, run `python scripts/build_knowledge_base.py`, `python -m pytest tests -v`, `python scripts/test_dda.py`, `python scripts/test_rag.py`, and `python scripts/generate_report.py`. Each command must stop the workflow on a non-zero exit.

- [ ] **Step 4: Stage and deploy the report**

In PowerShell-independent YAML shell commands, create `_site`, copy the newest `backend/test_reports/report_*.html` to `_site/index.html`, copy JSON evidence, call `actions/configure-pages`, `actions/upload-pages-artifact`, and `actions/deploy-pages`.

- [ ] **Step 5: Validate the workflow statically**

Run:

```powershell
Get-Content -Raw .github/workflows/test-report-pages.yml
rg -n "build_knowledge_base|pytest|test_dda|test_rag|generate_report|upload-pages-artifact|deploy-pages" .github/workflows/test-report-pages.yml
```

Expected: all pipeline commands and both Pages actions are present, and every referenced repository path exists.

### Task 2: README architecture and contributor navigation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: the repository paths and publishing behavior established by Task 1.
- Produces: contributor-facing setup, architecture, testing, report, and knowledge-base documentation.

- [ ] **Step 1: Refresh the project structure**

Add `backend/tests/`, `backend/test_reports/`, reporting scripts, and `.github/workflows/test-report-pages.yml`; label `backend/test_results/` as legacy.

- [ ] **Step 2: Add the Mermaid architecture diagram**

Show React/Firebase Auth calling FastAPI, FastAPI coordinating DDA, Doctor K, RAG, Firestore, and Anthropic, and RAG reading the generated ChromaDB whose source is `chunks.json` through `build_knowledge_base.py`.

- [ ] **Step 3: Expand knowledge-base documentation**

Document the exact source, builder, output, working directory, first-run model download, and rebuild command:

```bash
cd backend
python scripts/build_knowledge_base.py
```

- [ ] **Step 4: Replace the test section with the current commands and paths**

Document:

```bash
cd backend
python -m pytest tests -v
python scripts/test_dda.py
python scripts/test_rag.py
python scripts/generate_report.py
```

Link each command to its source and explain the JSON and HTML output naming under `backend/test_reports/`.

- [ ] **Step 5: Add GitHub Pages viewing instructions**

Link to `https://<owner>.github.io/<repository>/`, explain **Settings > Pages > Source: GitHub Actions**, and note the workflow triggers and Actions artifact fallback.

- [ ] **Step 6: Verify README links and Mermaid syntax**

Run:

```powershell
rg -n "```mermaid|backend/tests|backend/test_reports|build_knowledge_base.py|github.io|GitHub Actions" README.md
```

Expected: every requested topic appears, and all repository-relative file links resolve.

### Task 3: End-to-end verification

**Files:**
- Verify: `README.md`
- Verify: `.github/workflows/test-report-pages.yml`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: evidence that the documented commands generate the artifact expected by Pages.

- [ ] **Step 1: Run focused automated tests**

Run from `backend/`:

```powershell
python -m pytest tests -v
```

Expected: all credential-free tests pass; external-service tests, if any, report an explicit skip reason.

- [ ] **Step 2: Generate report artifacts**

Run from `backend/`:

```powershell
python scripts/test_dda.py
python scripts/test_rag.py
python scripts/generate_report.py
```

Expected: DDA and RAG scripts exit 0, and a new `test_reports/report_*.html` exists.

- [ ] **Step 3: Check changes without touching unrelated work**

Run:

```powershell
git diff --check -- README.md .github/workflows/test-report-pages.yml
git status --short
```

Expected: no whitespace errors; only requested files and pre-existing user changes are listed.
