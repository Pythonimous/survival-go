"""Side-aware move selection for the Survival objective."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from backend.app.difficulty import DifficultyConfig

EngineSide = Literal["B", "W"]


@dataclass(frozen=True, slots=True)
class CandidateMove:
    """One move candidate for engine selection and UI shortlists."""

    move: str
    survival_score: int
    min_black_probability: float
    policy: float = 0.0
    score_lead: float | None = None
    winrate: float | None = None


def _survival_term(candidate: CandidateMove, *, engine_side: EngineSide) -> float:
    """Side-aware Survival objective from ownership metrics (analyze path)."""
    if engine_side == "B":
        return candidate.min_black_probability
    return 1.0 - candidate.min_black_probability


def _winrate_term(candidate: CandidateMove, *, engine_side: EngineSide) -> float:
    """Side-aware utility from root MCTS child winrate (Black perspective)."""
    winrate = candidate.winrate if candidate.winrate is not None else 0.5
    if engine_side == "B":
        return winrate
    return 1.0 - winrate


def _ranking_term(candidate: CandidateMove, *, engine_side: EngineSide) -> float:
    """Prefer MCTS winrate when present; otherwise ownership-based Survival."""
    if candidate.winrate is not None:
        return _winrate_term(candidate, engine_side=engine_side)
    return _survival_term(candidate, engine_side=engine_side)


def _policy_term(candidate: CandidateMove, *, policy_max: float) -> float:
    """Normalize policy prior into [0, 1] relative to current candidate set."""
    if policy_max <= 0.0:
        return 0.0
    return max(0.0, min(1.0, candidate.policy / policy_max))


def _score_term(candidate: CandidateMove, *, max_abs_score: float) -> float:
    """Map score lead to [0, 1] around 0.5 for optional stability anchoring."""
    if max_abs_score <= 0.0 or candidate.score_lead is None:
        return 0.0
    return max(0.0, min(1.0, 0.5 + (candidate.score_lead / (2.0 * max_abs_score))))


def _composite_score(
    candidate: CandidateMove,
    *,
    engine_side: EngineSide,
    difficulty: DifficultyConfig,
    policy_max: float,
    max_abs_score: float,
) -> float:
    """Compute blended candidate utility from objective + anchor knobs.

    The final value combines:
    - side-aware ranking term (MCTS winrate or ownership Survival),
    - policy/score anchors (`policy_anchor`, `score_anchor`),
    - `variant_awareness` interpolation between pure Survival and anchored score.
    """
    survival_global = _ranking_term(candidate, engine_side=engine_side)
    blend_total = difficulty.global_weight + difficulty.local_weight
    survival_blended = survival_global if blend_total > 0 else 0.0
    anchor_bonus = (
        (difficulty.policy_anchor * _policy_term(candidate, policy_max=policy_max))
        + (difficulty.score_anchor * _score_term(candidate, max_abs_score=max_abs_score))
    )
    objective_weight = 1.0 - difficulty.policy_anchor - difficulty.score_anchor
    objective_component = (objective_weight * survival_blended) + anchor_bonus
    return (difficulty.variant_awareness * survival_blended) + (
        (1.0 - difficulty.variant_awareness) * objective_component
    )


def _softmax_weights(scores: list[float], *, temperature: float) -> list[float]:
    """Convert candidate scores to sampling weights using temperature softmax."""
    if temperature <= 0.0:
        return [1.0] + [0.0] * (len(scores) - 1)
    max_score = max(scores)
    exponents = [pow(2.718281828, (score - max_score) / temperature) for score in scores]
    total = sum(exponents)
    if total <= 0.0:
        return [1.0 / len(scores)] * len(scores)
    return [value / total for value in exponents]


def _max_abs_score_lead(candidates: list[CandidateMove]) -> float:
    """Return max absolute score lead for normalization, or 0 when unavailable."""
    values = [
        abs(candidate.score_lead)
        for candidate in candidates
        if candidate.score_lead is not None
    ]
    if not values:
        return 0.0
    return max(values)


def rank_candidates_for_side(
    candidates: list[CandidateMove], *, engine_side: EngineSide, difficulty: DifficultyConfig
) -> list[CandidateMove]:
    """Return candidates sorted best-first by composite score."""
    if not candidates:
        return []
    policy_max = max(candidate.policy for candidate in candidates)
    max_abs_score = _max_abs_score_lead(candidates)
    return sorted(
        candidates,
        key=lambda candidate: (
            -_composite_score(
                candidate,
                engine_side=engine_side,
                difficulty=difficulty,
                policy_max=policy_max,
                max_abs_score=max_abs_score,
            ),
            -_ranking_term(candidate, engine_side=engine_side),
            candidate.survival_score if engine_side == "B" else -candidate.survival_score,
        ),
    )


def filter_blunders(
    ranked_candidates: list[CandidateMove], *, engine_side: EngineSide, difficulty: DifficultyConfig
) -> list[CandidateMove]:
    """Drop candidates below the configured `best - blunder_margin` threshold."""
    if not ranked_candidates:
        return []
    policy_max = max(candidate.policy for candidate in ranked_candidates)
    max_abs_score = _max_abs_score_lead(ranked_candidates)
    scores = [
        _composite_score(
            candidate,
            engine_side=engine_side,
            difficulty=difficulty,
            policy_max=policy_max,
            max_abs_score=max_abs_score,
        )
        for candidate in ranked_candidates
    ]
    best = scores[0]
    floor = best - difficulty.blunder_margin
    return [
        candidate
        for candidate, score in zip(ranked_candidates, scores, strict=True)
        if score >= floor
    ]


def select_katago_top_candidate(candidates: list[CandidateMove]) -> CandidateMove:
    """Pick the candidate with the highest KataGo policy / visit prior from the browser."""
    if not candidates:
        raise ValueError("select_katago_top_candidate requires at least one candidate")
    return max(candidates, key=lambda candidate: (candidate.policy, candidate.move))


def select_candidate_for_side(
    candidates: list[CandidateMove],
    *,
    engine_side: EngineSide,
    difficulty: DifficultyConfig,
    random_source: object,
) -> CandidateMove:
    """Pick a candidate via rank -> blunder filter -> argmax/softmax sampling."""
    ranked = rank_candidates_for_side(candidates, engine_side=engine_side, difficulty=difficulty)
    if not ranked:
        raise ValueError("select_candidate_for_side requires at least one candidate")
    filtered = filter_blunders(ranked, engine_side=engine_side, difficulty=difficulty)
    if len(filtered) == 1 or difficulty.temperature <= 0.0:
        return filtered[0]
    policy_max = max(candidate.policy for candidate in filtered)
    max_abs_score = _max_abs_score_lead(filtered)
    scores = [
        _composite_score(
            candidate,
            engine_side=engine_side,
            difficulty=difficulty,
            policy_max=policy_max,
            max_abs_score=max_abs_score,
        )
        for candidate in filtered
    ]
    weights = _softmax_weights(scores, temperature=difficulty.temperature)
    threshold = getattr(random_source, "random")()
    cumulative = 0.0
    for candidate, weight in zip(filtered, weights, strict=True):
        cumulative += weight
        if threshold <= cumulative:
            return candidate
    return filtered[-1]
