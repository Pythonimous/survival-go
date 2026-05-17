"""Test runner aliases: run_tests.sh, Makefile, and CI workflow."""

from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RUN_TESTS = PROJECT_ROOT / "scripts" / "run_tests.sh"
MAKEFILE = PROJECT_ROOT / "Makefile"
CI_WORKFLOW = PROJECT_ROOT / ".github" / "workflows" / "ci.yml"

EXPECTED_COMMANDS = ("unit", "integration", "e2e", "lint", "types")
MAKE_TARGETS = (
    "test-unit",
    "test-integration",
    "test-e2e",
    "test-lint",
    "test-types",
    "test-fast",
    "test-all",
)


@pytest.mark.unit
def test_run_tests_script_exists_and_is_executable() -> None:
    assert RUN_TESTS.is_file(), f"missing {RUN_TESTS}"
    assert os.access(RUN_TESTS, os.X_OK), f"{RUN_TESTS} is not executable"


@pytest.mark.unit
def test_run_tests_help_lists_core_commands() -> None:
    result = subprocess.run(
        [str(RUN_TESTS), "help"],
        cwd=PROJECT_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    help_text = result.stdout.lower()
    for command in EXPECTED_COMMANDS:
        assert command in help_text, f"help missing command: {command}"


@pytest.mark.unit
def test_makefile_defines_test_aliases() -> None:
    assert MAKEFILE.is_file(), f"missing {MAKEFILE}"
    content = MAKEFILE.read_text(encoding="utf-8")
    for target in MAKE_TARGETS:
        assert re.search(rf"^{re.escape(target)}:", content, re.MULTILINE), (
            f"Makefile missing target: {target}"
        )


@pytest.mark.unit
def test_ci_workflow_defines_jobs_for_each_check() -> None:
    assert CI_WORKFLOW.is_file(), f"missing {CI_WORKFLOW}"
    content = CI_WORKFLOW.read_text(encoding="utf-8")
    for job in ("lint", "types", "unit", "integration", "e2e"):
        assert re.search(rf"^\s+{job}:", content, re.MULTILINE), (
            f"CI workflow missing job: {job}"
        )
    assert "./scripts/run_tests.sh" in content
