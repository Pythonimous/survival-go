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
    assert 0.0 <= default.variant_awareness <= 1.0
    assert 0.0 <= default.policy_anchor <= 1.0
    assert 0.0 <= default.score_anchor <= 1.0
    assert default.policy_anchor + default.score_anchor <= 1.0
    assert default.temperature >= 0.0
    assert default.blunder_margin >= 0.0
    assert 0.0 <= default.global_weight <= 1.0
    assert 0.0 <= default.local_weight <= 1.0
    assert default.global_weight + default.local_weight > 0.0


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
    with pytest.raises(ValidationError):
        DifficultyConfig(max_visits=10, top_n=1, randomness=0.1, variant_awareness=1.01)
    with pytest.raises(ValidationError):
        DifficultyConfig(max_visits=10, top_n=1, randomness=0.1, temperature=-0.01)
    with pytest.raises(ValidationError):
        DifficultyConfig(max_visits=10, top_n=1, randomness=0.1, blunder_margin=-0.01)
    with pytest.raises(ValidationError):
        DifficultyConfig(
            max_visits=10,
            top_n=1,
            randomness=0.1,
            policy_anchor=0.8,
            score_anchor=0.3,
        )


@pytest.mark.unit
def test_list_difficulty_presets_includes_expected_ids() -> None:
    preset_ids = [preset.id for preset in list_difficulty_presets()]

    assert preset_ids == ["easy", "normal", "hard", "impossible"]


@pytest.mark.unit
def test_difficulty_presets_scale_search_budget_and_top_n() -> None:
    configs = {preset.id: preset.config for preset in list_difficulty_presets()}

    assert configs["easy"].max_visits == 4
    assert configs["normal"].max_visits == 6
    assert configs["hard"].max_visits == 16
    assert configs["impossible"].max_visits == 38

    assert configs["easy"].max_visits < configs["normal"].max_visits
    assert configs["normal"].max_visits < configs["hard"].max_visits
    assert configs["hard"].max_visits < configs["impossible"].max_visits

    assert configs["easy"].top_n == 16
    assert configs["normal"].top_n == 8
    assert configs["hard"].top_n == 4
    assert configs["impossible"].top_n == 2

    assert configs["easy"].top_n > configs["normal"].top_n
    assert configs["normal"].top_n > configs["hard"].top_n
    assert configs["hard"].top_n > configs["impossible"].top_n


@pytest.mark.unit
def test_difficulty_presets_strengthen_variant_awareness_curve() -> None:
    presets = list_difficulty_presets()
    configs = {preset.id: preset.config for preset in presets}

    assert configs["easy"].variant_awareness < configs["normal"].variant_awareness
    assert configs["normal"].variant_awareness < configs["hard"].variant_awareness
    assert configs["hard"].variant_awareness <= configs["impossible"].variant_awareness

    assert configs["easy"].temperature > configs["normal"].temperature
    assert configs["normal"].temperature > configs["hard"].temperature
    assert configs["hard"].temperature >= configs["impossible"].temperature
