"""Integration tests for analyze ownership → p_black API contract."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from tests.integration.conftest import create_game_from_preset, raw_model_outputs

BOARD_POINTS = 19 * 19


@pytest.mark.integration
@pytest.mark.parametrize(
    "ownership",
    [
        [-1.0] * BOARD_POINTS,
        [1.0] * BOARD_POINTS,
        [-0.2] + [1.0] * (BOARD_POINTS - 1),
        [0.0] * BOARD_POINTS,
        [2.5] + [-3.0] * (BOARD_POINTS - 1),
    ],
    ids=["all_black", "all_white", "mixed", "neutral", "out_of_range_clamped"],
)
def test_analyze_p_black_length_and_probability_range(
    api_client: TestClient,
    ownership: list[float],
) -> None:
    setup = create_game_from_preset(api_client, preset_id="balanced")

    response = api_client.post(
        f"/api/games/{setup.game_id}/analyze",
        json={"raw_model_outputs": raw_model_outputs(ownership=ownership)},
    )

    assert response.status_code == 200
    payload = response.json()
    p_black = payload.get("p_black")
    assert isinstance(p_black, list)
    assert len(p_black) == BOARD_POINTS
    for probability in p_black:
        assert isinstance(probability, float)
        assert 0.0 <= probability <= 1.0
