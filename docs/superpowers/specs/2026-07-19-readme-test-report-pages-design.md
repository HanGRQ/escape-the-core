# README and GitHub Pages Test Report Design

## Goal

Update the repository documentation so contributors can understand the runtime architecture, locate automated tests and their outputs, rebuild the local knowledge base, and open the latest HTML test report from a public GitHub Pages URL.

## README changes

- Replace the stale project tree with the current backend test and reporting layout.
- Add a Mermaid architecture diagram covering the React client, FastAPI API, DDA engine, dual-track RAG, Doctor K/Anthropic integration, Firebase, and the local ChromaDB knowledge base.
- Document the automated test entry points:
  - `backend/tests/` for pytest-based contract, integration, and reporting tests.
  - `backend/scripts/test_dda.py` and `backend/scripts/test_rag.py` for report-producing suites.
  - `backend/scripts/generate_report.py` for the combined HTML report.
- Document `backend/test_reports/` as the current JSON/HTML output directory and identify `backend/test_results/` as legacy output, so readers do not confuse the two.
- Document the knowledge-base source at `backend/knowledge_base/chunks.json`, generated ChromaDB data at `backend/knowledge_base/chroma_db/`, and builder at `backend/scripts/build_knowledge_base.py`.
- Add a stable GitHub Pages report link and repository setup instructions.

## GitHub Actions workflow

Create `.github/workflows/test-report-pages.yml` with these stages:

1. Trigger on pushes to `main` that affect backend tests, application code, knowledge-base input, reporting scripts, requirements, or the workflow itself; also support manual dispatch.
2. Check out the repository and configure Python with pip caching.
3. Install `backend/requirements.txt`.
4. Build the local ChromaDB knowledge base. Cache downloaded embedding-model data where practical.
5. Run pytest and the DDA/RAG report-producing suites.
6. Generate the combined HTML report.
7. Copy the newest HTML report to a clean Pages directory as `index.html`, with the JSON evidence files available alongside it.
8. Upload and deploy the Pages artifact using GitHub's official Pages actions.

The workflow will use the least required permissions: repository contents read, Pages write, and ID token write. GitHub environments will use the standard `github-pages` deployment environment.

## Test behavior and external services

The CI path must not require Anthropic or Firebase credentials for local DDA/RAG/report validation. Tests that genuinely require unavailable external services must skip with an explicit reason. A skipped external-service test must not be represented as a passing integration test.

## Published URL

For a project repository, the stable URL is:

`https://<owner>.github.io/<repository>/`

The README will use a repository-relative owner/repository placeholder only if the Git remote cannot provide the real GitHub slug. After merging the workflow, the maintainer must select **Settings > Pages > Source: GitHub Actions** once if it is not already enabled.

## Verification

- Validate the workflow YAML structure and referenced paths locally.
- Run the repository's documentation-relevant test commands where dependencies are available.
- Confirm the report generator produces HTML under `backend/test_reports/`.
- Confirm every README path is a valid repository-relative link.
- Confirm the Pages staging directory contains `index.html` before upload.
