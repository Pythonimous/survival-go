"""Unit tests for side-aware Survival move selection."""

import pytest

from backend.app.difficulty import DifficultyConfig
from backend.app.engine.move_selector import (
    CandidateMove,
    filter_blunders,
    rank_candidates_for_side,
    select_candidate_for_side,
    select_katago_top_candidate,
)


def _candidate(
    move: str,
    score: int,
    *,
    min_black_probability: float = 0.5,
    policy: float = 0.0,
    score_lead: float | None = None,
    winrate: float | None = None,
) -> CandidateMove:
    return CandidateMove(
        move=move,
        survival_score=score,
        min_black_probability=min_black_probability,
        policy=policy,
        score_lead=score_lead,
        winrate=winrate,
    )


@pytest.mark.unit
def test_rank_candidates_for_side_black_prefers_high_composite_score() -> None:
    config = DifficultyConfig(
        max_visits=20,
        top_n=3,
        randomness=0.0,
        variant_awareness=0.4,
        policy_anchor=0.6,
        temperature=0.0,
    )
    candidates = [
        _candidate("D4", 3, min_black_probability=0.40, policy=0.2),
        _candidate("Q16", 5, min_black_probability=0.42, policy=0.9),
        _candidate("K10", 2, min_black_probability=0.41, policy=0.4),
    ]

    ranked = rank_candidates_for_side(candidates, engine_side="B", difficulty=config)

    assert [candidate.move for candidate in ranked] == ["Q16", "K10", "D4"]


@pytest.mark.unit
def test_rank_candidates_for_side_white_uses_side_aware_survival_term() -> None:
    config = DifficultyConfig(
        max_visits=20,
        top_n=3,
        randomness=0.0,
        variant_awareness=1.0,
        temperature=0.0,
    )
    candidates = [
        _candidate("D4", 1, min_black_probability=0.45),
        _candidate("Q16", 6, min_black_probability=0.30),
        _candidate("K10", 4, min_black_probability=0.40),
    ]

    ranked = rank_candidates_for_side(candidates, engine_side="W", difficulty=config)

    assert [candidate.move for candidate in ranked] == ["Q16", "K10", "D4"]


@pytest.mark.unit
def test_filter_blunders_keeps_candidates_within_margin() -> None:
    config = DifficultyConfig(
        max_visits=20,
        top_n=3,
        randomness=0.0,
        variant_awareness=1.0,
        blunder_margin=0.015,
        temperature=0.0,
    )
    candidates = [
        _candidate("D4", 2, min_black_probability=0.600),
        _candidate("Q16", 5, min_black_probability=0.588),
        _candidate("K10", 3, min_black_probability=0.560),
    ]

    ranked = rank_candidates_for_side(candidates, engine_side="B", difficulty=config)
    filtered = filter_blunders(ranked, engine_side="B", difficulty=config)

    assert [candidate.move for candidate in filtered] == ["D4", "Q16"]


@pytest.mark.unit
def test_select_candidate_for_side_temperature_zero_is_deterministic() -> None:
    class _RandomStub:
        def __init__(self) -> None:
            self.calls = 0

        def random(self) -> float:
            self.calls += 1
            return 0.99

    config = DifficultyConfig(max_visits=20, top_n=3, randomness=0.0, temperature=0.0)
    candidates = [
        _candidate("H12", 355, min_black_probability=0.435, policy=0.1),
        _candidate("L12", 350, min_black_probability=0.445, policy=0.2),
    ]
    random_source = _RandomStub()

    selected = select_candidate_for_side(
        candidates,
        engine_side="B",
        difficulty=config,
        random_source=random_source,
    )

    assert selected.move == "L12"
    assert random_source.calls == 0


@pytest.mark.unit
def test_select_candidate_for_side_temperature_sampling_uses_random_source() -> None:
    class _RandomStub:
        def __init__(self, value: float) -> None:
            self.value = value
            self.calls = 0

        def random(self) -> float:
            self.calls += 1
            return self.value

    config = DifficultyConfig(
        max_visits=20,
        top_n=3,
        randomness=0.0,
        variant_awareness=1.0,
        temperature=0.05,
        blunder_margin=1.0,
    )
    candidates = [
        _candidate("A1", 1, min_black_probability=0.60),
        _candidate("B1", 1, min_black_probability=0.59),
        _candidate("C1", 1, min_black_probability=0.40),
    ]
    random_source = _RandomStub(0.999)

    selected = select_candidate_for_side(
        candidates,
        engine_side="B",
        difficulty=config,
        random_source=random_source,
    )

    assert selected.move in {"A1", "B1", "C1"}
    assert random_source.calls == 1


@pytest.mark.unit
def test_rank_candidates_for_side_black_prefers_higher_mcts_winrate() -> None:
    config = DifficultyConfig(
        max_visits=20,
        top_n=3,
        randomness=0.0,
        variant_awareness=1.0,
        temperature=0.0,
    )
    candidates = [
        _candidate("D4", 0, winrate=0.2, policy=0.9),
        _candidate("Q16", 0, winrate=0.7, policy=0.1),
    ]

    ranked = rank_candidates_for_side(candidates, engine_side="B", difficulty=config)

    assert [candidate.move for candidate in ranked] == ["Q16", "D4"]


@pytest.mark.unit
def test_select_katago_top_candidate_picks_highest_policy() -> None:
    candidates = [
        _candidate("D4", 1, policy=0.2),
        _candidate("Q16", 5, policy=0.9),
        _candidate("K10", 2, policy=0.4),
    ]

    selected = select_katago_top_candidate(candidates)

    assert selected.move == "Q16"


@pytest.mark.unit
def test_select_candidate_for_side_rejects_empty_candidates() -> None:
    with pytest.raises(ValueError, match="at least one candidate"):
        select_candidate_for_side(
            [],
            engine_side="B",
            difficulty=DifficultyConfig(max_visits=20, top_n=2, randomness=0.0),
            random_source=object(),
        )
