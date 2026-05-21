"""Unit tests for API abuse limits (rate limiter, middleware, game caps)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.app.abuse_limits import SlidingWindowRateLimiter, write_route_limit_class
from backend.app.config import reset_settings_cache
from backend.app.errors import ErrorCode
from backend.app.game_service import GameServiceError, InMemoryGameService
from backend.app.logging import reset_logging_for_tests
from backend.app.main import create_app


@pytest.fixture(autouse=True)
def _reset_logging() -> None:
    reset_logging_for_tests()
    yield
    reset_logging_for_tests()


@pytest.mark.unit
@pytest.mark.parametrize(
    ("path", "method", "expected"),
    [
        ("/api/games", "POST", "create"),
        ("/api/games", "GET", None),
        ("/api/games/abc/move", "POST", "write"),
        ("/api/games/abc/analyze", "POST", "write"),
        ("/api/games/abc/engine-move", "POST", "write"),
        ("/api/games/abc/resign", "POST", "write"),
        ("/api/games/abc", "GET", None),
        ("/health", "GET", None),
    ],
)
def test_write_route_limit_class(path: str, method: str, expected: str | None) -> None:
    assert write_route_limit_class(path, method) == expected


@pytest.mark.unit
def test_sliding_window_rate_limiter_blocks_after_limit() -> None:
    limiter = SlidingWindowRateLimiter(window_seconds=60.0)

    assert limiter.allow("k", limit=2) is True
    assert limiter.allow("k", limit=2) is True
    assert limiter.allow("k", limit=2) is False


@pytest.mark.unit
def test_create_game_rate_limit_returns_429(api_client_strict: TestClient) -> None:
    for _ in range(2):
        response = api_client_strict.post(
            "/api/games",
            json={"preset_id": "balanced", "human_side": "W"},
        )
        assert response.status_code == 201

    blocked = api_client_strict.post(
        "/api/games",
        json={"preset_id": "balanced", "human_side": "W"},
    )
    assert blocked.status_code == 429
    assert blocked.json()["detail"]["code"] == ErrorCode.RATE_LIMITED.value


@pytest.mark.unit
def test_oversized_body_returns_413(api_client_strict: TestClient) -> None:
    response = api_client_strict.post(
        "/api/games",
        json={"preset_id": "balanced", "human_side": "W"},
        headers={"Content-Length": "999999"},
    )
    assert response.status_code == 413
    assert response.json()["detail"]["code"] == ErrorCode.PAYLOAD_TOO_LARGE.value


@pytest.mark.unit
def test_per_ip_active_game_cap_returns_503() -> None:
    service = InMemoryGameService(
        survival_threshold=0.95,
        max_active_games_global=100,
        max_active_games_per_ip=2,
    )
    service.create_game(preset_id="balanced", human_side="W", client_ip="10.0.0.1")
    service.create_game(preset_id="balanced", human_side="W", client_ip="10.0.0.1")

    with pytest.raises(GameServiceError) as exc_info:
        service.create_game(preset_id="balanced", human_side="W", client_ip="10.0.0.1")

    assert exc_info.value.code is ErrorCode.TOO_MANY_GAMES


@pytest.mark.unit
def test_global_active_game_cap_returns_503() -> None:
    service = InMemoryGameService(
        survival_threshold=0.95,
        max_active_games_global=1,
        max_active_games_per_ip=50,
    )
    service.create_game(preset_id="balanced", human_side="W", client_ip="10.0.0.1")

    with pytest.raises(GameServiceError) as exc_info:
        service.create_game(preset_id="balanced", human_side="B", client_ip="10.0.0.2")

    assert exc_info.value.code is ErrorCode.TOO_MANY_GAMES


@pytest.mark.unit
def test_delete_game_frees_per_ip_cap() -> None:
    service = InMemoryGameService(
        survival_threshold=0.95,
        max_active_games_global=100,
        max_active_games_per_ip=1,
    )
    game = service.create_game(preset_id="balanced", human_side="W", client_ip="10.0.0.5")
    service.delete_game(game.game_id)
    second = service.create_game(preset_id="balanced", human_side="W", client_ip="10.0.0.5")
    assert second.game_id != game.game_id


@pytest.mark.unit
def test_create_game_uses_x_forwarded_for_client_ip(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MAX_ACTIVE_GAMES_PER_IP", "1")
    monkeypatch.setenv("API_CREATE_RATE_PER_MINUTE", "1000")
    reset_settings_cache()
    client = TestClient(create_app())
    headers = {"X-Forwarded-For": "203.0.113.10, 10.0.0.1"}

    first = client.post(
        "/api/games",
        json={"preset_id": "balanced", "human_side": "W"},
        headers=headers,
    )
    assert first.status_code == 201

    second = client.post(
        "/api/games",
        json={"preset_id": "balanced", "human_side": "W"},
        headers=headers,
    )
    assert second.status_code == 503
    assert second.json()["detail"]["code"] == ErrorCode.TOO_MANY_GAMES.value


@pytest.fixture
def api_client_strict(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("API_CREATE_RATE_PER_MINUTE", "2")
    monkeypatch.setenv("API_MAX_REQUEST_BODY_BYTES", "1024")
    reset_settings_cache()
    return TestClient(create_app())
