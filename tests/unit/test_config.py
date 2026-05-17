"""Unit tests for backend environment settings."""

from pathlib import Path

import pytest
from pydantic import ValidationError

from backend.app.config import Settings, get_settings, reset_settings_cache


@pytest.fixture(autouse=True)
def _clear_settings_cache() -> None:
    reset_settings_cache()
    yield
    reset_settings_cache()


@pytest.fixture
def katago_paths(tmp_path: Path) -> dict[str, str]:
    binary = tmp_path / "katago"
    binary.write_text("#!/bin/sh\n", encoding="utf-8")
    binary.chmod(0o755)
    config = tmp_path / "analysis.cfg"
    config.write_text("numSearchThreads = 1\n", encoding="utf-8")
    model = tmp_path / "model.bin.gz"
    model.write_bytes(b"fake-model")
    return {
        "KATAGO_BINARY_PATH": str(binary),
        "KATAGO_CONFIG_PATH": str(config),
        "KATAGO_MODEL_PATH": str(model),
    }


def _set_katago_env(monkeypatch: pytest.MonkeyPatch, paths: dict[str, str]) -> None:
    for key, value in paths.items():
        monkeypatch.setenv(key, value)


@pytest.mark.unit
def test_settings_loads_required_paths_and_defaults(
    monkeypatch: pytest.MonkeyPatch, katago_paths: dict[str, str]
) -> None:
    _set_katago_env(monkeypatch, katago_paths)

    settings = Settings()

    assert settings.katago_binary_path.is_file()
    assert settings.katago_config_path.is_file()
    assert settings.katago_model_path.is_file()
    assert settings.survival_threshold == pytest.approx(0.95)
    assert settings.katago_top_n == 8
    assert settings.katago_analysis_timeout_seconds == pytest.approx(30.0)
    assert "http://localhost:5173" in settings.cors_allow_origins


@pytest.mark.unit
def test_settings_parses_cors_allow_origins_from_comma_separated_env(
    monkeypatch: pytest.MonkeyPatch, katago_paths: dict[str, str]
) -> None:
    _set_katago_env(monkeypatch, katago_paths)
    monkeypatch.setenv(
        "CORS_ALLOW_ORIGINS",
        "https://app.example.com, https://app.example.org",
    )

    settings = Settings()

    assert settings.cors_allow_origins == [
        "https://app.example.com",
        "https://app.example.org",
    ]


@pytest.mark.unit
def test_settings_accepts_overrides(
    monkeypatch: pytest.MonkeyPatch, katago_paths: dict[str, str]
) -> None:
    _set_katago_env(monkeypatch, katago_paths)
    monkeypatch.setenv("SURVIVAL_THRESHOLD", "0.9")
    monkeypatch.setenv("KATAGO_TOP_N", "12")
    monkeypatch.setenv("KATAGO_ANALYSIS_TIMEOUT_SECONDS", "45")

    settings = Settings()

    assert settings.survival_threshold == pytest.approx(0.9)
    assert settings.katago_top_n == 12
    assert settings.katago_analysis_timeout_seconds == pytest.approx(45.0)


@pytest.mark.unit
def test_settings_rejects_missing_required_env(
    monkeypatch: pytest.MonkeyPatch, katago_paths: dict[str, str]
) -> None:
    _set_katago_env(monkeypatch, katago_paths)
    monkeypatch.delenv("KATAGO_MODEL_PATH", raising=False)

    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None)

    assert "KATAGO_MODEL_PATH" in str(exc_info.value)


@pytest.mark.unit
def test_settings_rejects_missing_file_on_disk(
    monkeypatch: pytest.MonkeyPatch, katago_paths: dict[str, str]
) -> None:
    _set_katago_env(monkeypatch, katago_paths)
    monkeypatch.setenv("KATAGO_MODEL_PATH", "/no/such/model.bin.gz")

    with pytest.raises(ValidationError) as exc_info:
        Settings()

    assert "does not exist" in str(exc_info.value).lower()


@pytest.mark.unit
@pytest.mark.parametrize(
    ("env_name", "value"),
    [
        ("SURVIVAL_THRESHOLD", "0"),
        ("SURVIVAL_THRESHOLD", "1.5"),
        ("KATAGO_TOP_N", "0"),
        ("KATAGO_ANALYSIS_TIMEOUT_SECONDS", "-1"),
    ],
)
def test_settings_rejects_invalid_numeric_values(
    monkeypatch: pytest.MonkeyPatch,
    katago_paths: dict[str, str],
    env_name: str,
    value: str,
) -> None:
    _set_katago_env(monkeypatch, katago_paths)
    monkeypatch.setenv(env_name, value)

    with pytest.raises(ValidationError):
        Settings()


@pytest.mark.unit
def test_get_settings_is_cached(
    monkeypatch: pytest.MonkeyPatch, katago_paths: dict[str, str]
) -> None:
    _set_katago_env(monkeypatch, katago_paths)

    first = get_settings()
    second = get_settings()

    assert first is second


@pytest.mark.unit
def test_create_app_fails_fast_without_required_env(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    import importlib
    import sys

    reset_settings_cache()
    monkeypatch.chdir(tmp_path)
    for key in (
        "KATAGO_BINARY_PATH",
        "KATAGO_CONFIG_PATH",
        "KATAGO_MODEL_PATH",
    ):
        monkeypatch.delenv(key, raising=False)

    sys.modules.pop("backend.app.main", None)
    with pytest.raises(ValidationError):
        importlib.import_module("backend.app.main")
