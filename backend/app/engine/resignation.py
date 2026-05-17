"""Engine resignation rules based on Survival ownership metrics."""

from __future__ import annotations

from backend.app.engine.board import StoneColor

ENGINE_RESIGN_MIN_BLACK = 0.01
ENGINE_RESIGN_MAX_BLACK = 0.99


def should_engine_resign(*, engine_side: StoneColor, min_black_probability: float) -> bool:
    """Return True when the engine should resign before playing."""
    if engine_side == "B":
        return min_black_probability < ENGINE_RESIGN_MIN_BLACK
    return min_black_probability > ENGINE_RESIGN_MAX_BLACK
