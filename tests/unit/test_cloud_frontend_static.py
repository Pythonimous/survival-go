"""Cloud frontend static build and publish documentation checks."""

from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DOC = PROJECT_ROOT / "docs" / "development" / "cloud-frontend-static.md"
TOPOLOGY_DOC = PROJECT_ROOT / "docs" / "development" / "cloud-aws-ecs-topology.md"
BUILD_SCRIPT = PROJECT_ROOT / "scripts" / "build_frontend.sh"
PUBLISH_SCRIPT = PROJECT_ROOT / "scripts" / "publish_frontend_s3.sh"
API_MODULE = PROJECT_ROOT / "frontend" / "src" / "lib" / "api" / "client.ts"
ENV_PRODUCTION_EXAMPLE = PROJECT_ROOT / "frontend" / ".env.production.example"
README = PROJECT_ROOT / "README.md"


@pytest.mark.unit
def test_cloud_frontend_static_doc_exists_and_covers_build_and_publish() -> None:
    assert FRONTEND_DOC.is_file(), "docs/development/cloud-frontend-static.md is missing"
    text = FRONTEND_DOC.read_text(encoding="utf-8")
    required = (
        "VITE_API_BASE_URL",
        "VITE_APP_BUILD_ID",
        "scripts/build_frontend.sh",
        "scripts/publish_frontend_s3.sh",
        "npm run build",
        "frontend/dist",
        "S3",
        "CloudFront",
        "Cache-Control",
        "CORS_ALLOW_ORIGINS",
        "cloud-aws-ecs-topology.md",
    )
    for needle in required:
        assert needle in text, f"missing {needle!r} in cloud-frontend-static.md"


@pytest.mark.unit
def test_build_frontend_script_runs_vite_production_build() -> None:
    assert BUILD_SCRIPT.is_file(), "scripts/build_frontend.sh is missing"
    text = BUILD_SCRIPT.read_text(encoding="utf-8")
    assert "npm run build" in text
    assert "VITE_API_BASE_URL" in text


@pytest.mark.unit
def test_publish_frontend_script_syncs_dist_to_s3() -> None:
    assert PUBLISH_SCRIPT.is_file(), "scripts/publish_frontend_s3.sh is missing"
    text = PUBLISH_SCRIPT.read_text(encoding="utf-8")
    assert "publish_frontend_dist_to_s3" in text
    assert "frontend/dist" in text


@pytest.mark.unit
def test_publish_frontend_script_applies_tiered_cache_control() -> None:
    text = PUBLISH_SCRIPT.read_text(encoding="utf-8")
    cache_lib = PROJECT_ROOT / "scripts" / "lib" / "frontend_static_cache.sh"
    assert cache_lib.is_file(), "scripts/lib/frontend_static_cache.sh is missing"
    assert "frontend_static_cache.sh" in text
    cache_text = cache_lib.read_text(encoding="utf-8")
    assert "no-cache" in cache_text
    assert "immutable" in cache_text
    assert "index.html" in cache_text
    assert "assets/" in cache_text


@pytest.mark.unit
def test_build_frontend_script_exports_build_id() -> None:
    text = BUILD_SCRIPT.read_text(encoding="utf-8")
    assert "VITE_APP_BUILD_ID" in text


@pytest.mark.unit
def test_api_module_exports_api_url_helper() -> None:
    assert API_MODULE.is_file(), "frontend/src/lib/api/client.ts is missing"
    text = API_MODULE.read_text(encoding="utf-8")
    assert "VITE_API_BASE_URL" in text
    assert "export function apiUrl" in text


@pytest.mark.unit
def test_production_env_example_documents_api_base_url() -> None:
    assert ENV_PRODUCTION_EXAMPLE.is_file(), "frontend/.env.production.example is missing"
    text = ENV_PRODUCTION_EXAMPLE.read_text(encoding="utf-8")
    assert "VITE_API_BASE_URL" in text


@pytest.mark.unit
def test_topology_and_readme_link_cloud_frontend_static_doc() -> None:
    topology = TOPOLOGY_DOC.read_text(encoding="utf-8")
    assert "cloud-frontend-static.md" in topology
    readme = README.read_text(encoding="utf-8")
    assert "docs/development/cloud-frontend-static.md" in readme
