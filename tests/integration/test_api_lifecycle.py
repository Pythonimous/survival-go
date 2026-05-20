"""Integration tests for core API lifecycle endpoints."""

from __future__ import annotations

import copy
from typing import Any

import pytest
from fastapi.testclient import TestClient

from backend.app.engine.board import (
    format_gtp_coordinate,
    parse_gtp_coordinate,
    to_sgfmill_color,
)
from backend.app.presets.loader import get_preset_by_id
from tests.integration.conftest import first_legal_move_on_board


@pytest.fixture
def api_client() -> TestClient:
    from backend.app.main import create_app

    return TestClient(create_app())


def _first_legal_move_for_side(preset_id: str, *, side: str) -> str:
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


def _extract_metrics(payload: dict[str, Any]) -> dict[str, Any]:
    metrics = payload.get("metrics")
    if isinstance(metrics, dict):
        return metrics
    analysis = payload.get("analysis")
    if isinstance(analysis, dict):
        nested_metrics = analysis.get("metrics")
        if isinstance(nested_metrics, dict):
            return nested_metrics
    raise AssertionError("response does not include metrics")


def _raw_model_outputs(*, ownership: list[float] | None = None) -> dict[str, object]:
    ownership_values = ownership if ownership is not None else [-0.2] + [1.0] * 360
    return {
        "policy": [0.0] * ((19 * 19 + 1) * 6),
        "ownership": ownership_values,
        "value": [0.1, -0.2, 0.3],
        "miscvalue": [0.0] * 10,
    }


