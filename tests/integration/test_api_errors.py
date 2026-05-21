"""Integration tests for API error paths (invalid moves, missing games, ONNX failures)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from tests.integration.conftest import (
    UNKNOWN_GAME_ID,
    browser_engine_move_body,
    create_game_from_preset,
    first_legal_move_for_side,
    occupied_coordinate,
    raw_model_outputs,
)


@pytest.mark.integration
def test_apply_move_on_occupied_intersection_returns_bad_request(
    api_client: TestClient,
) -> None:
    setup = create_game_from_preset(api_client, preset_id="balanced")
    occupied = occupied_coordinate(setup.preset_id)

    response = api_client.post(
        f"/api/games/{setup.game_id}/move",
        json={"move": occupied},
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["code"] == "illegal_move"
    assert "illegal move" in detail["message"]


@pytest.mark.integration
def test_apply_move_out_of_turn_after_human_plays_returns_bad_request(
    api_client: TestClient,
) -> None:
    setup = create_game_from_preset(api_client, preset_id="balanced")
    first_move = first_legal_move_for_side(setup.preset_id, side=setup.human_side)
    second_move = first_legal_move_for_side(setup.preset_id, side=setup.human_side)

    first_response = api_client.post(
        f"/api/games/{setup.game_id}/move",
        json={"move": first_move},
    )
    assert first_response.status_code == 200

    response = api_client.post(
        f"/api/games/{setup.game_id}/move",
        json={"move": second_move},
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["code"] == "wrong_turn_human"
    assert "not the human side turn" in detail["message"]


@pytest.mark.integration
@pytest.mark.parametrize(
    ("method", "path", "json_body"),
    [
        ("get", f"/api/games/{UNKNOWN_GAME_ID}", None),
        ("post", f"/api/games/{UNKNOWN_GAME_ID}/move", {"move": "D4"}),
        (
            "post",
            f"/api/games/{UNKNOWN_GAME_ID}/analyze",
            {"raw_model_outputs": raw_model_outputs()},
        ),
        (
            "post",
            f"/api/games/{UNKNOWN_GAME_ID}/engine-move",
            browser_engine_move_body(),
        ),
        ("post", f"/api/games/{UNKNOWN_GAME_ID}/resign", None),
        ("delete", f"/api/games/{UNKNOWN_GAME_ID}", None),
    ],
)
def test_unknown_game_id_returns_not_found(
    api_client: TestClient,
    method: str,
    path: str,
    json_body: dict[str, object] | None,
) -> None:
    request = getattr(api_client, method)
    kwargs: dict[str, object] = {}
    if json_body is not None:
        kwargs["json"] = json_body

    response = request(path, **kwargs)

    assert response.status_code == 404
    detail = response.json()["detail"]
    assert detail["code"] == "game_not_found"
    assert "not found" in detail["message"].lower()


@pytest.mark.integration
def test_human_move_when_engine_to_play_returns_bad_request(
    api_client: TestClient,
) -> None:
    setup = create_game_from_preset(api_client, preset_id="balanced", human_side="B")
    engine_move = first_legal_move_for_side(setup.preset_id, side=setup.engine_side)

    response = api_client.post(
        f"/api/games/{setup.game_id}/move",
        json={"move": engine_move},
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["code"] == "wrong_turn_human"
    assert "not the human side turn" in detail["message"]


@pytest.mark.integration
def test_analyze_rejects_invalid_ownership_length(
    api_client: TestClient,
) -> None:
    setup = create_game_from_preset(api_client, preset_id="balanced")

    response = api_client.post(
        f"/api/games/{setup.game_id}/analyze",
        json={"raw_model_outputs": raw_model_outputs(ownership=[0.0] * 100)},
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["code"] == "invalid_ownership_length"
    assert "ownership length" in detail["message"]


@pytest.mark.integration
def test_analyze_rejects_short_policy_logits(
    api_client: TestClient,
) -> None:
    setup = create_game_from_preset(api_client, preset_id="balanced")

    response = api_client.post(
        f"/api/games/{setup.game_id}/analyze",
        json={
            "raw_model_outputs": {
                "policy": [0.0] * 361,
                "ownership": [0.0] * 361,
            }
        },
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["code"] == "invalid_policy_length"
    assert "policy length" in detail["message"]


@pytest.mark.integration
def test_engine_move_when_human_to_play_returns_bad_request(
    api_client: TestClient,
) -> None:
    setup = create_game_from_preset(api_client, preset_id="balanced")

    response = api_client.post(
        f"/api/games/{setup.game_id}/engine-move",
        json=browser_engine_move_body(),
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["code"] == "wrong_turn_engine"
    assert "not the engine side turn" in detail["message"]


@pytest.mark.integration
def test_engine_move_rejects_invalid_position_ownership_length(
    api_client: TestClient,
) -> None:
    setup = create_game_from_preset(api_client, preset_id="balanced", human_side="B")
    candidate = first_legal_move_for_side(setup.preset_id, side=setup.engine_side)

    response = api_client.post(
        f"/api/games/{setup.game_id}/engine-move",
        json=browser_engine_move_body(
            position_ownership=[0.0] * 50,
            candidate_moves=[candidate],
        ),
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["code"] == "invalid_ownership_length"
    assert "ownership length" in detail["message"]


@pytest.mark.integration
def test_engine_move_with_no_legal_candidates_returns_bad_request(
    api_client: TestClient,
) -> None:
    setup = create_game_from_preset(api_client, preset_id="balanced", human_side="B")
    illegal_for_engine = occupied_coordinate(setup.preset_id)

    response = api_client.post(
        f"/api/games/{setup.game_id}/engine-move",
        json=browser_engine_move_body(candidate_moves=[illegal_for_engine]),
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["code"] == "no_legal_engine_moves"
    assert "no legal engine moves" in detail["message"]
