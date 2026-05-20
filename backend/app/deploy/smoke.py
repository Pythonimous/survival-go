"""HTTP smoke checks for a deployed Survival Go API."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx


class DeploySmokeError(RuntimeError):
    """One or more post-deploy smoke checks failed."""


@dataclass(frozen=True)
class _SmokeContext:
    base_url: str
    client: httpx.Client
    timeout_seconds: float


def normalize_api_base_url(base_url: str) -> str:
    """Normalize deploy API base URL (scheme required, no trailing slash)."""
    trimmed = base_url.strip()
    if not trimmed:
        raise ValueError("API base URL is required")
    if not trimmed.startswith(("http://", "https://")):
        raise ValueError("API base URL must start with http:// or https://")
    return trimmed.rstrip("/")


def run_deploy_smoke_checks(
    api_base_url: str,
    *,
    with_analyze: bool = False,
    timeout_seconds: float = 30.0,
    client: httpx.Client | None = None,
) -> list[str]:
    """Run post-deploy smoke checks against ``api_base_url``.

    Returns step labels on success. Raises :class:`DeploySmokeError` on failure.
    """
    base_url = normalize_api_base_url(api_base_url)
    owns_client = client is None
    http_client = client or httpx.Client(timeout=timeout_seconds)
    ctx = _SmokeContext(base_url=base_url, client=http_client, timeout_seconds=timeout_seconds)
    try:
        steps = ["health", "presets"]
        _check_health(ctx)
        _check_presets(ctx)
        if with_analyze:
            _check_analyze(ctx)
            steps.append("analyze")
        return steps
    except DeploySmokeError:
        raise
    except httpx.HTTPError as exc:
        raise DeploySmokeError(f"request failed: {exc}") from exc
    finally:
        if owns_client:
            http_client.close()


def _check_health(ctx: _SmokeContext) -> None:
    response = ctx.client.get(f"{ctx.base_url}/health", timeout=ctx.timeout_seconds)
    if response.status_code != 200:
        raise DeploySmokeError(f"health returned HTTP {response.status_code}")
    payload = response.json()
    if payload.get("status") != "ok" or payload.get("service") != "survival-go":
        raise DeploySmokeError(f"unexpected health payload: {payload!r}")


def _check_presets(ctx: _SmokeContext) -> None:
    response = ctx.client.get(f"{ctx.base_url}/api/presets", timeout=ctx.timeout_seconds)
    if response.status_code != 200:
        raise DeploySmokeError(f"presets returned HTTP {response.status_code}")
    presets = response.json()
    if not isinstance(presets, list) or not presets:
        raise DeploySmokeError("presets response was empty")
    first = presets[0]
    if not isinstance(first, dict) or "id" not in first:
        raise DeploySmokeError(f"unexpected presets payload: {presets!r}")


def _check_analyze(ctx: _SmokeContext) -> None:
    game_id = _create_smoke_game(ctx)
    response = ctx.client.post(
        f"{ctx.base_url}/api/games/{game_id}/analyze",
        json={
            "raw_model_outputs": {
                "policy": [0.0] * ((19 * 19 + 1) * 6),
                "ownership": [-0.2] + [1.0] * 360,
                "value": [0.0, 0.0, 0.0],
                "miscvalue": [0.0] * 10,
            }
        },
        timeout=ctx.timeout_seconds,
    )
    if response.status_code != 200:
        raise DeploySmokeError(f"analyze returned HTTP {response.status_code}")
    payload = response.json()
    _validate_analyze_payload(payload, game_id)


def _create_smoke_game(ctx: _SmokeContext) -> str:
    response = ctx.client.post(
        f"{ctx.base_url}/api/games",
        json={"preset_id": "balanced", "human_side": "W"},
        timeout=ctx.timeout_seconds,
    )
    if response.status_code != 201:
        raise DeploySmokeError(f"create game returned HTTP {response.status_code}")
    payload = response.json()
    game_id = payload.get("game_id")
    if not isinstance(game_id, str) or not game_id:
        raise DeploySmokeError(f"unexpected create-game payload: {payload!r}")
    return game_id


def _validate_analyze_payload(payload: dict[str, Any], game_id: str) -> None:
    if payload.get("game_id") != game_id:
        raise DeploySmokeError(f"analyze game_id mismatch: {payload!r}")
    metrics = payload.get("metrics")
    if not isinstance(metrics, dict):
        raise DeploySmokeError(f"analyze missing metrics: {payload!r}")
    unresolved = metrics.get("unresolved_count")
    min_black = metrics.get("min_black_probability")
    if not isinstance(unresolved, int) or unresolved < 0:
        raise DeploySmokeError(f"invalid unresolved_count: {metrics!r}")
    if not isinstance(min_black, (int, float)) or not 0.0 <= float(min_black) <= 1.0:
        raise DeploySmokeError(f"invalid min_black_probability: {metrics!r}")
