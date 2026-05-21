"""Integration tests for deterministic preset-based game setup."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.app.presets.loader import get_preset_by_id
from tests.integration.conftest import PRESET_IDS, create_game_from_preset


@pytest.mark.integration
@pytest.mark.parametrize("preset_id", PRESET_IDS)
def test_create_game_from_preset_matches_expected_initial_state(
    api_client: TestClient,
    preset_id: str,
) -> None:
    preset = get_preset_by_id(preset_id)
    setup = create_game_from_preset(api_client, preset_id=preset_id)

    state_response = api_client.get(f"/api/games/{setup.game_id}")
    assert state_response.status_code == 200
    state = state_response.json()

    assert state["preset_id"] == preset_id
    assert state["board_size"] == 19
    assert state["human_side"] == preset.initial_player_to_move
    assert state["engine_side"] == setup.engine_side
    assert state["next_to_move"] == preset.initial_player_to_move
    assert state["moves_played"] == 0
    assert state["last_move"] is None
    assert state["status"] == "active"
    assert state["winner"] is None
    assert len(state["stones"]) == len(list(preset.board.list_occupied_points()))
    assert len(state["legal_moves"]) >= 1
