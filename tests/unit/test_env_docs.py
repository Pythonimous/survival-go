"""Environment templates and production-safe defaults documentation."""

from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ENV_DOC = PROJECT_ROOT / "docs" / "development" / "environment.md"
ENV_EXAMPLE = PROJECT_ROOT / ".env.example"
ENV_DOCKER_EXAMPLE = PROJECT_ROOT / ".env.docker.example"
DOCKER_DOC = PROJECT_ROOT / "docs" / "development" / "docker-compose.md"
LOCAL_RUN_DOC = PROJECT_ROOT / "docs" / "development" / "local-run.md"
README = PROJECT_ROOT / "README.md"

OPTIONAL_ENV_VARS = (
    "SURVIVAL_THRESHOLD",
    "DEFAULT_TOP_N",
    "CORS_ALLOW_ORIGINS",
)


@pytest.mark.unit
def test_environment_doc_exists_and_documents_settings() -> None:
    assert ENV_DOC.is_file(), "docs/development/environment.md is missing"
    text = ENV_DOC.read_text(encoding="utf-8")
    for var in OPTIONAL_ENV_VARS:
        assert var in text, f"missing {var!r} in environment.md"
    required = (
        ".env.example",
        ".env.docker.example",
        "browser-inference-design.md",
        "onnx-model-artifacts.md",
        "production-safe",
        "docker-compose.yml",
    )
    for needle in required:
        assert needle in text, f"missing {needle!r} in environment.md"
    assert "KATAGO_BINARY_PATH" not in text


@pytest.mark.unit
def test_env_example_lists_optional_variables() -> None:
    assert ENV_EXAMPLE.is_file()
    text = ENV_EXAMPLE.read_text(encoding="utf-8")
    for var in ("SURVIVAL_THRESHOLD", "DEFAULT_TOP_N"):
        assert var in text, f"missing {var!r} in .env.example"
    assert "KATAGO_BINARY_PATH" not in text


@pytest.mark.unit
def test_env_docker_example_lists_survival_defaults() -> None:
    assert ENV_DOCKER_EXAMPLE.is_file()
    text = ENV_DOCKER_EXAMPLE.read_text(encoding="utf-8")
    for var in ("SURVIVAL_THRESHOLD", "DEFAULT_TOP_N"):
        assert var in text, f"missing {var!r} in .env.docker.example"


@pytest.mark.unit
def test_packaging_docs_link_environment_reference() -> None:
    for path in (DOCKER_DOC, LOCAL_RUN_DOC, README):
        text = path.read_text(encoding="utf-8")
        assert "environment.md" in text, f"missing environment.md link in {path.name}"
