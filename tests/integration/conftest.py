"""Shared fixtures and helpers for integration tests."""

from __future__ import annotations

import copy
import os
from typing import Any

import pytest
from sgfmill import boards

from backend.app.config import Settings, reset_settings_cache
from backend.app.engine.board import format_gtp_coordinate, to_sgfmill_color
from backend.app.presets.loader import get_preset_by_id


def _real_katago_settings() -> Settings | None:
    """Return settings when real KataGo paths are configured (env or .env file)."""
    try:
        settings = Settings()
    except ValueError:
        return None

    binary = settings.katago_binary_path
    if not binary.is_file() or not os.access(binary, os.X_OK):
        return None
    return settings


@pytest.fixture
def katago_settings() -> Settings:
    settings = _real_katago_settings()
    if settings is None:
        pytest.skip(
            "Real KataGo not configured. Set KATAGO_BINARY_PATH, "
            "KATAGO_CONFIG_PATH, and KATAGO_MODEL_PATH to runnable paths."
        )
    return settings


@pytest.fixture(autouse=True)
def _clear_settings_cache() -> None:
    reset_settings_cache()
    yield
    reset_settings_cache()


@pytest.fixture
def live_katago_env(
    katago_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> Settings:
    """Point integration tests at the real local KataGo install."""
    monkeypatch.setenv("KATAGO_BINARY_PATH", str(katago_settings.katago_binary_path))
    monkeypatch.setenv("KATAGO_CONFIG_PATH", str(katago_settings.katago_config_path))
    monkeypatch.setenv("KATAGO_MODEL_PATH", str(katago_settings.katago_model_path))
    monkeypatch.setenv("SURVIVAL_THRESHOLD", str(katago_settings.survival_threshold))
    monkeypatch.setenv("KATAGO_TOP_N", str(katago_settings.katago_top_n))
    monkeypatch.setenv(
        "KATAGO_ANALYSIS_TIMEOUT_SECONDS",
        str(katago_settings.katago_analysis_timeout_seconds),
    )
    reset_settings_cache()
    return katago_settings


def first_legal_move_for_side(preset_id: str, *, side: str) -> str:
    preset = get_preset_by_id(preset_id)
    board = preset.board
    sgf_color = to_sgfmill_color(side)
    for row in range(board.side):
        for col in range(board.side):
            if board.get(row, col) is not None:
                continue
            trial = copy.deepcopy(board)
            try:
                trial.play(row, col, sgf_color)
            except ValueError:
                continue
            return format_gtp_coordinate(row, col, size=board.side)
    raise AssertionError(f"no legal move available for side {side}")


def first_legal_move_on_board(board: boards.Board, *, side: str) -> str:
    sgf_color = to_sgfmill_color(side)
    for row in range(board.side):
        for col in range(board.side):
            if board.get(row, col) is not None:
                continue
            trial = board.copy()
            try:
                trial.play(row, col, sgf_color)
            except ValueError:
                continue
            return format_gtp_coordinate(row, col, size=board.side)
    raise AssertionError(f"no legal move available for side {side}")


def extract_metrics(payload: dict[str, Any]) -> dict[str, Any]:
    metrics = payload.get("metrics")
    if isinstance(metrics, dict):
        return metrics
    analysis = payload.get("analysis")
    if isinstance(analysis, dict):
        nested_metrics = analysis.get("metrics")
        if isinstance(nested_metrics, dict):
            return nested_metrics
    raise AssertionError("response does not include metrics")


def create_live_game(
    api_client: Any,
    *,
    preset_id: str = "balanced",
) -> tuple[str, str]:
    """Create a game and apply one human move; return (game_id, human_move)."""
    human_side = get_preset_by_id(preset_id).initial_player_to_move
    human_move = first_legal_move_for_side(preset_id, side=human_side)

    create_response = api_client.post(
        "/api/games",
        json={"preset_id": preset_id, "human_side": human_side},
    )
    assert create_response.status_code == 201
    game_id = create_response.json()["game_id"]

    move_response = api_client.post(
        f"/api/games/{game_id}/move",
        json={"move": human_move},
    )
    assert move_response.status_code == 200
    return game_id, human_move
