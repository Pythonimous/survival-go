"""Structured JSON logging for game lifecycle and engine operations."""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any

GAME_LOGGER_NAME = "survival.game"
_ROOT_LOGGER_NAME = "survival"

_CONFIGURED = False


class StructuredJsonFormatter(logging.Formatter):
    """Emit one JSON object per log line for operational parsing."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
        }
        structured = getattr(record, "structured", None)
        if isinstance(structured, dict):
            payload.update(structured)
        else:
            payload["message"] = record.getMessage()
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging(*, level: str = "INFO") -> None:
    """Configure root survival logger with JSON output (idempotent)."""
    global _CONFIGURED
    if _CONFIGURED:
        return

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(StructuredJsonFormatter())
    root = logging.getLogger(_ROOT_LOGGER_NAME)
    root.handlers = [handler]
    root.setLevel(level.upper())
    root.propagate = False
    _CONFIGURED = True


def reset_logging_for_tests() -> None:
    """Clear logging configuration (tests only)."""
    global _CONFIGURED
    root = logging.getLogger(_ROOT_LOGGER_NAME)
    root.handlers.clear()
    _CONFIGURED = False


def log_game_event(
    logger: logging.Logger,
    level: int,
    event: str,
    **fields: object,
) -> None:
    """Write a structured game event."""
    logger.log(level, event, extra={"structured": {"event": event, **fields}})


def get_game_logger() -> logging.Logger:
    """Return the game lifecycle logger."""
    return logging.getLogger(GAME_LOGGER_NAME)
