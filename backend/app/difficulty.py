"""Difficulty configuration and backend-owned presets."""

from __future__ import annotations

from pydantic import BaseModel, Field, model_validator


class DifficultyConfig(BaseModel):
    """Difficulty controls for engine candidate ranking and sampling.

    Knobs:
    - `max_visits`: KataGo search budget per query.
    - `top_n`: number of best ranked candidates considered for final selection.
    - `randomness`: legacy compatibility knob; mapped to temperature when explicit
      temperature is not provided.
    - `variant_awareness`: weight of pure Survival objective in composite scoring.
      Higher means stronger objective focus; lower keeps more "human-like" anchor
      influence.
    - `policy_anchor`: relative weight of KataGo policy prior in composite score.
    - `score_anchor`: relative weight of KataGo score lead stabilization term.
    - `temperature`: softmax temperature for stochastic choice among non-blunder
      candidates. Zero means deterministic argmax.
    - `blunder_margin`: score distance from best candidate allowed by the blunder
      filter (`best - blunder_margin` cutoff).
    - `global_weight` / `local_weight`: reserved blend controls for future global
      vs local objective mixing; currently validated and threaded for compatibility.
    """
    max_visits: int = Field(ge=1)
    top_n: int = Field(ge=1)
    randomness: float = Field(ge=0.0, le=1.0)
    variant_awareness: float = Field(default=1.0, ge=0.0, le=1.0)
    policy_anchor: float = Field(default=0.0, ge=0.0, le=1.0)
    score_anchor: float = Field(default=0.0, ge=0.0, le=1.0)
    temperature: float = Field(default=0.0, ge=0.0)
    blunder_margin: float = Field(default=0.0, ge=0.0)
    global_weight: float = Field(default=1.0, ge=0.0, le=1.0)
    local_weight: float = Field(default=0.0, ge=0.0, le=1.0)

    @model_validator(mode="after")
    def _apply_compatibility_mapping(self) -> "DifficultyConfig":
        """Backfill new knobs when only legacy fields were provided."""
        fields_set = self.model_fields_set
        if "temperature" not in fields_set:
            self.temperature = self.randomness
        if "variant_awareness" not in fields_set:
            self.variant_awareness = max(0.0, min(1.0, 1.0 - (self.randomness * 0.5)))
        if "blunder_margin" not in fields_set:
            self.blunder_margin = max(0.0, min(0.15, self.randomness * 0.1))
        return self

    @model_validator(mode="after")
    def _validate_objective_weights(self) -> "DifficultyConfig":
        """Validate anchor and blend weights form a sane convex-like mix."""
        if self.policy_anchor + self.score_anchor > 1.0:
            raise ValueError("policy_anchor + score_anchor must be <= 1.0")
        if self.global_weight + self.local_weight <= 0.0:
            raise ValueError("global_weight + local_weight must be > 0.0")
        return self


class DifficultyPreset(BaseModel):
    id: str
    name: str
    description: str
    config: DifficultyConfig


_DIFFICULTY_PRESETS: tuple[DifficultyPreset, ...] = (
    DifficultyPreset(
        id="easy",
        name="Easy",
        description="Plausible play with varied choices and lower variant awareness.",
        config=DifficultyConfig(
            max_visits=4,
            top_n=16,
            randomness=0.7,
            variant_awareness=0.35,
            policy_anchor=0.6,
            score_anchor=0.1,
            temperature=0.7,
            blunder_margin=0.08,
        ),
    ),
    DifficultyPreset(
        id="normal",
        name="Normal",
        description="Balanced play blending objective strength and plausible variety.",
        config=DifficultyConfig(
            max_visits=6,
            top_n=8,
            randomness=0.35,
            variant_awareness=0.6,
            policy_anchor=0.45,
            score_anchor=0.1,
            temperature=0.35,
            blunder_margin=0.04,
        ),
    ),
    DifficultyPreset(
        id="hard",
        name="Hard",
        description="Strong objective focus with limited variety and tighter blunder guard.",
        config=DifficultyConfig(
            max_visits=16,
            top_n=4,
            randomness=0.12,
            variant_awareness=0.85,
            policy_anchor=0.2,
            score_anchor=0.05,
            temperature=0.12,
            blunder_margin=0.015,
        ),
    ),
    DifficultyPreset(
        id="impossible",
        name="Impossible",
        description="Near-pure Survival objective with minimal variety.",
        config=DifficultyConfig(
            max_visits=38,
            top_n=2,
            randomness=0.02,
            variant_awareness=1.0,
            policy_anchor=0.0,
            score_anchor=0.0,
            temperature=0.02,
            blunder_margin=0.0,
        ),
    ),
)


def list_difficulty_presets() -> list[DifficultyPreset]:
    return [preset.model_copy(deep=True) for preset in _DIFFICULTY_PRESETS]


def get_default_difficulty() -> DifficultyConfig:
    for preset in _DIFFICULTY_PRESETS:
        if preset.id == "normal":
            return preset.config.model_copy(deep=True)
    raise RuntimeError("default difficulty preset 'normal' is missing")
