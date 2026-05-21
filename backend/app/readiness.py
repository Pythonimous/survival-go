"""Startup/readiness checks for preset bundle and application settings."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from backend.app.config import Settings, get_settings
from backend.app.presets.loader import PresetLoadError, list_presets

CheckStatus = Literal["ok", "error"]


@dataclass(frozen=True)
class CheckResult:
    status: CheckStatus
    message: str | None = None
    detail: dict[str, Any] | None = None


@dataclass(frozen=True)
class ReadinessReport:
    checks: dict[str, CheckResult]

    @property
    def ready(self) -> bool:
        return all(check.status == "ok" for check in self.checks.values())


def _check_settings(settings: Settings) -> CheckResult:
    return CheckResult(
        status="ok",
        detail={
            "survival_threshold": settings.survival_threshold,
            "default_top_n": settings.default_top_n,
        },
    )


def _check_preset_bundle(*, presets_dir: Path) -> CheckResult:
    try:
        presets = list_presets(presets_dir=presets_dir)
    except PresetLoadError as exc:
        return CheckResult(status="error", message=str(exc))
    return CheckResult(
        status="ok",
        detail={"preset_count": len(presets)},
    )


def run_readiness_checks(
    *,
    settings: Settings | None = None,
    presets_dir: Path | None = None,
) -> ReadinessReport:
    """Validate settings and load the preset SGF bundle."""
    resolved_settings = settings or get_settings()
    from backend.app.presets.loader import DEFAULT_PRESETS_DIR

    resolved_presets_dir = presets_dir or DEFAULT_PRESETS_DIR
    checks = {
        "settings": _check_settings(resolved_settings),
        "preset_bundle": _check_preset_bundle(presets_dir=resolved_presets_dir),
    }
    return ReadinessReport(checks=checks)
