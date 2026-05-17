"""Unit tests for backend difficulty configuration."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from backend.app.difficulty import (
    DifficultyConfig,
    get_default_difficulty,
    list_difficulty_presets,
)


@pytest.mark.unit
def test_default_difficulty_matches_normal_preset() -> None:
    default = get_default_difficulty()

    assert isinstance(default, DifficultyConfig)
    assert default.max_visits >= 1
    assert default.top_n >= 1
    assert 0.0 <= default.randomness <= 1.0


@pytest.mark.unit
def test_difficulty_config_validates_bounds() -> None:
    with pytest.raises(ValidationError):
        DifficultyConfig(max_visits=0, top_n=1, randomness=0.0)
    with pytest.raises(ValidationError):
        DifficultyConfig(max_visits=10, top_n=0, randomness=0.0)
    with pytest.raises(ValidationError):
        DifficultyConfig(max_visits=10, top_n=1, randomness=-0.01)
    with pytest.raises(ValidationError):
        DifficultyConfig(max_visits=10, top_n=1, randomness=1.01)


@pytest.mark.unit
def test_list_difficulty_presets_includes_expected_ids() -> None:
    preset_ids = [preset.id for preset in list_difficulty_presets()]

    assert preset_ids == ["easy", "normal", "hard", "impossible"]
