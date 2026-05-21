"""Integration: POST /engine-move with browser raw candidate payload (API contract)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.app.engine.board import format_gtp_coordinate, to_sgfmill_color
from tests.fixtures.onnx_engine_move.loader import (
    load_all_engine_move_fixtures,
    resolve_candidate_raw,
    resolve_position_raw,
)
from backend.app.presets.loader import get_preset_by_id
from tests.integration.conftest import first_legal_move_for_side


def _resolve_legal_moves_for_slots(*, preset_id: str, side: str, slots: list[int]) -> list[str]:
    board = get_preset_by_id(preset_id).board.copy()
    sgf_color = to_sgfmill_color(side)
    legal: list[str] = []
    for row in range(board.side):
        for col in range(board.side):
            if board.get(row, col) is not None:
                continue
            trial = board.copy()
            try:
                trial.play(row, col, sgf_color)
            except ValueError:
                continue
            legal.append(format_gtp_coordinate(row, col, size=board.side))
    return [legal[slot] for slot in slots]


def _browser_engine_move_body(fixture: dict) -> dict:
    position_raw = resolve_position_raw(fixture)
    move_slots = [int(item["moveSlot"]) for item in fixture["policyCandidates"]]
    resolved_moves = _resolve_legal_moves_for_slots(
        preset_id=str(fixture["game"]["presetId"]),
        side="B" if fixture["game"]["humanSide"] == "W" else "W",
        slots=move_slots,
    )
    candidates = []
    for move, item in zip(resolved_moves, fixture["policyCandidates"], strict=True):
        raw = resolve_candidate_raw(item)
        candidates.append(
            {
                "move": move,
                "policy_prob": item["policyProb"],
                "raw_model_outputs": raw,
            }
        )
    return {
        "browser_engine_move": {
            "position_raw": position_raw,
            "candidates": candidates,
        }
    }


@pytest.mark.integration
@pytest.mark.parametrize("fixture", load_all_engine_move_fixtures(), ids=lambda item: item["id"])
def test_engine_move_regression_fixture_via_api(
    api_client: TestClient,
    fixture: dict,
) -> None:
    game_cfg = fixture["game"]
    create_response = api_client.post(
        "/api/games",
        json={"preset_id": game_cfg["presetId"], "human_side": game_cfg["humanSide"]},
    )
    assert create_response.status_code == 201
    game_id = create_response.json()["game_id"]

    human_move = first_legal_move_for_side(game_cfg["presetId"], side=game_cfg["humanSide"])
    move_response = api_client.post(
        f"/api/games/{game_id}/move",
        json={"move": human_move},
    )
    assert move_response.status_code == 200

    engine_response = api_client.post(
        f"/api/games/{game_id}/engine-move",
        json=_browser_engine_move_body(fixture),
    )
    assert engine_response.status_code == 200
    payload = engine_response.json()
    expected = fixture["expected"]
    assert payload.get("resigned") is expected.get("resigned", False)
