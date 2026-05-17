"""Scaffold checks for backend FastAPI and frontend Vite layout."""

import json
import os
import subprocess
from pathlib import Path

import pytest
from fastapi import FastAPI

PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIR = PROJECT_ROOT / "frontend"


@pytest.mark.unit
def test_backend_app_is_fastapi_instance() -> None:
    from backend.app.main import app

    assert isinstance(app, FastAPI)
    assert app.title == "survival-katago"


@pytest.mark.unit
def test_run_scripts_exist_and_are_executable() -> None:
    for name in ("run_backend.sh", "run_frontend.sh", "run_tests.sh"):
        script = PROJECT_ROOT / "scripts" / name
        assert script.is_file(), f"missing {script}"
        assert os.access(script, os.X_OK), f"{script} is not executable"


@pytest.mark.unit
def test_frontend_package_json_has_vite_react_typescript() -> None:
    package_path = FRONTEND_DIR / "package.json"
    assert package_path.is_file(), "frontend/package.json is missing"
    data = json.loads(package_path.read_text(encoding="utf-8"))
    dev_deps = data.get("devDependencies", {})
    deps = data.get("dependencies", {})
    all_deps = {**deps, **dev_deps}
    assert "vite" in all_deps
    assert "react" in all_deps
    assert "typescript" in all_deps
    assert "dev" in data.get("scripts", {}), "npm run dev script is required"


@pytest.mark.unit
def test_frontend_dev_server_starts() -> None:
    """Smoke: Vite dev server accepts HTTP on the default port."""
    if not (FRONTEND_DIR / "node_modules").is_dir():
        pytest.skip("frontend dependencies not installed (run npm install in frontend/)")

    proc = subprocess.Popen(
        ["npm", "run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"],
        cwd=FRONTEND_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        import urllib.error
        import urllib.request

        for _ in range(40):
            try:
                with urllib.request.urlopen("http://127.0.0.1:5173/", timeout=1) as resp:
                    assert resp.status == 200
                    return
            except (urllib.error.URLError, TimeoutError):
                import time

                time.sleep(0.25)
        pytest.fail("frontend dev server did not respond on http://127.0.0.1:5173/")
    finally:
        proc.terminate()
        proc.wait(timeout=10)
