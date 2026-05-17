"""Load and validate game presets from SGF files."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from pydantic import BaseModel, ConfigDict
from sgfmill import boards, sgf
from sgfmill import sgf_moves

from backend.app.engine.board import StoneColor, from_sgfmill_color

REQUIRED_BOARD_SIZE = 19
DEFAULT_PRESETS_DIR = Path(__file__).resolve().parent / "sgf"


class PresetLoadError(ValueError):
    """Raised when a preset SGF file fails validation."""


class PresetMetadata(BaseModel):
    """API-facing preset summary without board state."""

    model_config = ConfigDict(frozen=True)

    id: str
    name: str
    board_size: int
    initial_player_to_move: StoneColor


@dataclass(frozen=True)
class PresetDefinition:
    """A validated preset: metadata plus an initial board position."""

    id: str
    name: str
    board_size: int
    initial_player_to_move: StoneColor
    board: boards.Board

    def to_metadata(self) -> PresetMetadata:
        return PresetMetadata(
            id=self.id,
            name=self.name,
            board_size=self.board_size,
            initial_player_to_move=self.initial_player_to_move,
        )


def count_stones(board: boards.Board) -> tuple[int, int]:
    """Return black and white stone counts on the board."""
    black = 0
    white = 0
    for row in range(board.side):
        for col in range(board.side):
            colour = board.get(row, col)
            if colour == "b":
                black += 1
            elif colour == "w":
                white += 1
    return black, white


def load_preset_from_path(path: Path) -> PresetDefinition:
    """Load a single preset from an ``.sgf`` file path."""
    if path.suffix.lower() != ".sgf":
        raise PresetLoadError(f"preset file must be .sgf: {path.name}")

    try:
        game = sgf.Sgf_game.from_bytes(path.read_bytes())
    except Exception as exc:
        raise PresetLoadError(f"invalid SGF: {path.name}") from exc

    preset_id = path.stem
    root = game.get_root()
    board_size = _read_board_size(root)
    initial_player = _read_player_to_move(root)
    board = _load_setup_board(game)
    name = _read_preset_name(root, preset_id)

    return PresetDefinition(
        id=preset_id,
        name=name,
        board_size=board_size,
        initial_player_to_move=initial_player,
        board=board,
    )


def list_presets(*, presets_dir: Path | None = None) -> list[PresetDefinition]:
    """Load all ``.sgf`` presets from the presets directory."""
    directory = presets_dir or DEFAULT_PRESETS_DIR
    paths = sorted(directory.glob("*.sgf"))
    if not paths:
        raise PresetLoadError(f"no preset SGF files found in {directory}")
    return [load_preset_from_path(path) for path in paths]


def list_preset_metadata(*, presets_dir: Path | None = None) -> list[PresetMetadata]:
    """Return metadata for all presets (for ``GET /api/presets``)."""
    return [preset.to_metadata() for preset in list_presets(presets_dir=presets_dir)]


def get_preset_by_id(
    preset_id: str,
    *,
    presets_dir: Path | None = None,
) -> PresetDefinition:
    """Load a preset by id (filename stem without ``.sgf``)."""
    directory = presets_dir or DEFAULT_PRESETS_DIR
    path = directory / f"{preset_id}.sgf"
    if not path.is_file():
        raise PresetLoadError(f"preset not found: {preset_id}")
    return load_preset_from_path(path)


def _read_board_size(root: sgf.Sgf_node) -> int:
    try:
        size = root.get("SZ")
    except KeyError as exc:
        raise PresetLoadError("SZ (board size) is required") from exc
    if size != REQUIRED_BOARD_SIZE:
        raise PresetLoadError(f"board size must be {REQUIRED_BOARD_SIZE}")
    return size


def _read_player_to_move(root: sgf.Sgf_node) -> StoneColor:
    try:
        player = root.get("PL")
    except KeyError as exc:
        raise PresetLoadError("PL (player to move) is required") from exc
    if player not in ("b", "w"):
        raise PresetLoadError("PL must be b or w")
    return from_sgfmill_color(player)


def _read_preset_name(root: sgf.Sgf_node, preset_id: str) -> str:
    try:
        game_name = root.get("GN")
    except KeyError:
        return _title_from_id(preset_id)
    if not game_name.strip():
        return _title_from_id(preset_id)
    return game_name


def _title_from_id(preset_id: str) -> str:
    return preset_id.replace("-", " ").replace("_", " ").title()


def _load_setup_board(game: sgf.Sgf_game) -> boards.Board:
    try:
        board, plays = sgf_moves.get_setup_and_moves(game)
    except ValueError as exc:
        raise PresetLoadError("illegal setup position") from exc
    if plays:
        raise PresetLoadError("preset must not contain moves")
    return board
