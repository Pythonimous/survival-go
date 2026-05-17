"""Unit tests for GTP coordinates and sgfmill-backed preset board setup."""

from __future__ import annotations

import pytest
from sgfmill import boards

from backend.app.engine.board import (
    InvalidCoordinateError,
    format_gtp_coordinate,
    parse_gtp_coordinate,
    setup_board_from_stones,
    stone_at_coord,
)

GTP_COLUMNS = "ABCDEFGHJKLMNOPQRST"


@pytest.mark.unit
class TestGtpCoordinateParsing:
    @pytest.mark.parametrize(
        ("coordinate", "expected"),
        [
            ("A1", (0, 0)),
            ("A19", (18, 0)),
            ("T1", (0, 18)),
            ("T19", (18, 18)),
            ("D4", (3, 3)),
            ("J10", (9, 8)),
            ("H8", (7, 7)),
            ("K19", (18, 9)),
        ],
    )
    def test_parse_gtp_coordinate_maps_valid_points(
        self, coordinate: str, expected: tuple[int, int]
    ) -> None:
        assert parse_gtp_coordinate(coordinate) == expected

    @pytest.mark.parametrize("column", GTP_COLUMNS)
    def test_parse_accepts_every_valid_column_with_row_one(self, column: str) -> None:
        row, col = parse_gtp_coordinate(f"{column}1")
        assert row == 0
        assert col == GTP_COLUMNS.index(column)

    @pytest.mark.parametrize("row", range(1, 20))
    def test_parse_accepts_every_valid_row_on_column_a(self, row: int) -> None:
        parsed_row, col = parse_gtp_coordinate(f"A{row}")
        assert parsed_row == row - 1
        assert col == 0

    @pytest.mark.parametrize(
        "coordinate",
        ["I1", "I10", "A0", "A20", "U1", "A", "", "1A", "AA1"],
    )
    def test_parse_rejects_invalid_coordinates(self, coordinate: str) -> None:
        with pytest.raises(InvalidCoordinateError):
            parse_gtp_coordinate(coordinate)

    @pytest.mark.parametrize(
        ("row", "col", "expected"),
        [
            (0, 0, "A1"),
            (18, 0, "A19"),
            (0, 18, "T1"),
            (18, 18, "T19"),
            (3, 3, "D4"),
            (9, 8, "J10"),
        ],
    )
    def test_format_gtp_coordinate_round_trips(
        self, row: int, col: int, expected: str
    ) -> None:
        assert format_gtp_coordinate(row, col) == expected
        assert parse_gtp_coordinate(expected) == (row, col)


@pytest.mark.unit
class TestPresetBoardSetup:
    def test_setup_board_from_stones_places_initial_positions(self) -> None:
        board = setup_board_from_stones([("D4", "B"), ("Q16", "W")])

        assert isinstance(board, boards.Board)
        assert board.side == 19
        assert stone_at_coord(board, "D4") == "B"
        assert stone_at_coord(board, "Q16") == "W"

    def test_setup_board_from_stones_rejects_duplicate_positions(self) -> None:
        with pytest.raises(ValueError, match="duplicate"):
            setup_board_from_stones([("D4", "B"), ("D4", "W")])
