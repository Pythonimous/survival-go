"""Unit tests for backend environment settings."""

import pytest
from pydantic import ValidationError

from backend.app.config import Settings, get_settings, reset_settings_cache


@pytest.fixture(autouse=True)
def _clear_settings_cache() -> None:
    reset_settings_cache()
    yield
    reset_settings_cache()


@pytest.mark.unit
def test_settings_loads_defaults() -> None:
    settings = Settings()

    assert settings.survival_threshold == pytest.approx(0.95)
    assert settings.default_top_n == 8
    assert "http://localhost:5173" in settings.cors_allow_origins


@pytest.mark.unit
def test_settings_parses_cors_allow_origins_from_comma_separated_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
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
def test_settings_accepts_overrides(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SURVIVAL_THRESHOLD", "0.9")
    monkeypatch.setenv("DEFAULT_TOP_N", "12")

    settings = Settings()

    assert settings.survival_threshold == pytest.approx(0.9)
    assert settings.default_top_n == 12


@pytest.mark.unit
@pytest.mark.parametrize(
    ("env_name", "value"),
    [
        ("SURVIVAL_THRESHOLD", "0"),
        ("SURVIVAL_THRESHOLD", "1.5"),
        ("DEFAULT_TOP_N", "0"),
    ],
)
def test_settings_rejects_invalid_numeric_values(
    monkeypatch: pytest.MonkeyPatch,
    env_name: str,
    value: str,
) -> None:
    monkeypatch.setenv(env_name, value)

    with pytest.raises(ValidationError):
        Settings()


@pytest.mark.unit
def test_get_settings_is_cached(monkeypatch: pytest.MonkeyPatch) -> None:
    first = get_settings()
    second = get_settings()

    assert first is second


@pytest.mark.unit
def test_create_app_starts_without_katago_env(monkeypatch: pytest.MonkeyPatch) -> None:
    import importlib
    import sys

    reset_settings_cache()
    for key in (
        "KATAGO_BINARY_PATH",
        "KATAGO_CONFIG_PATH",
        "KATAGO_MODEL_PATH",
    ):
        monkeypatch.delenv(key, raising=False)

    sys.modules.pop("backend.app.main", None)
    module = importlib.import_module("backend.app.main")
    assert module.create_app() is not None
