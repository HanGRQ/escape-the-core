"""Shared result-file helpers for the backend automation suites."""

from __future__ import annotations

import datetime as _datetime
import json
import os
from pathlib import Path


def default_results_dir() -> Path:
    configured = os.getenv("ESCAPE_TEST_RESULTS_DIR")
    if configured:
        return Path(configured).resolve()
    return Path(__file__).resolve().parent.parent / "test_reports"


def write_json_report(prefix: str, payload: dict) -> Path:
    results_dir = default_results_dir()
    results_dir.mkdir(parents=True, exist_ok=True)
    timestamp = _datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    output = results_dir / f"{prefix}_{timestamp}.json"
    output.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return output


def result_status(result: dict) -> str:
    explicit = str(result.get("status", "")).upper()
    if explicit in {"PASS", "FAIL", "SKIP", "ERROR"}:
        return explicit
    return "PASS" if result.get("passed") else "FAIL"


def describe_chromadb() -> dict[str, str]:
    from app.rag import CHROMA_DIR, COLLECTION

    return {
        "backend": "chromadb.PersistentClient",
        "path": str(CHROMA_DIR.resolve()),
        "collection": COLLECTION,
    }
