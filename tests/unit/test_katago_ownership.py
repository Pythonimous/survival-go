"""Unit tests for KataGo ownership response parsing."""

import pytest

from backend.app.katago.ownership import (
    katago_ownership_to_p_black,
    parse_ownership_from_response,
)


@pytest.mark.unit
def test_katago_ownership_to_p_black_maps_signed_values_to_probability() -> None:
    assert katago_ownership_to_p_black([-1.0, 0.0, 1.0]) == [0.0, 0.5, 1.0]


@pytest.mark.unit
def test_parse_ownership_from_response_reads_root_ownership() -> None:
    ownership = [0.0] * 361
    ownership[0] = -1.0
    ownership[1] = 0.0
    ownership[2] = 1.0
    response = {
        "id": "smoke",
        "isDuringSearch": False,
        "ownership": ownership,
    }

    p_black = parse_ownership_from_response(response, board_size=19)

    assert p_black[0] == 0.0
    assert p_black[1] == 0.5
    assert p_black[2] == 1.0
    assert all(value == 0.5 for value in p_black[3:])


@pytest.mark.unit
def test_parse_ownership_from_response_requires_361_values_on_19x19() -> None:
    response = {"ownership": [0.0] * 360}

    with pytest.raises(ValueError, match="361"):
        parse_ownership_from_response(response, board_size=19)


@pytest.mark.unit
def test_parse_ownership_from_response_requires_ownership_field() -> None:
    with pytest.raises(ValueError, match="ownership"):
        parse_ownership_from_response({"id": "missing"}, board_size=19)
