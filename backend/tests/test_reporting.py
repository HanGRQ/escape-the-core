import json
from pathlib import Path


def test_write_json_report_creates_timestamped_result(tmp_path, monkeypatch):
    monkeypatch.setenv("ESCAPE_TEST_RESULTS_DIR", str(tmp_path))

    from scripts.reporting import write_json_report

    output = write_json_report("sample", {"suite": "sample", "results": []})

    assert output.parent == tmp_path
    assert output.name.startswith("sample_")
    assert output.suffix == ".json"
    assert json.loads(output.read_text(encoding="utf-8"))["suite"] == "sample"


def test_report_status_normalizes_pass_fail_and_skip():
    from scripts.reporting import result_status

    assert result_status({"passed": True}) == "PASS"
    assert result_status({"passed": False}) == "FAIL"
    assert result_status({"status": "SKIP", "passed": False}) == "SKIP"


def test_results_directory_defaults_to_writable_test_reports():
    from scripts.reporting import default_results_dir

    assert default_results_dir().name == "test_reports"
    assert default_results_dir().parent.name == "backend"
