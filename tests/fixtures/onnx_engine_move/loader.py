"""Load browser engine-move regression fixtures shared with frontend tests."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal, TypedDict

from tests.fixtures.onnx_engine_move.ownership_profiles import (
    OwnershipProfile,
    raw_outputs_from_profile,
)

FIXTURES_DIR = Path(__file__).resolve().parent


class GameFixture(TypedDict):
    presetId: str
    humanSide: Literal["B", "W"]


class DifficultyFixture(TypedDict):
    maxVisits: int
    topN: int
    randomness: float
    variantAwareness: float
    temperature: float
    blunderMargin: float


class PolicyCandidateFixture(TypedDict, total=False):
    moveSlot: int
    policyProb: float
    ownershipProfile: OwnershipProfile
    winrate: float


class ExpectedFixture(TypedDict, total=False):
    selectedMoveSlot: int
    resigned: bool
    rankedMoveSlots: list[int]
    filteredMoveSlots: list[int]


class EngineMoveFixture(TypedDict):
    id: str
    description: str
    game: GameFixture
    difficulty: DifficultyFixture
    positionRaw: dict[str, OwnershipProfile]
    policyCandidates: list[PolicyCandidateFixture]
    expected: ExpectedFixture


def list_engine_move_fixture_paths() -> list[Path]:
    return sorted(FIXTURES_DIR.glob("*.json"))


def load_engine_move_fixture(path: Path | str) -> EngineMoveFixture:
    fixture_path = Path(path)
    with fixture_path.open(encoding="utf-8") as handle:
        payload: dict[str, Any] = json.load(handle)
    return payload  # type: ignore[return-value]


def load_all_engine_move_fixtures() -> list[EngineMoveFixture]:
    return [load_engine_move_fixture(path) for path in list_engine_move_fixture_paths()]


def resolve_position_raw(fixture: EngineMoveFixture) -> dict[str, Any]:
    profile = fixture["positionRaw"]["ownershipProfile"]
    return raw_outputs_from_profile(profile)


def resolve_candidate_raw(candidate: PolicyCandidateFixture) -> dict[str, Any]:
    profile = candidate.get("ownershipProfile", {"kind": "uniform", "p_black": 0.5})
    winrate = candidate.get("winrate")
    return raw_outputs_from_profile(profile, winrate=winrate)
