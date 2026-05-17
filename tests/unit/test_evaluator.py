"""Unit tests for Survival evaluator metrics from ownership probabilities."""

import pytest

from backend.app.engine.evaluator import calculate_survival_metrics, evaluate_survival_position


@pytest.mark.unit
def test_calculate_survival_metrics_counts_points_below_threshold() -> None:
    p_black = [0.99, 0.94, 0.95, 0.20]

    metrics = calculate_survival_metrics(p_black, threshold=0.95)

    assert metrics.unresolved_count == 2


@pytest.mark.unit
def test_calculate_survival_metrics_reports_min_black_probability() -> None:
    p_black = [0.98, 0.83, 0.41, 0.77]

    metrics = calculate_survival_metrics(p_black, threshold=0.95)

    assert metrics.min_black_probability == pytest.approx(0.41)


@pytest.mark.unit
def test_calculate_survival_metrics_treats_threshold_boundary_as_resolved() -> None:
    p_black = [0.95, 0.96, 1.0]

    metrics = calculate_survival_metrics(p_black, threshold=0.95)

    assert metrics.unresolved_count == 0


@pytest.mark.unit
def test_evaluate_survival_position_uses_unresolved_count_as_score() -> None:
    p_black = [0.99, 0.2, 0.7, 0.96]

    evaluation = evaluate_survival_position(p_black, threshold=0.95)

    assert evaluation.survival_score == 2
    assert evaluation.metrics.unresolved_count == 2


@pytest.mark.unit
def test_evaluate_survival_position_rejects_empty_probabilities() -> None:
    with pytest.raises(ValueError, match="p_black must not be empty"):
        evaluate_survival_position([], threshold=0.95)
