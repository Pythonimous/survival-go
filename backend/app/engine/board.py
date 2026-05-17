"""GTP coordinate helpers and sgfmill-backed preset board setup."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Literal

from sgfmill import boards, common

StoneColor = Literal["B", "W"]
SgfColor = Literal["b", "w"]
Point = tuple[int, int]

STONE_COLORS = frozenset({"B", "W"})


class InvalidCoordinateError(ValueError):
    """Raised when a GTP coordinate is malformed or out of range."""


def parse_gtp_coordinate(coordinate: str, *, size: int = 19) -> Point:
    """Parse a GTP coordinate into sgfmill (row, col), zero-based from the bottom."""
    try:
        point = common.move_from_vertex(coordinate, size)
    except ValueError as exc:
        raise InvalidCoordinateError(str(exc)) from exc
    if point is None:
        raise InvalidCoordinateError("Coordinate must be a board point, not pass.")
    return point


def format_gtp_coordinate(row: int, col: int, *, size: int = 19) -> str:
    """Format sgfmill (row, col) as a GTP coordinate for the given board size."""
    if row < 0 or row >= size or col < 0 or col >= size:
        raise InvalidCoordinateError("Coordinate is out of range.")
    return common.format_vertex((row, col))


def to_sgfmill_color(color: StoneColor) -> SgfColor:
    """Map API stone color to sgfmill colour."""
    if color == "B":
        return "b"
    if color == "W":
        return "w"
    raise ValueError("Color must be 'B' or 'W'.")


def from_sgfmill_color(color: SgfColor) -> StoneColor:
    """Map sgfmill colour to API stone color."""
    if color == "b":
        return "B"
    if color == "w":
        return "W"
    raise ValueError("Color must be 'b' or 'w'.")


def setup_board_from_stones(
    placements: Iterable[tuple[str, StoneColor]],
    *,
    size: int = 19,
) -> boards.Board:
    """Create a sgfmill board with stones from preset-style GTP placements."""
    if size <= 0:
        raise ValueError("Board size must be positive.")

    board = boards.Board(size)
    black_points: list[Point] = []
    white_points: list[Point] = []
    seen_positions: set[Point] = set()

    for coordinate, color in placements:
        if color not in STONE_COLORS:
            raise ValueError("Color must be 'B' or 'W'.")
        point = parse_gtp_coordinate(coordinate, size=size)
        if point in seen_positions:
            raise ValueError("duplicate stone position")
        seen_positions.add(point)
        if color == "B":
            black_points.append(point)
        else:
            white_points.append(point)

    if not board.apply_setup(black_points, white_points, []):
        raise ValueError("illegal setup position")
    return board


def stone_at_coord(board: boards.Board, coordinate: str) -> StoneColor | None:
    """Return the stone color at a GTP coordinate, or None if empty."""
    row, col = parse_gtp_coordinate(coordinate, size=board.side)
    colour = board.get(row, col)
    if colour is None:
        return None
    return from_sgfmill_color(colour)
