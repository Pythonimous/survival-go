"""Conservative anti-abuse limits for public API write routes."""

from __future__ import annotations

import re
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from backend.app.errors import ErrorCode, api_error_response

# Conservative defaults tuned to real play (engine moves often take 10s+).
DEFAULT_CREATE_GAME_PER_MINUTE = 3
DEFAULT_API_WRITE_PER_MINUTE = 20
DEFAULT_MAX_REQUEST_BODY_BYTES = 8 * 1024 * 1024
DEFAULT_MAX_ACTIVE_GAMES_GLOBAL = 50
DEFAULT_MAX_ACTIVE_GAMES_PER_IP = 5

_WRITE_ROUTE = re.compile(
    r"^/api/games/[^/]+/(move|resign|analyze|engine-move)$",
)


@dataclass(frozen=True, slots=True)
class AbuseLimitSettings:
    """Runtime tuning for edge-aligned app guardrails."""

    create_game_per_minute: int = DEFAULT_CREATE_GAME_PER_MINUTE
    api_write_per_minute: int = DEFAULT_API_WRITE_PER_MINUTE
    max_request_body_bytes: int = DEFAULT_MAX_REQUEST_BODY_BYTES
    max_active_games_global: int = DEFAULT_MAX_ACTIVE_GAMES_GLOBAL
    max_active_games_per_ip: int = DEFAULT_MAX_ACTIVE_GAMES_PER_IP


class SlidingWindowRateLimiter:
    """In-memory per-key request counter for a fixed window."""

    def __init__(self, *, window_seconds: float = 60.0) -> None:
        self._window_seconds = window_seconds
        self._hits: dict[str, list[float]] = {}

    def allow(self, key: str, *, limit: int) -> bool:
        if limit < 1:
            return True
        now = time.monotonic()
        bucket = self._hits.setdefault(key, [])
        cutoff = now - self._window_seconds
        while bucket and bucket[0] < cutoff:
            bucket.pop(0)
        if len(bucket) >= limit:
            return False
        bucket.append(now)
        return True

    def reset(self) -> None:
        """Clear counters (tests)."""
        self._hits.clear()


def client_ip_from_request(request: Request) -> str:
    """Prefer the first X-Forwarded-For hop when behind nginx/Caddy."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client is not None:
        return request.client.host
    return "unknown"


def write_route_limit_class(path: str, method: str) -> str | None:
    """Return ``create``, ``write``, or None (no app rate limit)."""
    if method.upper() != "POST":
        return None
    if path == "/api/games":
        return "create"
    if _WRITE_ROUTE.match(path):
        return "write"
    return None


def rate_limit_key(route_class: str, client_ip: str) -> str:
    return f"{route_class}:{client_ip}"


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Safety-net per-IP limits for POST write routes."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        settings: AbuseLimitSettings,
        limiter: SlidingWindowRateLimiter | None = None,
    ) -> None:
        super().__init__(app)
        self._settings = settings
        self._limiter = limiter or SlidingWindowRateLimiter()

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        route_class = write_route_limit_class(request.url.path, request.method)
        if route_class is not None:
            body_response = _reject_oversized_body(request, self._settings.max_request_body_bytes)
            if body_response is not None:
                return body_response
            if not self._allow_request(route_class, client_ip_from_request(request)):
                return _rate_limit_response()

        return await call_next(request)

    def _allow_request(self, route_class: str, client_ip: str) -> bool:
        key = rate_limit_key(route_class, client_ip)
        if route_class == "create":
            limit = self._settings.create_game_per_minute
        else:
            limit = self._settings.api_write_per_minute
        return self._limiter.allow(key, limit=limit)


def _reject_oversized_body(
    request: Request,
    max_bytes: int,
) -> JSONResponse | None:
    if max_bytes < 1:
        return None
    content_length = request.headers.get("content-length")
    if content_length is None:
        return None
    try:
        size = int(content_length)
    except ValueError:
        return _payload_too_large_response()
    if size > max_bytes:
        return _payload_too_large_response()
    return None


def _rate_limit_response() -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content=api_error_response(
            code=ErrorCode.RATE_LIMITED,
            message="too many requests; try again shortly",
        ),
    )


def _payload_too_large_response() -> JSONResponse:
    return JSONResponse(
        status_code=413,
        content=api_error_response(
            code=ErrorCode.PAYLOAD_TOO_LARGE,
            message="request body exceeds maximum allowed size",
        ),
    )
