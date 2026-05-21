"""Unit tests for backend startup/readiness checks."""

from __future__ import annotations

from pathlib import Path

import pytest

from backend.app.config import Settings, reset_settings_cache
from backend.app.readiness import CheckResult, ReadinessReport, run_readiness_checks

PRESETS_DIR = Path(__file__).resolve().parents[2] / "backend" / "app" / "presets" / "sgf"


@pytest.fixture(autouse=True)
def _clear_settings_cache() -> None:
    reset_settings_cache()
    yield
    reset_settings_cache()


@pytest.mark.unit
def test_run_readiness_checks_passes_with_default_presets() -> None:
    report = run_readiness_checks(presets_dir=PRESETS_DIR)

    assert report.ready is True
    assert report.checks["settings"].status == "ok"
    assert report.checks["preset_bundle"].status == "ok"
    assert report.checks["preset_bundle"].detail == {"preset_count": 3}


@pytest.mark.unit
def test_run_readiness_checks_uses_provided_settings() -> None:
    settings = Settings(survival_threshold=0.88, default_top_n=4)

    report = run_readiness_checks(settings=settings, presets_dir=PRESETS_DIR)

    assert report.ready is True
    assert report.checks["settings"].detail == {
        "survival_threshold": 0.88,
        "default_top_n": 4,
    }


@pytest.mark.unit
def test_run_readiness_checks_fails_when_preset_directory_empty(
    tmp_path: Path,
) -> None:
    report = run_readiness_checks(presets_dir=tmp_path)

    assert report.ready is False
    assert report.checks["settings"].status == "ok"
    assert report.checks["preset_bundle"].status == "error"
    assert "no preset" in (report.checks["preset_bundle"].message or "").lower()


@pytest.mark.unit
def test_run_readiness_checks_fails_when_preset_sgf_invalid(
    tmp_path: Path,
) -> None:
    (tmp_path / "broken.sgf").write_text("(;GM[1])", encoding="utf-8")

    report = run_readiness_checks(presets_dir=tmp_path)

    assert report.ready is False
    assert report.checks["preset_bundle"].status == "error"


@pytest.mark.unit
def test_readiness_report_ready_when_all_checks_ok() -> None:
    checks = {
        "settings": CheckResult(status="ok"),
        "preset_bundle": CheckResult(status="ok", detail={"preset_count": 1}),
    }
    report = ReadinessReport(checks=checks)

    assert report.ready is True


@pytest.mark.unit
def test_readiness_report_not_ready_when_any_check_errors() -> None:
    checks = {
        "settings": CheckResult(status="ok"),
        "preset_bundle": CheckResult(status="error", message="missing"),
    }
    report = ReadinessReport(checks=checks)

    assert report.ready is False
