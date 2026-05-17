"""Unit tests for shipped KataGo analysis config variants."""

from __future__ import annotations

from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
LOCAL_CFG = REPO_ROOT / "third_party" / "katago" / "analysis.cfg"
DOCKER_CFG = REPO_ROOT / "third_party" / "katago" / "analysis.docker.cfg"


def _parse_simple_cfg(path: Path) -> dict[str, str]:
    settings: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        key, _, value = line.partition("=")
        settings[key.strip()] = value.strip()
    return settings


@pytest.mark.unit
def test_local_analysis_cfg_exists_with_dev_thread_defaults() -> None:
    assert LOCAL_CFG.is_file()
    cfg = _parse_simple_cfg(LOCAL_CFG)
    assert cfg["numAnalysisThreads"] == "1"
    assert cfg["numSearchThreadsPerAnalysisThread"] == "2"
    assert cfg["reportAnalysisWinratesAs"] == "BLACK"


@pytest.mark.unit
def test_docker_analysis_cfg_exists_with_container_tuning() -> None:
    assert DOCKER_CFG.is_file()
    cfg = _parse_simple_cfg(DOCKER_CFG)
    # Shared KataGoClient serializes stdin; one in-flight query at a time.
    assert cfg["numAnalysisThreads"] == "1"
    assert int(cfg["numSearchThreadsPerAnalysisThread"]) >= 4
    assert int(cfg["nnCacheSizePowerOfTwo"]) <= 20
    assert int(cfg["nnMaxBatchSize"]) <= 8
    assert cfg["reportAnalysisWinratesAs"] == "BLACK"


@pytest.mark.unit
def test_docker_analysis_cfg_documents_timeout_env_in_header() -> None:
    text = DOCKER_CFG.read_text(encoding="utf-8")
    assert "KATAGO_ANALYSIS_TIMEOUT_SECONDS" in text
