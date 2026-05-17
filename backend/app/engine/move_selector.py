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
    min_black_probability: float


def _candidate_sort_key(candidate: CandidateMove, *, engine_side: EngineSide) -> tuple[float, int]:
    if engine_side == "B":
        return (-candidate.min_black_probability, candidate.survival_score)
    return (candidate.min_black_probability, -candidate.survival_score)


def rank_candidates_for_side(
    candidates: list[CandidateMove], *, engine_side: EngineSide
) -> list[CandidateMove]:
    """Return candidates sorted best-first for the side to move.

    Primary key is min_black_probability (maximize for Black, minimize for White).
    Ties break on survival score (minimize for Black, maximize for White).
    """
    return sorted(
        candidates,
        key=lambda candidate: _candidate_sort_key(candidate, engine_side=engine_side),
    )


def choose_engine_move(
    candidates: list[CandidateMove], *, engine_side: EngineSide
) -> CandidateMove:
    """Pick the best candidate for the side to move."""
    ranked = rank_candidates_for_side(candidates, engine_side=engine_side)
    if not ranked:
        raise ValueError("choose_engine_move requires at least one candidate")
    return ranked[0]
