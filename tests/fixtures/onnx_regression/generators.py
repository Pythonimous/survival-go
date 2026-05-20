"""Deterministic raw ONNX tensors for regression fixtures (mirrors frontend generators)."""

from __future__ import annotations

import math
from typing import TypedDict


class RawModelOutputs(TypedDict):
    policy: list[float]
    ownership: list[float]
    value: list[float]
    miscvalue: list[float]


def create_deterministic_v1_raw_outputs(*, board_size: int = 19) -> RawModelOutputs:
    """Synthetic raw tensors with stable values; satisfies shape/range contract checks."""
    moves = board_size * board_size + 1
    heads = 6
    policy: list[float] = []
    for head in range(heads):
        for move in range(moves):
            policy.append(math.sin((head + 1) * 0.17 + move * 0.031))

    ownership: list[float] = []
    for index in range(board_size * board_size):
        row = index // board_size
        col = index % board_size
        ownership.append(((row + col) % 18) / 9 - 1)

    return {
        "policy": policy,
        "ownership": ownership,
        "value": [0.02, -0.01, -0.01],
        "miscvalue": [0.0] * 10,
    }


def create_partial_resolved_raw_outputs(*, board_size: int = 19) -> RawModelOutputs:
    """Compact ownership pattern used in API integration tests (one unresolved point)."""
    points = board_size * board_size
    moves = points + 1
    return {
        "policy": [0.0] * (moves * 6),
        "ownership": [-0.2] + [1.0] * (points - 1),
        "value": [2.0, 1.0, 0.0],
        "miscvalue": [0.0, 0.0, -0.02] + [0.0] * 7,
    }
