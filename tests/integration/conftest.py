"""Shared fixtures and helpers for integration tests."""

from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sgfmill import boards

from backend.app.config import reset_settings_cache
from backend.app.engine.board import format_gtp_coordinate, to_sgfmill_color
from backend.app.presets.loader import get_preset_by_id

PRESET_IDS: tuple[str, ...] = ("balanced", "black-flavoured", "white-flavoured")
UNKNOWN_GAME_ID = "00000000-0000-0000-0000-000000000000"


@pytest.fixture(autouse=True)
def _clear_settings_cache() -> None:
    reset_settings_cache()
    yield
    reset_settings_cache()


@pytest.fixture
def api_client() -> TestClient:
    from backend.app.main import create_app

    return TestClient(create_app())


@dataclass(frozen=True)
class PresetGameSetup:
    """Deterministic API game created from a preset."""

    preset_id: str
    game_id: str
    human_side: str
    engine_side: str
    initial_player: str


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


def occupied_coordinate(preset_id: str) -> str:
    """Return GTP coordinate of any stone on the preset starting board."""
    preset = get_preset_by_id(preset_id)
    board = preset.board
    for row in range(board.side):
        for col in range(board.side):
            if board.get(row, col) is not None:
                return format_gtp_coordinate(row, col, size=board.side)
    raise AssertionError(f"preset {preset_id} has no setup stones")


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


def create_game_from_preset(
    api_client: TestClient,
    *,
    preset_id: str,
    human_side: str | None = None,
) -> PresetGameSetup:
    """Create a game via API using preset defaults unless human_side is overridden."""
    preset = get_preset_by_id(preset_id)
    resolved_human = human_side or preset.initial_player_to_move
    engine_side = "W" if resolved_human == "B" else "B"

    create_response = api_client.post(
        "/api/games",
        json={"preset_id": preset_id, "human_side": resolved_human},
    )
    assert create_response.status_code == 201
    game_id = create_response.json()["game_id"]

    return PresetGameSetup(
        preset_id=preset_id,
        game_id=game_id,
        human_side=resolved_human,
        engine_side=engine_side,
        initial_player=preset.initial_player_to_move,
    )


def create_live_game(
    api_client: Any,
    *,
    preset_id: str = "balanced",
) -> tuple[str, str]:
    """Create a game and apply one human move; return (game_id, human_move)."""
    setup = create_game_from_preset(api_client, preset_id=preset_id)
    human_move = first_legal_move_for_side(preset_id, side=setup.human_side)

    move_response = api_client.post(
        f"/api/games/{setup.game_id}/move",
        json={"move": human_move},
    )
    assert move_response.status_code == 200
    return setup.game_id, human_move


def raw_model_outputs(*, ownership: list[float] | None = None) -> dict[str, object]:
    ownership_values = ownership if ownership is not None else [-0.2] + [1.0] * 360
    return {
        "policy": [0.0] * ((19 * 19 + 1) * 6),
        "ownership": ownership_values,
        "value": [0.1, -0.2, 0.3],
        "miscvalue": [0.0] * 10,
    }


def browser_engine_move_body(
    *,
    position_ownership: list[float] | None = None,
    candidate_ownerships: dict[str, list[float]] | None = None,
    candidate_moves: list[str] | None = None,
) -> dict[str, object]:
    position = raw_model_outputs(ownership=position_ownership)
    moves = candidate_moves or []
    ownerships = candidate_ownerships or {}
    candidates = []
    for move in moves:
        candidates.append(
            {
                "move": move,
                "policy_prob": 0.5,
                "raw_model_outputs": raw_model_outputs(
                    ownership=ownerships.get(move, [1.0] * 361),
                ),
            }
        )
    return {
        "browser_engine_move": {
            "position_raw": position,
            "candidates": candidates,
        }
    }
