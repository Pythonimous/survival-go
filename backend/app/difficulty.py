"""Difficulty configuration and backend-owned presets."""

from __future__ import annotations

from pydantic import BaseModel, Field


class DifficultyConfig(BaseModel):
    max_visits: int = Field(ge=1)
    top_n: int = Field(ge=1)
    randomness: float = Field(ge=0.0, le=1.0)


class DifficultyPreset(BaseModel):
    id: str
    name: str
    description: str
    config: DifficultyConfig


_DIFFICULTY_PRESETS: tuple[DifficultyPreset, ...] = (
    DifficultyPreset(
        id="easy",
        name="Easy",
        description="Faster analysis with wider randomness.",
        config=DifficultyConfig(max_visits=8, top_n=8, randomness=0.75),
    ),
    DifficultyPreset(
        id="normal",
        name="Normal",
        description="Balanced baseline for casual play.",
        config=DifficultyConfig(max_visits=20, top_n=4, randomness=0.35),
    ),
    DifficultyPreset(
        id="hard",
        name="Hard",
        description="Stronger reading with fewer random deviations.",
        config=DifficultyConfig(max_visits=60, top_n=3, randomness=0.12),
    ),
    DifficultyPreset(
        id="impossible",
        name="Impossible",
        description="Maximum reading with near-greedy play.",
        config=DifficultyConfig(max_visits=150, top_n=2, randomness=0.02),
    ),
)


def list_difficulty_presets() -> list[DifficultyPreset]:
    return [preset.model_copy(deep=True) for preset in _DIFFICULTY_PRESETS]


def get_default_difficulty() -> DifficultyConfig:
    for preset in _DIFFICULTY_PRESETS:
        if preset.id == "normal":
            return preset.config.model_copy(deep=True)
    raise RuntimeError("default difficulty preset 'normal' is missing")
