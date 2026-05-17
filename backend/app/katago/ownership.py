"""Convert KataGo ownership output into internal Survival probabilities."""

from __future__ import annotations

from typing import Any


def katago_ownership_to_p_black(ownership: list[float]) -> list[float]:
    """Map KataGo ownership in [-1, 1] to black probability in [0, 1]."""
    return [min(1.0, max(0.0, (value + 1.0) / 2.0)) for value in ownership]


def parse_ownership_from_response(response: dict[str, Any], *, board_size: int) -> list[float]:
    """Extract and normalize root ownership from a final analysis response."""
    expected_len = board_size * board_size
    raw = response.get("ownership")
    if raw is None:
        raise ValueError("analysis response is missing ownership")
    if not isinstance(raw, list):
        raise TypeError("ownership must be a list of floats")
    if len(raw) != expected_len:
        raise ValueError(f"ownership must contain {expected_len} values, got {len(raw)}")
    return katago_ownership_to_p_black([float(value) for value in raw])
