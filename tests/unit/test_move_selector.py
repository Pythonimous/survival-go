"""Unit tests for side-aware Survival move selection."""

import pytest

from backend.app.engine.move_selector import (
    CandidateMove,
    choose_engine_move,
    rank_candidates_for_side,
)


def _candidate(move: str, score: int) -> CandidateMove:
    return CandidateMove(move=move, survival_score=score)


@pytest.mark.unit
def test_choose_engine_move_black_minimizes_survival_score() -> None:
    candidates = [_candidate("D4", 5), _candidate("Q16", 2), _candidate("K10", 3)]

    selected = choose_engine_move(candidates, engine_side="B")

    assert selected.move == "Q16"
    assert selected.survival_score == 2


@pytest.mark.unit
def test_choose_engine_move_white_maximizes_survival_score() -> None:
    candidates = [_candidate("D4", 1), _candidate("Q16", 6), _candidate("K10", 4)]

    selected = choose_engine_move(candidates, engine_side="W")

    assert selected.move == "Q16"
    assert selected.survival_score == 6


@pytest.mark.unit
def test_rank_candidates_for_side_orders_descending_for_white() -> None:
    candidates = [_candidate("D4", 2), _candidate("Q16", 5), _candidate("K10", 3)]

    ranked = rank_candidates_for_side(candidates, engine_side="W")

    assert [candidate.move for candidate in ranked] == ["Q16", "K10", "D4"]


@pytest.mark.unit
def test_choose_engine_move_rejects_empty_candidates() -> None:
    with pytest.raises(ValueError, match="at least one candidate"):
        choose_engine_move([], engine_side="B")
