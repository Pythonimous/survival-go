"""Health endpoint and backend startup smoke tests."""

import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app.config import reset_settings_cache

PROJECT_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(autouse=True)
def _clear_settings_cache() -> None:
    reset_settings_cache()
    yield
    reset_settings_cache()


@pytest.mark.unit
def test_health_returns_service_status() -> None:
    from backend.app.main import create_app

    client = TestClient(create_app())
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "survival-katago"}


@pytest.mark.unit
def test_backend_uvicorn_responds_to_health() -> None:
    """Smoke: uvicorn serves GET /health on a local port."""
    env = os.environ.copy()
    env["PYTHONPATH"] = str(PROJECT_ROOT)
    proc = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "backend.app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            "8765",
        ],
        cwd=PROJECT_ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        url = "http://127.0.0.1:8765/health"
        for _ in range(40):
            try:
                with urllib.request.urlopen(url, timeout=1) as resp:
                    assert resp.status == 200
                    body = resp.read().decode("utf-8")
                    assert '"status":"ok"' in body.replace(" ", "")
                    assert "survival-katago" in body
                    return
            except (urllib.error.URLError, TimeoutError):
                time.sleep(0.25)
        pytest.fail("backend did not respond to GET /health on http://127.0.0.1:8765/health")
    finally:
        proc.terminate()
        proc.wait(timeout=10)
