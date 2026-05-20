"""Build deterministic raw ownership tensors from compact fixture profiles."""

from __future__ import annotations

from typing import Any, Literal, TypedDict


class OwnershipProfile(TypedDict, total=False):
    kind: Literal["uniform", "low_min_at_index0", "hopeless_black"]
    p_black: float
    min_black: float
    base_black: float


def clamp_probability(p_black: float) -> float:
    return max(0.0, min(1.0, p_black))


def probability_to_raw_ownership(p_black: float) -> float:
    return 2.0 * clamp_probability(p_black) - 1.0


def build_ownership_from_profile(
    profile: OwnershipProfile,
    *,
    board_size: int = 19,
) -> list[float]:
    points = board_size * board_size
    kind = profile["kind"]
    if kind == "uniform":
        value = probability_to_raw_ownership(float(profile["p_black"]))
        return [value] * points
    if kind == "low_min_at_index0":
        min_black = float(profile["min_black"])
        base_black = float(profile["base_black"])
        ownership = [probability_to_raw_ownership(base_black)] * points
        ownership[0] = probability_to_raw_ownership(min_black)
        return ownership
    if kind == "hopeless_black":
        min_black = float(profile.get("min_black", 0.005))
        ownership = [probability_to_raw_ownership(0.5)] * points
        ownership[0] = probability_to_raw_ownership(min_black)
        return ownership
    raise ValueError(f"unknown ownership profile kind: {kind}")


def build_minimal_policy(*, board_size: int = 19) -> list[float]:
    """Policy logits long enough for backend raw decode (362 points + pass, head 0 used)."""
    moves = board_size * board_size + 1
    return [0.0] * (moves * 6)


def raw_outputs_from_profile(
    profile: OwnershipProfile,
    *,
    board_size: int = 19,
) -> dict[str, Any]:
    return {
        "policy": build_minimal_policy(board_size=board_size),
        "ownership": build_ownership_from_profile(profile, board_size=board_size),
        "value": [0.0, 0.0, 0.0],
        "miscvalue": [0.0] * 10,
    }
