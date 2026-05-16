import os
import pathlib

import pytest
from flake8.main import application as flake8_app

PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[2]


@pytest.mark.lint
def test_flake8_conformance():
    app = flake8_app.Application()
    source_dir = PROJECT_ROOT / os.getenv("SOURCE_DIR", "src")
    targets = [str(PROJECT_ROOT / "tests")]
    if source_dir.exists():
        targets.insert(0, str(source_dir))
    app.run([
        "--config",
        str(PROJECT_ROOT / ".flake8"),
    ] + targets)
    assert app.result_count == 0, f"Found {app.result_count} flake8 violations"