def _browser_engine_move_body(
    *,
    position_ownership: list[float] | None = None,
    candidate_ownerships: dict[str, list[float]] | None = None,
    candidate_moves: list[str] | None = None,
) -> dict[str, object]:
    position = _raw_model_outputs(ownership=position_ownership)
    moves = candidate_moves or []
    ownerships = candidate_ownerships or {}
    candidates = []
    for move in moves:
        candidates.append(
            {
                "move": move,
                "policy_prob": 0.5,
                "raw_model_outputs": _raw_model_outputs(
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


@pytest.mark.integration
def test_create_game_human_black_starts_with_white_to_move(
    api_client: TestClient,
) -> None:
    create_response = api_client.post(
        "/api/games",
        json={"preset_id": "balanced", "human_side": "B"},
    )
    assert create_response.status_code == 201
    game_id = create_response.json()["game_id"]

    state_response = api_client.get(f"/api/games/{game_id}")
    assert state_response.status_code == 200
    state = state_response.json()
    assert state["human_side"] == "B"
    assert state["engine_side"] == "W"
    assert state["next_to_move"] == "W"
    assert state["moves_played"] == 0
    assert state["last_move"] is None


@pytest.mark.integration
def test_api_lifecycle_create_fetch_move_analyze_and_engine_move(
    api_client: TestClient,
) -> None:
    preset_id = "balanced"
    human_side = get_preset_by_id(preset_id).initial_player_to_move
    human_move = _first_legal_move_for_side(preset_id, side=human_side)

    presets_response = api_client.get("/api/presets")
    assert presets_response.status_code == 200
    presets_payload = presets_response.json()
    assert isinstance(presets_payload, list)
    assert any(preset.get("id") == preset_id for preset in presets_payload)

    create_response = api_client.post(
        "/api/games",
        json={"preset_id": preset_id, "human_side": human_side},
    )
    assert create_response.status_code == 201
    game_id = create_response.json()["game_id"]

    state_response = api_client.get(f"/api/games/{game_id}")
    assert state_response.status_code == 200

    human_move_response = api_client.post(
        f"/api/games/{game_id}/move",
        json={"move": human_move},
    )
    assert human_move_response.status_code == 200

    analyze_response = api_client.post(
        f"/api/games/{game_id}/analyze",
        json={"raw_model_outputs": _raw_model_outputs()},
    )
    assert analyze_response.status_code == 200
    metrics = _extract_metrics(analyze_response.json())
    assert metrics["unresolved_count"] == 1
    assert float(metrics["min_black_probability"]) == pytest.approx(0.4)

    state_after_human = human_move_response.json()
    preset_board = copy.deepcopy(get_preset_by_id(preset_id).board)
    row, col = parse_gtp_coordinate(human_move, size=preset_board.side)
    preset_board.play(row, col, to_sgfmill_color(human_side))
    engine_move = first_legal_move_on_board(
        preset_board,
        side=state_after_human["engine_side"],
    )

    engine_move_response = api_client.post(
        f"/api/games/{game_id}/engine-move",
        json=_browser_engine_move_body(
            candidate_moves=[engine_move],
            candidate_ownerships={
                engine_move: [-0.2] + [1.0] * 360,
            },
        ),
    )
    assert engine_move_response.status_code == 200
    engine_payload = engine_move_response.json()
    assert engine_payload["move"] == engine_move
    assert len(engine_payload["candidates"]) >= 1


@pytest.mark.integration
def test_analyze_rejects_empty_body(api_client: TestClient) -> None:
    create_response = api_client.post(
        "/api/games",
        json={"preset_id": "balanced", "human_side": "W"},
    )
    assert create_response.status_code == 201
    game_id = create_response.json()["game_id"]

    response = api_client.post(f"/api/games/{game_id}/analyze")

    assert response.status_code == 422


@pytest.mark.integration
def test_engine_move_rejects_empty_body(api_client: TestClient) -> None:
    create_response = api_client.post(
        "/api/games",
        json={"preset_id": "balanced", "human_side": "W"},
    )
    assert create_response.status_code == 201
    game_id = create_response.json()["game_id"]

    response = api_client.post(f"/api/games/{game_id}/engine-move")

    assert response.status_code == 422


@pytest.mark.integration
def test_analyze_accepts_raw_onnx_outputs_payload(api_client: TestClient) -> None:
    create_response = api_client.post(
        "/api/games",
        json={"preset_id": "balanced", "human_side": "W"},
    )
    assert create_response.status_code == 201
    game_id = create_response.json()["game_id"]

    response = api_client.post(
        f"/api/games/{game_id}/analyze",
        json={"raw_model_outputs": _raw_model_outputs()},
    )

    assert response.status_code == 200
    payload = response.json()
    metrics = _extract_metrics(payload)
    assert metrics["unresolved_count"] == 1
    assert float(metrics["min_black_probability"]) == pytest.approx(0.4)
    policy = payload.get("policy")
    assert isinstance(policy, list)
    assert len(policy) == 362
    assert sum(float(value) for value in policy) == pytest.approx(1.0)
    p_black = payload.get("p_black")
    assert isinstance(p_black, list)
    assert len(p_black) == 361
    assert float(p_black[0]) == pytest.approx(0.4)
    assert float(payload["winrate"]) == pytest.approx(0.33758453, rel=1e-6)


@pytest.mark.integration
def test_create_game_accepts_difficulty_and_exposes_in_game_state(
    api_client: TestClient,
) -> None:
    create_response = api_client.post(
        "/api/games",
        json={
            "preset_id": "balanced",
            "human_side": "W",
            "difficulty": {"max_visits": 33, "top_n": 4, "randomness": 0.2},
        },
    )
    assert create_response.status_code == 201
    game_id = create_response.json()["game_id"]

    state_response = api_client.get(f"/api/games/{game_id}")
    assert state_response.status_code == 200
    difficulty = state_response.json()["difficulty"]
    assert difficulty["max_visits"] == 33
    assert difficulty["top_n"] == 4
    assert float(difficulty["randomness"]) == pytest.approx(0.2)


@pytest.mark.integration
def test_difficulty_presets_endpoint_returns_backend_defined_presets(
    api_client: TestClient,
) -> None:
    response = api_client.get("/api/difficulty-presets")

    assert response.status_code == 200
    payload = response.json()
    assert [item["id"] for item in payload] == ["easy", "normal", "hard", "impossible"]
    assert payload[0]["config"]["max_visits"] >= 1


@pytest.mark.integration
def test_engine_move_white_resigns_when_black_ownership_dominates(
    api_client: TestClient,
) -> None:
    dominant_black = [0.995] + [0.996] * 360

    create_response = api_client.post(
        "/api/games",
        json={"preset_id": "balanced", "human_side": "B"},
    )
    assert create_response.status_code == 201
    game_id = create_response.json()["game_id"]

    engine_move_response = api_client.post(
        f"/api/games/{game_id}/engine-move",
        json=_browser_engine_move_body(position_ownership=dominant_black),
    )
    assert engine_move_response.status_code == 200
    payload = engine_move_response.json()
    assert payload["resigned"] is True
    assert payload["move"] == ""
    assert payload["winner"] == "B"
    assert payload["status"] == "finished"
    assert payload["candidates"] == []


@pytest.mark.integration
def test_human_resign_finishes_game_with_engine_winner(api_client: TestClient) -> None:
    create_response = api_client.post(
        "/api/games",
        json={"preset_id": "balanced", "human_side": "W"},
    )
    assert create_response.status_code == 201
    game_id = create_response.json()["game_id"]

    resign_response = api_client.post(f"/api/games/{game_id}/resign")
    assert resign_response.status_code == 200
    payload = resign_response.json()
    assert payload["status"] == "finished"
    assert payload["winner"] == "B"


@pytest.mark.integration
def test_delete_game_ends_session_and_returns_not_found_afterward(
    api_client: TestClient,
) -> None:
    create_response = api_client.post(
        "/api/games",
        json={"preset_id": "balanced", "human_side": "W"},
    )
    assert create_response.status_code == 201
    game_id = create_response.json()["game_id"]

    delete_response = api_client.delete(f"/api/games/{game_id}")
    assert delete_response.status_code == 204

    state_response = api_client.get(f"/api/games/{game_id}")
    assert state_response.status_code == 404


@pytest.mark.integration
def test_delete_unknown_game_returns_not_found(api_client: TestClient) -> None:
    response = api_client.delete("/api/games/does-not-exist")

    assert response.status_code == 404
