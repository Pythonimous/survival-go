import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


@pytest.fixture(autouse=True)
def _minimal_katago_env(
    request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Provide valid KataGo paths so backend imports fail fast only when intended."""
    if request.node.get_closest_marker("integration") is not None:
        return
    binary = tmp_path / "katago"
    binary.write_text("#!/bin/sh\n", encoding="utf-8")
    binary.chmod(0o755)
    config = tmp_path / "analysis.cfg"
    config.write_text("numSearchThreads = 1\n", encoding="utf-8")
    model = tmp_path / "model.bin.gz"
    model.write_bytes(b"fake-model")
    monkeypatch.setenv("KATAGO_BINARY_PATH", str(binary))
    monkeypatch.setenv("KATAGO_CONFIG_PATH", str(config))
    monkeypatch.setenv("KATAGO_MODEL_PATH", str(model))
