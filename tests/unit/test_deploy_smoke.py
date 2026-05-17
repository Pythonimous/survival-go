"""Post-deploy smoke check helpers and CLI."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import httpx
import pytest

from backend.app.deploy.smoke import (
    DeploySmokeError,
    normalize_api_base_url,
    run_deploy_smoke_checks,
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SMOKE_SCRIPT = PROJECT_ROOT / "scripts" / "smoke_deploy.py"
DEPLOY_SCRIPT = PROJECT_ROOT / "scripts" / "deploy_cloud.sh"
DEPLOY_DOC = PROJECT_ROOT / "docs" / "development" / "cloud-deploy-automation.md"


@pytest.mark.unit
def test_normalize_api_base_url_strips_trailing_slash() -> None:
    assert normalize_api_base_url("https://api.example.com/") == "https://api.example.com"


@pytest.mark.unit
def test_normalize_api_base_url_rejects_empty() -> None:
    with pytest.raises(ValueError, match="required"):
        normalize_api_base_url("  ")


@pytest.mark.unit
def test_normalize_api_base_url_requires_http_scheme() -> None:
    with pytest.raises(ValueError, match="http"):
        normalize_api_base_url("api.example.com")


@pytest.mark.unit
def test_run_deploy_smoke_checks_health_and_presets() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/health":
            return httpx.Response(200, json={"status": "ok", "service": "survival-go"})
        if request.url.path == "/api/presets":
            return httpx.Response(200, json=[{"id": "balanced", "name": "Balanced"}])
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    http_client = httpx.Client(transport=transport, base_url="https://api.example.com")
    try:
        steps = run_deploy_smoke_checks(
            "https://api.example.com",
            with_analyze=False,
            client=http_client,
        )
    finally:
        http_client.close()

    assert steps == ["health", "presets"]


@pytest.mark.unit
def test_run_deploy_smoke_checks_analyze_optional() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/health":
            return httpx.Response(200, json={"status": "ok", "service": "survival-go"})
        if request.url.path == "/api/presets":
            return httpx.Response(200, json=[{"id": "balanced", "name": "Balanced"}])
        if request.url.path == "/api/games" and request.method == "POST":
            return httpx.Response(201, json={"game_id": "smoke-game"})
        if request.url.path.endswith("/analyze"):
            return httpx.Response(
                200,
                json={
                    "game_id": "smoke-game",
                    "metrics": {"unresolved_count": 12, "min_black_probability": 0.42},
                },
            )
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    http_client = httpx.Client(transport=transport, base_url="https://api.example.com")
    try:
        steps = run_deploy_smoke_checks(
            "https://api.example.com",
            with_analyze=True,
            client=http_client,
        )
    finally:
        http_client.close()

    assert steps == ["health", "presets", "analyze"]


@pytest.mark.unit
def test_run_deploy_smoke_checks_raises_on_bad_health() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/health":
            return httpx.Response(503, json={"detail": "down"})
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    with httpx.Client(transport=transport, base_url="https://api.example.com") as http_client:
        with pytest.raises(DeploySmokeError, match="health"):
            run_deploy_smoke_checks(
                "https://api.example.com",
                client=http_client,
            )


@pytest.mark.unit
def test_run_deploy_smoke_checks_raises_when_presets_empty() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/health":
            return httpx.Response(200, json={"status": "ok", "service": "survival-go"})
        if request.url.path == "/api/presets":
            return httpx.Response(200, json=[])
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    with httpx.Client(transport=transport, base_url="https://api.example.com") as http_client:
        with pytest.raises(DeploySmokeError, match="presets"):
            run_deploy_smoke_checks(
                "https://api.example.com",
                client=http_client,
            )


@pytest.mark.unit
def test_smoke_deploy_cli_requires_api_base_url() -> None:
    result = subprocess.run(
        [sys.executable, str(SMOKE_SCRIPT)],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode != 0
    assert "API_BASE_URL" in result.stderr or "api-base-url" in result.stderr


@pytest.mark.unit
def test_deploy_cloud_script_exists_and_invokes_smoke() -> None:
    assert DEPLOY_SCRIPT.is_file(), "scripts/deploy_cloud.sh is missing"
    text = DEPLOY_SCRIPT.read_text(encoding="utf-8")
    assert "smoke_deploy.py" in text
    assert "build_backend_image.sh" in text
    assert "build_frontend.sh" in text
    assert "API_BASE_URL" in text


@pytest.mark.unit
def test_readme_links_cloud_deploy_automation_doc() -> None:
    readme = (PROJECT_ROOT / "README.md").read_text(encoding="utf-8")
    assert "docs/development/cloud-deploy-automation.md" in readme


@pytest.mark.unit
def test_cloud_deploy_automation_doc_exists_and_links_scripts() -> None:
    assert DEPLOY_DOC.is_file(), "docs/development/cloud-deploy-automation.md is missing"
    text = DEPLOY_DOC.read_text(encoding="utf-8")
    required = (
        "scripts/deploy_cloud.sh",
        "scripts/smoke_deploy.py",
        "GET /health",
        "/api/presets",
        "with-analyze",
        "API_BASE_URL",
        "SKIP_BACKEND",
        "SKIP_FRONTEND",
        "SKIP_SMOKE",
    )
    for needle in required:
        assert needle in text, f"missing {needle!r} in cloud-deploy-automation.md"
