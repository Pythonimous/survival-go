"""Smoke integration test against a real local KataGo analysis subprocess."""

from __future__ import annotations

from pathlib import Path

import pytest

from backend.app.config import Settings
from backend.app.katago.client import KataGoClient


@pytest.mark.integration
def test_katago_subprocess_startup_and_ownership_parsing(
    katago_settings: Settings,
) -> None:
    client = KataGoClient(settings=katago_settings)
    try:
        process = client.start()
        assert process.poll() is None

        p_black = client.analyze_empty_board(max_visits=20)
    finally:
        client.stop()

    assert len(p_black) == 361
    assert all(0.0 <= value <= 1.0 for value in p_black)


@pytest.mark.integration
def test_katago_binary_must_exist_when_env_points_at_missing_file(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    missing = tmp_path / "missing-katago"
    monkeypatch.setenv("KATAGO_BINARY_PATH", str(missing))
    monkeypatch.setenv("KATAGO_CONFIG_PATH", str(tmp_path / "missing.cfg"))
    monkeypatch.setenv("KATAGO_MODEL_PATH", str(tmp_path / "missing.bin.gz"))

    with pytest.raises(ValueError, match="path does not exist"):
        Settings()
