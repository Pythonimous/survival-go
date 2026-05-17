"""Cloud deployment topology documentation checks."""

from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
TOPOLOGY_DOC = PROJECT_ROOT / "docs" / "development" / "cloud-aws-ecs-topology.md"
README = PROJECT_ROOT / "README.md"


@pytest.mark.unit
def test_cloud_topology_doc_exists_and_covers_mvp_aws_shape() -> None:
    assert TOPOLOGY_DOC.is_file(), "docs/development/cloud-aws-ecs-topology.md is missing"
    text = TOPOLOGY_DOC.read_text(encoding="utf-8")
    required = (
        "AWS",
        "ECS",
        "Fargate",
        "single",
        "KataGo",
        "S3 + CloudFront",
        "Namecheap",
        "Secrets Manager",
        "manual deploy",
        "GET /health",
        "api.",
        "app.",
    )
    for needle in required:
        assert needle in text, f"missing {needle!r} in cloud-aws-ecs-topology.md"


@pytest.mark.unit
def test_readme_links_cloud_topology_doc() -> None:
    text = README.read_text(encoding="utf-8")
    assert "docs/development/cloud-aws-ecs-topology.md" in text
