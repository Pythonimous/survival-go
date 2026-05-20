"""Local run documentation coverage checks."""

from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
LOCAL_RUN_DOC = PROJECT_ROOT / "docs" / "development" / "local-run.md"
README = PROJECT_ROOT / "README.md"


@pytest.mark.unit
def test_local_run_doc_exists_and_covers_run_path() -> None:
    assert LOCAL_RUN_DOC.is_file(), "docs/development/local-run.md is missing"
    text = LOCAL_RUN_DOC.read_text(encoding="utf-8")
    required = (
        "scripts/run_backend.sh",
        "scripts/run_frontend.sh",
        "browser-inference-design.md",
        "onnx-model-artifacts.md",
        "GET /health",
        "http://127.0.0.1:8000/health",
        "http://127.0.0.1:5173",
        ".venv",
        "requirements.txt",
        "npm install",
        "./scripts/run_tests.sh",
    )
    for needle in required:
        assert needle in text, f"missing {needle!r} in local-run.md"
    assert "setup_katago.sh" not in text


@pytest.mark.unit
def test_readme_links_local_run_doc() -> None:
    text = README.read_text(encoding="utf-8")
    assert "docs/development/local-run.md" in text
