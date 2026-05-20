"""Load ONNX regression fixture JSON files shared with frontend tests."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal, TypedDict

from tests.fixtures.onnx_regression.generators import (
    RawModelOutputs,
    create_deterministic_v1_raw_outputs,
    create_partial_resolved_raw_outputs,
)

FIXTURES_DIR = Path(__file__).resolve().parent


class PositionFixture(TypedDict):
    boardSize: int
    setupStones: list[dict[str, str]]
    moves: list[dict[str, str]]
    sideToMove: Literal["B", "W"]


class GameFixture(TypedDict):
    presetId: str
    humanSide: Literal["B", "W"]


class ExpectedAnalysisFixture(TypedDict, total=False):
    survivalScore: int
    unresolvedCount: int
    minBlackProbability: float
    policyLength: int
    policySum: float
    pBlackLength: int
    pBlackIndex0: float
    winrate: float


class EncodingFixture(TypedDict, total=False):
    binInputLength: int
    globalInputLength: int
    globalInput: dict[str, float]


class RegressionFixture(TypedDict, total=False):
    id: str
    description: str
    position: PositionFixture
    game: GameFixture
    rawGenerator: Literal["deterministic_v1", "partial_resolved"]
    encoding: EncodingFixture
    expectedAnalysis: ExpectedAnalysisFixture


def list_regression_fixture_paths() -> list[Path]:
    return sorted(FIXTURES_DIR.glob("*.json"))


def load_regression_fixture(path: Path | str) -> RegressionFixture:
    fixture_path = Path(path)
    with fixture_path.open(encoding="utf-8") as handle:
        payload: dict[str, Any] = json.load(handle)
    return payload  # type: ignore[return-value]


def load_all_regression_fixtures() -> list[RegressionFixture]:
    return [load_regression_fixture(path) for path in list_regression_fixture_paths()]


def resolve_raw_outputs(fixture: RegressionFixture) -> RawModelOutputs:
    board_size = fixture["position"]["boardSize"]
    generator = fixture.get("rawGenerator", "deterministic_v1")
    if generator == "deterministic_v1":
        return create_deterministic_v1_raw_outputs(board_size=board_size)
    if generator == "partial_resolved":
        return create_partial_resolved_raw_outputs(board_size=board_size)
    raise ValueError(f"unknown rawGenerator: {generator}")
