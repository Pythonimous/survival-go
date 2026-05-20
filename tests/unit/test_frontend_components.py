"""Frontend React component tests (Vitest) invoked from pytest."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIR = PROJECT_ROOT / "frontend"


def _ensure_frontend_deps() -> None:
    if not (FRONTEND_DIR / "node_modules").is_dir():
        npm = shutil.which("npm")
        assert npm is not None, "npm is required for frontend component tests"
        install = subprocess.run(
            ["npm", "install"],
            cwd=FRONTEND_DIR,
            capture_output=True,
            text=True,
            timeout=180,
            check=False,
        )
        assert install.returncode == 0, install.stderr or install.stdout


def _run_npm_test() -> subprocess.CompletedProcess[str]:
    _ensure_frontend_deps()
    npm = shutil.which("npm")
    assert npm is not None, "npm is required for frontend component tests"
    return subprocess.run(
        ["npm", "test"],
        cwd=FRONTEND_DIR,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )


@pytest.mark.unit
def test_frontend_package_json_includes_vitest_script() -> None:
    data = json.loads((FRONTEND_DIR / "package.json").read_text(encoding="utf-8"))
    scripts = data.get("scripts", {})
    assert "test" in scripts
    dev_deps = data.get("devDependencies", {})
    assert "vitest" in dev_deps
    assert "@testing-library/react" in dev_deps


@pytest.mark.unit
def test_game_setup_component_exists() -> None:
    path = FRONTEND_DIR / "src" / "features" / "game" / "GameSetup.tsx"
    assert path.is_file()
    source = path.read_text(encoding="utf-8")
    assert "onStart" in source
    assert "initial_player_to_move" in source


@pytest.mark.unit
def test_goban_board_supports_gtp_click_callback() -> None:
    path = FRONTEND_DIR / "src" / "features" / "game" / "GobanBoard.tsx"
    source = path.read_text(encoding="utf-8")
    assert "onGtpClick" in source
    assert "vertexToGtp" in source


@pytest.mark.unit
def test_frontend_component_vitest_suite_passes() -> None:
    result = _run_npm_test()
    assert result.returncode == 0, result.stderr or result.stdout
