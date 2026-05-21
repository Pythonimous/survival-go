"""Unit tests for typed API error model and exception handlers."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.app.errors import ApiErrorDetail, ErrorCode, api_error_response
from backend.app.game_service import (
    GameNotFoundError,
    GameServiceError,
    InMemoryGameService,
)
from backend.app.logging import reset_logging_for_tests
from backend.app.main import create_app


@pytest.fixture(autouse=True)
def _reset_logging() -> None:
    reset_logging_for_tests()
    yield
    reset_logging_for_tests()


@pytest.mark.unit
def test_api_error_detail_serializes_code_and_message() -> None:
    payload = ApiErrorDetail(code=ErrorCode.GAME_NOT_FOUND, message="game not found: abc")

    assert payload.model_dump() == {
        "code": "game_not_found",
        "message": "game not found: abc",
    }


@pytest.mark.unit
def test_api_error_response_wraps_detail() -> None:
    body = api_error_response(
        code=ErrorCode.ILLEGAL_MOVE,
        message="illegal move: D4",
    )

    assert body == {
        "detail": {
            "code": "illegal_move",
            "message": "illegal move: D4",
        }
    }


@pytest.mark.unit
def test_game_not_found_error_carries_code() -> None:
    exc = GameNotFoundError("game not found: missing")

    assert exc.code is ErrorCode.GAME_NOT_FOUND
    assert str(exc) == "game not found: missing"


@pytest.mark.unit
def test_game_service_error_carries_explicit_code() -> None:
    exc = GameServiceError("game is already finished", code=ErrorCode.GAME_FINISHED)

    assert exc.code is ErrorCode.GAME_FINISHED


@pytest.mark.unit
@pytest.mark.parametrize(
    ("factory", "expected_code"),
    [
        (lambda: GameNotFoundError("game not found: x"), ErrorCode.GAME_NOT_FOUND),
        (
            lambda: GameServiceError("illegal move: D4", code=ErrorCode.ILLEGAL_MOVE),
            ErrorCode.ILLEGAL_MOVE,
        ),
        (
            lambda: GameServiceError(
                "it is not the human side turn",
                code=ErrorCode.WRONG_TURN_HUMAN,
            ),
            ErrorCode.WRONG_TURN_HUMAN,
        ),
    ],
)
def test_service_errors_expose_stable_codes(
    factory: object,
    expected_code: ErrorCode,
) -> None:
    exc = factory()
    assert isinstance(exc, GameServiceError)
    assert exc.code is expected_code


@pytest.mark.unit
def test_unknown_game_returns_structured_not_found(api_client: TestClient) -> None:
    response = api_client.get("/api/games/does-not-exist")

    assert response.status_code == 404
    detail = response.json()["detail"]
    assert detail["code"] == "game_not_found"
    assert "not found" in detail["message"].lower()


@pytest.mark.unit
def test_invalid_create_game_payload_returns_validation_error(api_client: TestClient) -> None:
    response = api_client.post(
        "/api/games",
        json={"preset_id": "balanced", "human_side": "X"},
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "validation_error"
    assert "human_side" in detail["message"].lower()


@pytest.fixture
def api_client() -> TestClient:
    return TestClient(create_app(game_service=InMemoryGameService(survival_threshold=0.95)))


@pytest.mark.unit
def test_game_service_raises_coded_errors_for_common_cases() -> None:
    service = InMemoryGameService(survival_threshold=0.95)

    with pytest.raises(GameNotFoundError) as not_found:
        service.get_game("missing")
    assert not_found.value.code is ErrorCode.GAME_NOT_FOUND

    game = service.create_game(preset_id="balanced", human_side="B")
    with pytest.raises(GameServiceError) as wrong_turn:
        service.apply_human_move(game_id=game.game_id, move="D4")
    assert wrong_turn.value.code is ErrorCode.WRONG_TURN_HUMAN


@pytest.mark.unit
def test_config_validation_error_is_not_game_service_error() -> None:
    from backend.app.config import Settings

    with pytest.raises(ValidationError):
        Settings(survival_threshold=2.0)
