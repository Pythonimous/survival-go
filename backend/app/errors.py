"""Typed API error codes and consistent HTTP error payloads."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel


class ErrorCode(str, Enum):
    """Stable machine-readable codes returned in API error responses."""

    GAME_NOT_FOUND = "game_not_found"
    GAME_FINISHED = "game_finished"
    WRONG_TURN_HUMAN = "wrong_turn_human"
    WRONG_TURN_ENGINE = "wrong_turn_engine"
    ILLEGAL_MOVE = "illegal_move"
    INVALID_PRESET = "invalid_preset"
    INVALID_HUMAN_SIDE = "invalid_human_side"
    INVALID_POLICY_LENGTH = "invalid_policy_length"
    INVALID_OWNERSHIP_LENGTH = "invalid_ownership_length"
    INVALID_MISCVALUE_LENGTH = "invalid_miscvalue_length"
    NO_LEGAL_ENGINE_MOVES = "no_legal_engine_moves"
    VALIDATION_ERROR = "validation_error"
    INTERNAL_ERROR = "internal_error"


class ApiErrorDetail(BaseModel):
    """Structured error body nested under FastAPI's ``detail`` field."""

    code: ErrorCode
    message: str


def api_error_response(*, code: ErrorCode, message: str) -> dict[str, dict[str, str]]:
    """Build a JSON-serializable error payload for ``JSONResponse``."""
    detail = ApiErrorDetail(code=code, message=message)
    return {"detail": detail.model_dump(mode="json")}
