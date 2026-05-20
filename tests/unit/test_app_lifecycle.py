"""Unit tests for FastAPI app shutdown hooks."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.app.game_service import InMemoryGameService


@pytest.mark.unit
def test_app_shutdown_clears_game_service_sessions() -> None:
    game_service = InMemoryGameService(survival_threshold=0.95)
    from backend.app.main import create_app

    with TestClient(create_app(game_service=game_service)) as client:
        response = client.post(
            "/api/games",
            json={"preset_id": "balanced", "human_side": "W"},
        )
        assert response.status_code == 201
        game_id = response.json()["game_id"]
        assert game_service.get_game(game_id).game_id == game_id

    assert not game_service._games
