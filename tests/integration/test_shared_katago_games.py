"""Integration tests for multiple games sharing one KataGo analysis subprocess."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import pytest
from fastapi.testclient import TestClient

from backend.app.presets.loader import count_stones, get_preset_by_id
from tests.integration.conftest import create_live_game, extract_metrics


def _stone_counts(state: dict[str, Any]) -> tuple[int, int]:
    black = sum(1 for stone in state["stones"] if stone["color"] == "B")
    white = sum(1 for stone in state["stones"] if stone["color"] == "W")
    return black, white


def _preset_stone_counts(preset_id: str) -> tuple[int, int]:
    return count_stones(get_preset_by_id(preset_id).board)


def _setup_two_distinct_games(
    api_client: TestClient,
) -> tuple[str, str, tuple[int, int], tuple[int, int]]:
    """Create two games on different presets with one human move each."""
    game_a_id, _ = create_live_game(api_client, preset_id="white-flavoured")
    game_b_id, _ = create_live_game(api_client, preset_id="black-flavoured")

    state_a = api_client.get(f"/api/games/{game_a_id}").json()
    state_b = api_client.get(f"/api/games/{game_b_id}").json()
    return game_a_id, game_b_id, _stone_counts(state_a), _stone_counts(state_b)


@pytest.fixture
def live_api_client(live_katago_env: object) -> TestClient:
    del live_katago_env
    from backend.app.main import create_app

    return TestClient(create_app())


@pytest.mark.integration
def test_two_games_analyze_without_crosstalk(live_api_client: TestClient) -> None:
    game_a_id, game_b_id, counts_after_human_a, counts_after_human_b = (
        _setup_two_distinct_games(live_api_client)
    )

    analyze_a = live_api_client.post(f"/api/games/{game_a_id}/analyze")
    analyze_b = live_api_client.post(f"/api/games/{game_b_id}/analyze")

    assert analyze_a.status_code == 200
    assert analyze_b.status_code == 200
    payload_a = analyze_a.json()
    payload_b = analyze_b.json()
    assert payload_a["game_id"] == game_a_id
    assert payload_b["game_id"] == game_b_id
    assert extract_metrics(payload_a)["unresolved_count"] >= 0
    assert extract_metrics(payload_b)["unresolved_count"] >= 0

    state_a = live_api_client.get(f"/api/games/{game_a_id}").json()
    state_b = live_api_client.get(f"/api/games/{game_b_id}").json()
    assert _stone_counts(state_a) == counts_after_human_a
    assert _stone_counts(state_b) == counts_after_human_b


@pytest.mark.integration
def test_two_games_engine_move_without_crosstalk(live_api_client: TestClient) -> None:
    game_a_id, game_b_id, counts_after_human_a, counts_after_human_b = (
        _setup_two_distinct_games(live_api_client)
    )

    engine_a = live_api_client.post(f"/api/games/{game_a_id}/engine-move")
    engine_b = live_api_client.post(f"/api/games/{game_b_id}/engine-move")

    assert engine_a.status_code == 200
    assert engine_b.status_code == 200
    assert engine_a.json()["game_id"] == game_a_id
    assert engine_b.json()["game_id"] == game_b_id

    state_a = live_api_client.get(f"/api/games/{game_a_id}").json()
    state_b = live_api_client.get(f"/api/games/{game_b_id}").json()

    black_a, white_a = _stone_counts(state_a)
    black_b, white_b = _stone_counts(state_b)
    black_human_a, white_human_a = counts_after_human_a
    black_human_b, white_human_b = counts_after_human_b

    assert black_a + white_a == black_human_a + white_human_a + 1
    assert black_b + white_b == black_human_b + white_human_b + 1

    preset_a = _preset_stone_counts("white-flavoured")
    preset_b = _preset_stone_counts("black-flavoured")
    assert (black_a, white_a) != (black_human_b, white_human_b)
    assert preset_a != preset_b


@pytest.mark.integration
def test_concurrent_analyze_and_engine_move_two_games(live_api_client: TestClient) -> None:
    game_a_id, game_b_id, counts_after_human_a, counts_after_human_b = (
        _setup_two_distinct_games(live_api_client)
    )

    def analyze(game_id: str) -> dict[str, Any]:
        response = live_api_client.post(f"/api/games/{game_id}/analyze")
        assert response.status_code == 200
        payload = response.json()
        assert payload["game_id"] == game_id
        return payload

    def engine_move(game_id: str) -> dict[str, Any]:
        response = live_api_client.post(f"/api/games/{game_id}/engine-move")
        assert response.status_code == 200
        payload = response.json()
        assert payload["game_id"] == game_id
        return payload

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [
            pool.submit(analyze, game_a_id),
            pool.submit(analyze, game_b_id),
            pool.submit(engine_move, game_a_id),
            pool.submit(engine_move, game_b_id),
        ]
        results = [future.result() for future in as_completed(futures)]

    assert len(results) == 4
    analyze_ids = {payload["game_id"] for payload in results if "move" not in payload}
    engine_ids = {payload["game_id"] for payload in results if "move" in payload}
    assert analyze_ids == {game_a_id, game_b_id}
    assert engine_ids == {game_a_id, game_b_id}

    state_a = live_api_client.get(f"/api/games/{game_a_id}").json()
    state_b = live_api_client.get(f"/api/games/{game_b_id}").json()
    black_a, white_a = _stone_counts(state_a)
    black_b, white_b = _stone_counts(state_b)
    black_human_a, white_human_a = counts_after_human_a
    black_human_b, white_human_b = counts_after_human_b

    assert black_a + white_a == black_human_a + white_human_a + 1
    assert black_b + white_b == black_human_b + white_human_b + 1
