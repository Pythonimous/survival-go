"""Unit tests for SGF preset loading."""

from __future__ import annotations

from pathlib import Path

import pytest

from backend.app.presets.loader import (
    PresetLoadError,
    count_stones,
    get_preset_by_id,
    list_presets,
    load_preset_from_path,
)

PRESETS_DIR = Path(__file__).resolve().parents[2] / "backend" / "app" / "presets" / "sgf"


def _write_sgf(directory: Path, name: str, body: str) -> Path:
    path = directory / name
    path.write_text(body, encoding="utf-8")
    return path


@pytest.mark.unit
class TestBuiltinPresetSgfs:
    def test_lists_three_presets(self) -> None:
        presets = list_presets(presets_dir=PRESETS_DIR)

        assert [preset.id for preset in presets] == [
            "balanced",
            "black-flavoured",
            "white-flavoured",
        ]

    def test_all_presets_use_19x19_with_white_to_move(self) -> None:
        for preset in list_presets(presets_dir=PRESETS_DIR):
            assert preset.board_size == 19
            assert preset.initial_player_to_move == "W"
            assert preset.board.side == 19

    @pytest.mark.parametrize(
        ("preset_id", "black_stones", "white_stones"),
        [
            ("balanced", 18, 0),
            ("black-flavoured", 68, 0),
            ("white-flavoured", 17, 0),
        ],
    )
    def test_preset_stone_counts(
        self,
        preset_id: str,
        black_stones: int,
        white_stones: int,
    ) -> None:
        preset = get_preset_by_id(preset_id, presets_dir=PRESETS_DIR)
        black, white = count_stones(preset.board)

        assert black == black_stones
        assert white == white_stones

    def test_preset_name_from_id_when_gn_missing(self) -> None:
        preset = get_preset_by_id("balanced", presets_dir=PRESETS_DIR)

        assert preset.name == "Balanced"


@pytest.mark.unit
class TestLoadPresetFromSgf:
    def test_loads_minimal_valid_sgf(self, tmp_path: Path) -> None:
        path = _write_sgf(
            tmp_path,
            "mini.sgf",
            "(;SZ[19]AB[dd][pp]PL[B])",
        )
        preset = load_preset_from_path(path)

        assert preset.id == "mini"
        assert preset.name == "Mini"
        assert preset.initial_player_to_move == "B"
        black, white = count_stones(preset.board)
        assert black == 2
        assert white == 0

    def test_uses_gn_for_display_name(self, tmp_path: Path) -> None:
        path = _write_sgf(
            tmp_path,
            "custom.sgf",
            "(;GN[Custom Title]SZ[19]AB[dd]PL[W])",
        )
        preset = load_preset_from_path(path)

        assert preset.name == "Custom Title"

    def test_rejects_non_sgf_extension(self, tmp_path: Path) -> None:
        path = tmp_path / "bad.json"
        path.write_text("{}", encoding="utf-8")

        with pytest.raises(PresetLoadError, match="\\.sgf"):
            load_preset_from_path(path)

    def test_rejects_non_19_board_size(self, tmp_path: Path) -> None:
        path = _write_sgf(tmp_path, "small.sgf", "(;SZ[9]AB[dd]PL[W])")

        with pytest.raises(PresetLoadError, match="board size"):
            load_preset_from_path(path)

    def test_rejects_missing_pl(self, tmp_path: Path) -> None:
        path = _write_sgf(tmp_path, "no-pl.sgf", "(;SZ[19]AB[dd])")

        with pytest.raises(PresetLoadError, match="PL"):
            load_preset_from_path(path)

    def test_rejects_moves_after_setup(self, tmp_path: Path) -> None:
        path = _write_sgf(
            tmp_path,
            "with-moves.sgf",
            "(;SZ[19]AB[dd]PL[W];B[pd])",
        )

        with pytest.raises(PresetLoadError, match="moves"):
            load_preset_from_path(path)

    def test_rejects_illegal_setup(self, tmp_path: Path) -> None:
        path = _write_sgf(
            tmp_path,
            "illegal.sgf",
            "(;SZ[19]AB[aa]AW[ab][ba][ca][ac]PL[W])",
        )

        with pytest.raises(PresetLoadError, match="illegal"):
            load_preset_from_path(path)

    def test_rejects_invalid_sgf_bytes(self, tmp_path: Path) -> None:
        path = tmp_path / "broken.sgf"
        path.write_bytes(b"not sgf")

        with pytest.raises(PresetLoadError, match="invalid SGF"):
            load_preset_from_path(path)

    def test_get_preset_by_id_missing(self, tmp_path: Path) -> None:
        with pytest.raises(PresetLoadError, match="not found"):
            get_preset_by_id("missing", presets_dir=tmp_path)
