"""Unit tests for engine resignation thresholds."""

import pytest

from backend.app.engine.resignation import should_engine_resign


@pytest.mark.unit
@pytest.mark.parametrize(
    ("engine_side", "min_black_probability", "expected"),
    [
        ("B", 0.009, True),
        ("B", 0.01, False),
        ("B", 0.5, False),
        ("W", 0.991, True),
        ("W", 0.99, False),
        ("W", 0.5, False),
    ],
)
def test_should_engine_resign(
    engine_side: str, min_black_probability: float, expected: bool
) -> None:
    assert (
        should_engine_resign(
            engine_side=engine_side,  # type: ignore[arg-type]
            min_black_probability=min_black_probability,
        )
        is expected
    )
