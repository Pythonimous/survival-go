"""Unit tests for deterministic ONNX fixture generators."""

from __future__ import annotations

import pytest

from tests.fixtures.onnx_engine_move.ownership_profiles import raw_outputs_from_profile
from tests.fixtures.onnx_regression.generators import (
    create_deterministic_v1_raw_outputs,
    create_partial_resolved_raw_outputs,
)


@pytest.mark.unit
@pytest.mark.parametrize(
    "factory",
    [create_deterministic_v1_raw_outputs, create_partial_resolved_raw_outputs],
)
def test_regression_raw_generators_include_kaya_output_heads(factory) -> None:
    raw = factory()

    assert len(raw["value"]) == 3
    assert len(raw["miscvalue"]) == 10


@pytest.mark.unit
def test_engine_move_profile_raw_outputs_include_kaya_output_heads() -> None:
    raw = raw_outputs_from_profile({"kind": "uniform", "p_black": 0.5})

    assert raw["ownership"][0] == pytest.approx(0.0)
    assert len(raw["value"]) == 3
    assert len(raw["miscvalue"]) == 10
