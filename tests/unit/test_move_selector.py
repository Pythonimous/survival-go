"""Unit tests for side-aware Survival move selection."""

import pytest

from backend.app.engine.move_selector import (
    CandidateMove,
    choose_engine_move,
    rank_candidates_for_side,
)


def _candidate(move: str, score: int, *, min_black_probability: float = 0.5) -> CandidateMove:
    return CandidateMove(
        move=move,
        survival_score=score,
        min_black_probability=min_black_probability,
    )


@pytest.mark.unit
def test_choose_engine_move_black_maximizes_min_black_probability() -> None:
    candidates = [
        _candidate("D4", 5, min_black_probability=0.3),
        _candidate("Q16", 2, min_black_probability=0.5),
        _candidate("K10", 3, min_black_probability=0.4),
    ]

    selected = choose_engine_move(candidates, engine_side="B")

    assert selected.move == "Q16"
    assert selected.min_black_probability == pytest.approx(0.5)


@pytest.mark.unit
def test_choose_engine_move_white_minimizes_min_black_probability() -> None:
    candidates = [
        _candidate("D4", 1, min_black_probability=0.2),
        _candidate("Q16", 6, min_black_probability=0.5),
        _candidate("K10", 4, min_black_probability=0.3),
    ]

    selected = choose_engine_move(candidates, engine_side="W")

    assert selected.move == "D4"
    assert selected.min_black_probability == pytest.approx(0.2)


@pytest.mark.unit
def test_rank_candidates_for_side_orders_by_min_black_probability_for_white() -> None:
    candidates = [
        _candidate("D4", 2, min_black_probability=0.5),
        _candidate("Q16", 5, min_black_probability=0.8),
        _candidate("K10", 3, min_black_probability=0.6),
    ]

    ranked = rank_candidates_for_side(candidates, engine_side="W")

    assert [candidate.move for candidate in ranked] == ["D4", "K10", "Q16"]


@pytest.mark.unit
def test_choose_engine_move_black_uses_min_survival_score_as_tiebreaker() -> None:
    candidates = [
        _candidate("H12", 355, min_black_probability=0.435),
        _candidate("L12", 350, min_black_probability=0.435),
    ]

    selected = choose_engine_move(candidates, engine_side="B")

    assert selected.move == "L12"
    assert selected.survival_score == 350


@pytest.mark.unit
def test_choose_engine_move_white_uses_max_survival_score_as_tiebreaker() -> None:
    candidates = [
        _candidate("H12", 355, min_black_probability=0.435),
        _candidate("L12", 360, min_black_probability=0.435),
    ]

    selected = choose_engine_move(candidates, engine_side="W")

    assert selected.move == "L12"
    assert selected.survival_score == 360


@pytest.mark.unit
def test_rank_candidates_for_side_black_orders_survival_score_on_min_tie() -> None:
    candidates = [
        _candidate("H12", 355, min_black_probability=0.435),
        _candidate("L12", 350, min_black_probability=0.435),
        _candidate("M10", 356, min_black_probability=0.464),
    ]

    ranked = rank_candidates_for_side(candidates, engine_side="B")

    assert [candidate.move for candidate in ranked] == ["M10", "L12", "H12"]


@pytest.mark.unit
def test_choose_engine_move_rejects_empty_candidates() -> None:
    with pytest.raises(ValueError, match="at least one candidate"):
        choose_engine_move([], engine_side="B")
