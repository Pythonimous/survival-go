"""FastAPI exception handlers for consistent API error responses."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.app.errors import ErrorCode, api_error_response
from backend.app.game_service import GameNotFoundError, GameServiceError


def _status_code_for_game_error(exc: GameServiceError) -> int:
    if isinstance(exc, GameNotFoundError):
        return 404
    return 400


def _validation_message(errors: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for item in errors:
        location = item.get("loc", ())
        field = ".".join(
            str(part) for part in location if str(part) != "body"
        )
        message = item.get("msg", "invalid value")
        if field:
            parts.append(f"{field}: {message}")
        else:
            parts.append(str(message))
    return "; ".join(parts)


def register_exception_handlers(application: FastAPI) -> None:
    """Attach handlers that map domain and validation errors to typed payloads."""

    @application.exception_handler(GameServiceError)
    async def handle_game_service_error(
        _request: Request,
        exc: GameServiceError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=_status_code_for_game_error(exc),
            content=api_error_response(code=exc.code, message=str(exc)),
        )

    @application.exception_handler(RequestValidationError)
    async def handle_request_validation_error(
        _request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=api_error_response(
                code=ErrorCode.VALIDATION_ERROR,
                message=_validation_message(list(exc.errors())),
            ),
        )

    @application.exception_handler(StarletteHTTPException)
    async def handle_http_exception(
        _request: Request,
        exc: StarletteHTTPException,
    ) -> JSONResponse:
        if isinstance(exc.detail, dict) and "code" in exc.detail:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
        return JSONResponse(
            status_code=exc.status_code,
            content=api_error_response(
                code=ErrorCode.INTERNAL_ERROR,
                message=str(exc.detail),
            ),
        )

    @application.exception_handler(Exception)
    async def handle_unexpected_error(
        _request: Request,
        _exc: Exception,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content=api_error_response(
                code=ErrorCode.INTERNAL_ERROR,
                message="internal server error",
            ),
        )
