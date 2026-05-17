"""Survival metrics computed from ownership probabilities."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class SurvivalMetrics:
    """Summary metrics used by the Survival objective."""

    unresolved_count: int
    min_black_probability: float


@dataclass(frozen=True, slots=True)
class SurvivalEvaluation:
    """Survival objective value and supporting metrics for one position."""

    survival_score: int
    metrics: SurvivalMetrics


def calculate_survival_metrics(p_black: list[float], *, threshold: float) -> SurvivalMetrics:
    """Compute Survival metrics from per-point black ownership probabilities."""
    if not p_black:
        raise ValueError("p_black must not be empty")

    unresolved_count = sum(1 for probability in p_black if probability < threshold)
    min_black_probability = min(p_black)

    return SurvivalMetrics(
        unresolved_count=unresolved_count,
        min_black_probability=min_black_probability,
    )


def evaluate_survival_position(p_black: list[float], *, threshold: float) -> SurvivalEvaluation:
    """Compute baseline Survival score from ownership probabilities."""
    metrics = calculate_survival_metrics(p_black, threshold=threshold)
    return SurvivalEvaluation(survival_score=metrics.unresolved_count, metrics=metrics)
