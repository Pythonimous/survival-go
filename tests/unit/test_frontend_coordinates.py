"""Unit tests for frontend GTP ↔ Shudan vertex ↔ signMap coordinate mapping."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from typing import Any

import pytest

from backend.app.engine.board import (
    format_gtp_coordinate,
    parse_gtp_coordinate,
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIR = PROJECT_ROOT / "frontend"
COORDINATES_MODULE = FRONTEND_DIR / "src" / "lib" / "go" / "coordinates.ts"
COORDINATE_CLI = FRONTEND_DIR / "scripts" / "coordinate_cli.ts"
BOARD_SIZE = 19
GTP_COLUMNS = "ABCDEFGHJKLMNOPQRST"


def _ensure_frontend_deps() -> None:
    if not (FRONTEND_DIR / "node_modules").is_dir():
        npm = shutil.which("npm")
        assert npm is not None, "npm is required for frontend coordinate tests"
        install = subprocess.run(
            ["npm", "install"],
            cwd=FRONTEND_DIR,
            capture_output=True,
            text=True,
            timeout=180,
            check=False,
        )
        assert install.returncode == 0, install.stderr or install.stdout


def _run_coordinate_cli(function_name: str, *args: Any) -> Any:
    _ensure_frontend_deps()
    npm = shutil.which("npm")
    assert npm is not None, "npm is required for frontend coordinate tests"
    payload = [json.dumps(arg) for arg in args]
    result = subprocess.run(
        ["npx", "tsx", str(COORDINATE_CLI), function_name, *payload],
        cwd=FRONTEND_DIR,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, result.stderr or result.stdout
    return json.loads(result.stdout.strip())


def _sgfmill_to_vertex(row: int, col: int, *, size: int = BOARD_SIZE) -> list[int]:
    return [col, size - 1 - row]


@pytest.mark.unit
def test_coordinates_module_exists() -> None:
    assert COORDINATES_MODULE.is_file(), "coordinates.ts is required for board mapping"
    source = COORDINATES_MODULE.read_text(encoding="utf-8")
    for name in (
        "parseGtpCoordinate",
        "formatGtpCoordinate",
        "gtpToVertex",
        "vertexToGtp",
        "sgfmillToVertex",
        "vertexToSgfmill",
        "emptySignMap",
        "signMapFromStones",
        "emptyMarkerMap",
        "markerMapFromLastMove",
        "formatToPlayLabel",
        "formatTurnStatusLabel",
    ):
        assert f"export function {name}" in source or f"export const {name}" in source


@pytest.mark.unit
@pytest.mark.parametrize(
    ("coordinate", "expected_row", "expected_col"),
    [
        ("A1", 0, 0),
        ("A19", 18, 0),
        ("T1", 0, 18),
        ("T19", 18, 18),
        ("D4", 3, 3),
        ("J10", 9, 8),
        ("H8", 7, 7),
        ("K19", 18, 9),
    ],
)
def test_parse_gtp_matches_backend_sgfmill(
    coordinate: str, expected_row: int, expected_col: int
) -> None:
    backend = parse_gtp_coordinate(coordinate)
    assert backend == (expected_row, expected_col)
    parsed = _run_coordinate_cli("parseGtpCoordinate", coordinate)
    assert parsed == [expected_row, expected_col]


@pytest.mark.unit
@pytest.mark.parametrize("column", GTP_COLUMNS)
def test_parse_accepts_every_valid_column_at_row_one(column: str) -> None:
    row, col = parse_gtp_coordinate(f"{column}1")
    assert row == 0
    assert col == GTP_COLUMNS.index(column)
    parsed = _run_coordinate_cli("parseGtpCoordinate", f"{column}1")
    assert parsed == [0, col]


@pytest.mark.unit
@pytest.mark.parametrize(
    ("coordinate", "expected_vertex"),
    [
        ("A1", [0, 18]),
        ("A19", [0, 0]),
        ("T1", [18, 18]),
        ("T19", [18, 0]),
        ("D4", [3, 15]),
        ("J10", [8, 9]),
    ],
)
def test_gtp_to_vertex_row_zero_is_bottom(coordinate: str, expected_vertex: list[int]) -> None:
    row, col = parse_gtp_coordinate(coordinate)
    assert _sgfmill_to_vertex(row, col) == expected_vertex
    assert _run_coordinate_cli("gtpToVertex", coordinate) == expected_vertex


@pytest.mark.unit
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
def test_format_gtp_round_trips_through_vertex(
    row: int, col: int, expected: str
) -> None:
    assert format_gtp_coordinate(row, col) == expected
    assert _run_coordinate_cli("formatGtpCoordinate", row, col) == expected
    vertex = _sgfmill_to_vertex(row, col)
    assert _run_coordinate_cli("vertexToGtp", vertex) == expected
    assert _run_coordinate_cli("gtpToVertex", expected) == vertex


@pytest.mark.unit
@pytest.mark.parametrize(
    ("row", "col"),
    [(0, 0), (18, 18), (9, 9), (3, 15)],
)
def test_sgfmill_vertex_round_trip(row: int, col: int) -> None:
    vertex = _sgfmill_to_vertex(row, col)
    assert _run_coordinate_cli("sgfmillToVertex", row, col) == vertex
    assert _run_coordinate_cli("vertexToSgfmill", vertex) == [row, col]


@pytest.mark.unit
def test_empty_sign_map_is_all_zeros() -> None:
    sign_map = _run_coordinate_cli("emptySignMap", BOARD_SIZE)
    assert len(sign_map) == BOARD_SIZE
    assert all(len(row) == BOARD_SIZE for row in sign_map)
    assert all(cell == 0 for row in sign_map for cell in row)


@pytest.mark.unit
def test_sign_map_from_stones_places_black_and_white() -> None:
    stones = [
        {"move": "D4", "color": "B"},
        {"move": "Q16", "color": "W"},
    ]
    sign_map = _run_coordinate_cli("signMapFromStones", stones, BOARD_SIZE)
    black_vertex = _run_coordinate_cli("gtpToVertex", "D4")
    white_vertex = _run_coordinate_cli("gtpToVertex", "Q16")
    assert sign_map[black_vertex[1]][black_vertex[0]] == 1
    assert sign_map[white_vertex[1]][white_vertex[0]] == -1

    black_row, black_col = parse_gtp_coordinate("D4")
    white_row, white_col = parse_gtp_coordinate("Q16")
    assert sign_map[_sgfmill_to_vertex(black_row, black_col)[1]][
        _sgfmill_to_vertex(black_row, black_col)[0]
    ] == 1
    assert sign_map[_sgfmill_to_vertex(white_row, white_col)[1]][
        _sgfmill_to_vertex(white_row, white_col)[0]
    ] == -1


@pytest.mark.unit
@pytest.mark.parametrize(
    "coordinate",
    ["I1", "I10", "A0", "A20", "U1", "A", "", "1A", "AA1"],
)
def test_parse_rejects_invalid_gtp_coordinates(coordinate: str) -> None:
    with pytest.raises(Exception):
        parse_gtp_coordinate(coordinate)

    _ensure_frontend_deps()
    result = subprocess.run(
        ["npx", "tsx", str(COORDINATE_CLI), "parseGtpCoordinate", json.dumps(coordinate)],
        cwd=FRONTEND_DIR,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert result.returncode != 0


@pytest.mark.unit
def test_marker_map_from_last_move_marks_point_on_vertex() -> None:
    marker_map = _run_coordinate_cli("markerMapFromLastMove", "Q16", BOARD_SIZE)
    vertex = _run_coordinate_cli("gtpToVertex", "Q16")
    assert marker_map[vertex[1]][vertex[0]] == {"type": "point"}
    empty_vertex = _run_coordinate_cli("gtpToVertex", "D4")
    assert marker_map[empty_vertex[1]][empty_vertex[0]] is None


@pytest.mark.unit
def test_marker_map_from_last_move_is_empty_when_no_move() -> None:
    marker_map = _run_coordinate_cli("markerMapFromLastMove", None, BOARD_SIZE)
    assert all(cell is None for row in marker_map for cell in row)


@pytest.mark.unit
@pytest.mark.parametrize(
    ("side", "status", "expected"),
    [
        ("B", "active", "Black to play"),
        ("W", "active", "White to play"),
        ("B", "finished", "Game over"),
    ],
)
def test_format_to_play_label(side: str, status: str, expected: str) -> None:
    assert _run_coordinate_cli("formatToPlayLabel", side, status) == expected


@pytest.mark.unit
@pytest.mark.parametrize(
    ("next_to_move", "human_side", "in_progress", "expected"),
    [
        ("B", "B", False, "Black to play"),
        ("W", "W", False, "White to play"),
        ("W", "B", False, "White is thinking..."),
        ("B", "W", False, "Black is thinking..."),
        ("B", "B", True, "White is thinking..."),
        ("W", "W", True, "Black is thinking..."),
    ],
)
def test_format_turn_status_label_active(
    next_to_move: str,
    human_side: str,
    in_progress: bool,
    expected: str,
) -> None:
    assert (
        _run_coordinate_cli(
            "formatTurnStatusLabel",
            next_to_move,
            human_side,
            "active",
            in_progress,
        )
        == expected
    )


@pytest.mark.unit
def test_format_turn_status_label_finished() -> None:
    assert (
        _run_coordinate_cli("formatTurnStatusLabel", "B", "B", "finished", False)
        == "Game over"
    )
