"""Integration tests for core API lifecycle endpoints."""

from __future__ import annotations

import copy
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sgfmill import boards

from backend.app.engine.board import (
    format_gtp_coordinate,
    parse_gtp_coordinate,
    to_sgfmill_color,
)
from backend.app.katago.client import KataGoClient
from backend.app.presets.loader import get_preset_by_id


@pytest.fixture
def api_client(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> TestClient:
    binary = tmp_path / "katago"
    binary.write_text("#!/bin/sh\n", encoding="utf-8")
    binary.chmod(0o755)
    config = tmp_path / "analysis.cfg"
    config.write_text("numSearchThreads = 1\n", encoding="utf-8")
    model = tmp_path / "model.bin.gz"
    model.write_bytes(b"fake-model")

    monkeypatch.setenv("KATAGO_BINARY_PATH", str(binary))
    monkeypatch.setenv("KATAGO_CONFIG_PATH", str(config))
    monkeypatch.setenv("KATAGO_MODEL_PATH", str(model))
    monkeypatch.setattr(
        KataGoClient,
        "analyze_position",
        lambda self, **kwargs: [0.4] + [1.0] * 360,
    )

    def _pick_legal_candidate(self: KataGoClient, **kwargs: object) -> list[str]:
        board = boards.Board(19)
        initial_stones = kwargs["initial_stones"]
        assert isinstance(initial_stones, list)
        for stone in initial_stones:
            color, move = stone
            assert isinstance(color, str)
            assert isinstance(move, str)
            row, col = parse_gtp_coordinate(move, size=19)
            board.play(row, col, to_sgfmill_color(color))
        initial_player = kwargs["initial_player"]
        assert isinstance(initial_player, str)
        sgf_color = to_sgfmill_color(initial_player)
        for row in range(board.side):
            for col in range(board.side):
                if board.get(row, col) is not None:
                    continue
                trial = board.copy()
                try:
                    trial.play(row, col, sgf_color)
                except ValueError:
                    continue
                return [format_gtp_coordinate(row, col, size=board.side)]
        return []

    monkeypatch.setattr(KataGoClient, "get_candidate_moves", _pick_legal_candidate)

    from backend.app.main import create_app

    return TestClient(create_app())


def _first_legal_move_for_side(preset_id: str, *, side: str) -> str:
    preset = get_preset_by_id(preset_id)
    board = preset.board
    sgf_color = to_sgfmill_color(side)
    for row in range(board.side):
        for col in range(board.side):
            if board.get(row, col) is not None:
                continue
            trial = copy.deepcopy(board)
            try:
                trial.play(row, col, sgf_color)
            except ValueError:
                continue
            return format_gtp_coordinate(row, col, size=board.side)
    raise AssertionError(f"no legal move available for side {side}")


def _extract_metrics(payload: dict[str, Any]) -> dict[str, Any]:
    metrics = payload.get("metrics")
    if isinstance(metrics, dict):
        return metrics
    analysis = payload.get("analysis")
    if isinstance(analysis, dict):
        nested_metrics = analysis.get("metrics")
        if isinstance(nested_metrics, dict):
            return nested_metrics
    raise AssertionError("response does not include metrics")


@pytest.mark.integration
def test_api_lifecycle_create_fetch_move_engine_and_analyze(
    api_client: TestClient,
) -> None:
    preset_id = "balanced"
    human_side = get_preset_by_id(preset_id).initial_player_to_move
    human_move = _first_legal_move_for_side(preset_id, side=human_side)

    presets_response = api_client.get("/api/presets")
    assert presets_response.status_code == 200
    presets_payload = presets_response.json()
    assert isinstance(presets_payload, list)
    assert any(preset.get("id") == preset_id for preset in presets_payload)

    create_response = api_client.post(
        "/api/games",
        json={"preset_id": preset_id, "human_side": human_side},
    )
    assert create_response.status_code == 201
    create_payload = create_response.json()
    game_id = create_payload["game_id"]
    assert isinstance(game_id, str)
    assert game_id

    state_response = api_client.get(f"/api/games/{game_id}")
    assert state_response.status_code == 200
    assert state_response.json()["game_id"] == game_id

    human_move_response = api_client.post(
        f"/api/games/{game_id}/move",
        json={"move": human_move},
    )
    assert human_move_response.status_code == 200
    assert human_move_response.json()["game_id"] == game_id

    engine_move_response = api_client.post(f"/api/games/{game_id}/engine-move")
    assert engine_move_response.status_code == 200
    assert engine_move_response.json()["game_id"] == game_id

    analyze_response = api_client.post(f"/api/games/{game_id}/analyze")
    assert analyze_response.status_code == 200
    metrics = _extract_metrics(analyze_response.json())
    assert metrics["unresolved_count"] == 1
    assert float(metrics["min_black_probability"]) == pytest.approx(0.4)
