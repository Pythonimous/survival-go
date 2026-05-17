"""Unit tests for FastAPI app shutdown hooks."""

from __future__ import annotations

from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from backend.app.game_service import InMemoryGameService


@pytest.mark.unit
def test_app_shutdown_stops_game_service_katago_clients() -> None:
    clients: list[Mock] = []

    def factory() -> Mock:
        client = Mock()
        clients.append(client)
        return client

    game_service = InMemoryGameService(
        survival_threshold=0.95,
        katago_client_factory=factory,
    )
    from backend.app.main import create_app

    with TestClient(create_app(game_service=game_service)) as client:
        response = client.post(
            "/api/games",
            json={"preset_id": "balanced", "human_side": "W"},
        )
        assert response.status_code == 201

    assert clients
    assert all(mock_client.stop.called for mock_client in clients)
