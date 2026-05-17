"""Side-aware move selection for the Survival objective."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

EngineSide = Literal["B", "W"]


@dataclass(frozen=True, slots=True)
class CandidateMove:
    """One move candidate and its Survival score."""

    move: str
    survival_score: int


def rank_candidates_for_side(
    candidates: list[CandidateMove], *, engine_side: EngineSide
) -> list[CandidateMove]:
    """Return candidates sorted by objective direction for the side to move."""
    reverse = engine_side == "W"
    return sorted(candidates, key=lambda candidate: candidate.survival_score, reverse=reverse)


def choose_engine_move(
    candidates: list[CandidateMove], *, engine_side: EngineSide
) -> CandidateMove:
    """Pick the best candidate for the side to move."""
    ranked = rank_candidates_for_side(candidates, engine_side=engine_side)
    if not ranked:
        raise ValueError("choose_engine_move requires at least one candidate")
    return ranked[0]
