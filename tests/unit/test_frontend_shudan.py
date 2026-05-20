"""Frontend Shudan + Vite React alias setup checks."""

import json
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIR = PROJECT_ROOT / "frontend"


@pytest.mark.unit
def test_frontend_package_json_includes_shudan() -> None:
    package_path = FRONTEND_DIR / "package.json"
    data = json.loads(package_path.read_text(encoding="utf-8"))
    deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
    assert "@sabaki/shudan" in deps


@pytest.mark.unit
def test_vite_config_aliases_preact_to_react_shims() -> None:
    vite_config = (FRONTEND_DIR / "vite.config.ts").read_text(encoding="utf-8")
    assert "preact" in vite_config
    assert "shims/preact" in vite_config
    preact_shim_dir = FRONTEND_DIR / "src" / "shims" / "preact"
    assert (preact_shim_dir / "index.ts").is_file()
    assert (preact_shim_dir / "hooks.ts").is_file()
    preact_shim = (preact_shim_dir / "index.ts").read_text(encoding="utf-8")
    hooks_shim = (preact_shim_dir / "hooks.ts").read_text(encoding="utf-8")
    assert 'from "react"' in preact_shim
    assert 'from "react"' in hooks_shim


@pytest.mark.unit
def test_main_entry_imports_goban_styles() -> None:
    main_tsx = (FRONTEND_DIR / "src" / "main.tsx").read_text(encoding="utf-8")
    assert "goban.css" in main_tsx
    assert "@sabaki/shudan" in main_tsx


@pytest.mark.unit
def test_goban_board_component_exports_empty_sign_map() -> None:
    path = FRONTEND_DIR / "src" / "features" / "game" / "GobanBoard.tsx"
    assert path.is_file(), "GobanBoard component is required for Shudan integration"
    source = path.read_text(encoding="utf-8")
    assert "Goban" in source
    assert "signMap" in source
    shudan_bridge = FRONTEND_DIR / "src" / "lib" / "go" / "shudan.tsx"
    assert shudan_bridge.is_file()
    assert "@sabaki/shudan" in shudan_bridge.read_text(encoding="utf-8")


@pytest.mark.unit
def test_frontend_build_succeeds_with_shudan() -> None:
    import shutil
    import subprocess

    npm = shutil.which("npm")
    assert npm is not None, "npm is required to verify frontend Shudan setup"

    if not (FRONTEND_DIR / "node_modules").is_dir():
        install = subprocess.run(
            ["npm", "install"],
            cwd=FRONTEND_DIR,
            capture_output=True,
            text=True,
            timeout=180,
            check=False,
        )
        assert install.returncode == 0, install.stderr or install.stdout

    result = subprocess.run(
        ["npm", "run", "build"],
        cwd=FRONTEND_DIR,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    assert result.returncode == 0, result.stderr or result.stdout
