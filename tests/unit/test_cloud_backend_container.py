"""Cloud backend container image documentation checks."""

from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CONTAINER_DOC = PROJECT_ROOT / "docs" / "development" / "cloud-backend-container.md"
TOPOLOGY_DOC = PROJECT_ROOT / "docs" / "development" / "cloud-aws-ecs-topology.md"
BACKEND_DOCKERFILE = PROJECT_ROOT / "docker" / "backend" / "Dockerfile"
BUILD_SCRIPT = PROJECT_ROOT / "scripts" / "build_backend_image.sh"
README = PROJECT_ROOT / "README.md"
ENV_DOC = PROJECT_ROOT / "docs" / "development" / "environment.md"


@pytest.mark.unit
def test_cloud_backend_container_doc_exists_and_documents_api_image() -> None:
    assert CONTAINER_DOC.is_file(), "docs/development/cloud-backend-container.md is missing"
    text = CONTAINER_DOC.read_text(encoding="utf-8")
    required = (
        "docker/backend/Dockerfile",
        "scripts/build_backend_image.sh",
        "Browser ONNX",
        "ECR",
        "ECS",
        "HEALTHCHECK",
        "SURVIVAL_THRESHOLD",
    )
    for needle in required:
        assert needle in text, f"missing {needle!r} in cloud-backend-container.md"
    assert "KATAGO_BINARY_PATH" not in text


@pytest.mark.unit
def test_build_backend_image_script_builds_from_repo_dockerfile() -> None:
    assert BUILD_SCRIPT.is_file(), "scripts/build_backend_image.sh is missing"
    text = BUILD_SCRIPT.read_text(encoding="utf-8")
    assert "docker/backend/Dockerfile" in text
    assert "docker build" in text


@pytest.mark.unit
def test_backend_dockerfile_has_healthcheck_for_deploy() -> None:
    text = BACKEND_DOCKERFILE.read_text(encoding="utf-8")
    assert "HEALTHCHECK" in text
    assert "/health" in text


@pytest.mark.unit
def test_topology_and_readme_link_cloud_backend_container_doc() -> None:
    topology = TOPOLOGY_DOC.read_text(encoding="utf-8")
    assert "cloud-backend-container.md" in topology
    readme = README.read_text(encoding="utf-8")
    assert "docs/development/cloud-backend-container.md" in readme


@pytest.mark.unit
def test_environment_doc_lists_cloud_deploy_profile() -> None:
    text = ENV_DOC.read_text(encoding="utf-8")
    assert "Cloud" in text or "cloud" in text
    assert "cloud-backend-container.md" in text
