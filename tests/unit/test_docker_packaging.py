"""Docker Compose packaging contract checks."""

from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
COMPOSE_FILE = PROJECT_ROOT / "docker-compose.yml"
COMPOSE_LOCAL = PROJECT_ROOT / "docker-compose.local.yml"
COMPOSE_PROD = PROJECT_ROOT / "docker-compose.prod.yml"
BACKEND_DOCKERFILE = PROJECT_ROOT / "docker" / "backend" / "Dockerfile"
FRONTEND_DOCKERFILE = PROJECT_ROOT / "docker" / "frontend" / "Dockerfile"
NGINX_CONF = PROJECT_ROOT / "docker" / "frontend" / "nginx.conf"
DOCKERIGNORE = PROJECT_ROOT / ".dockerignore"
ENV_DOCKER_EXAMPLE = PROJECT_ROOT / ".env.docker.example"
DOCKER_DOC = PROJECT_ROOT / "docs" / "development" / "docker-compose.md"
LOCAL_RUN_DOC = PROJECT_ROOT / "docs" / "development" / "local-run.md"
README = PROJECT_ROOT / "README.md"


@pytest.mark.unit
def test_compose_file_defines_backend_and_frontend_services() -> None:
    assert COMPOSE_FILE.is_file(), "docker-compose.yml is missing"
    text = COMPOSE_FILE.read_text(encoding="utf-8")
    assert "services:" in text
    assert "backend:" in text
    assert "frontend:" in text
    assert "docker/backend/Dockerfile" in text
    assert "docker/frontend/Dockerfile" in text


@pytest.mark.unit
def test_compose_local_and_prod_use_distinct_host_ports() -> None:
    assert COMPOSE_LOCAL.is_file()
    assert COMPOSE_PROD.is_file()
    local = COMPOSE_LOCAL.read_text(encoding="utf-8")
    prod = COMPOSE_PROD.read_text(encoding="utf-8")
    assert "8080" in local
    assert "9080" in prod
    assert "127.0.0.1:9080:80" in prod
    base = COMPOSE_FILE.read_text(encoding="utf-8")
    assert '"8080:80"' not in base


@pytest.mark.unit
def test_backend_dockerfile_runs_uvicorn_without_katago_install() -> None:
    assert BACKEND_DOCKERFILE.is_file()
    text = BACKEND_DOCKERFILE.read_text(encoding="utf-8")
    required = (
        "uvicorn",
        "backend.app.main:app",
    )
    for needle in required:
        assert needle in text, f"missing {needle!r} in backend Dockerfile"
    assert "setup_katago" not in text
    assert "KATAGO_" not in text


@pytest.mark.unit
def test_frontend_nginx_proxies_api_and_health() -> None:
    assert FRONTEND_DOCKERFILE.is_file()
    assert NGINX_CONF.is_file()
    nginx = NGINX_CONF.read_text(encoding="utf-8")
    assert "proxy_pass" in nginx
    assert "/api/" in nginx
    assert "/health" in nginx
    frontend = FRONTEND_DOCKERFILE.read_text(encoding="utf-8")
    assert "nginx.conf" in frontend
    assert "npm run build" in frontend


@pytest.mark.unit
def test_frontend_nginx_serves_wasm_assets_without_spa_fallback() -> None:
    """ORT threaded preload fetches /wasm/*.mjs; SPA fallback would return HTML."""
    nginx = NGINX_CONF.read_text(encoding="utf-8")
    assert "location /wasm/" in nginx
    assert "try_files $uri =404" in nginx
    assert "application/wasm" in nginx
    assert "application/javascript" in nginx
    assert "mjs" in nginx


@pytest.mark.unit
def test_frontend_dockerfile_copies_scripts_before_npm_ci() -> None:
    """postinstall runs copy-runtime-assets; scripts must exist before npm ci."""
    text = FRONTEND_DOCKERFILE.read_text(encoding="utf-8")
    scripts_idx = text.find("COPY frontend/scripts/")
    npm_ci_idx = text.find("RUN npm ci")
    assert scripts_idx != -1, "must COPY frontend/scripts/ before npm ci"
    assert npm_ci_idx != -1
    assert scripts_idx < npm_ci_idx


@pytest.mark.unit
def test_dockerignore_excludes_local_venv_and_env() -> None:
    assert DOCKERIGNORE.is_file()
    text = DOCKERIGNORE.read_text(encoding="utf-8")
    for needle in (".venv", "node_modules", ".env"):
        assert needle in text, f"missing {needle!r} in .dockerignore"


@pytest.mark.unit
def test_env_docker_example_documents_survival_defaults() -> None:
    assert ENV_DOCKER_EXAMPLE.is_file()
    text = ENV_DOCKER_EXAMPLE.read_text(encoding="utf-8")
    for needle in ("SURVIVAL_THRESHOLD", "DEFAULT_TOP_N"):
        assert needle in text, f"missing {needle!r} in .env.docker.example"


@pytest.mark.unit
def test_docker_compose_doc_covers_build_and_health() -> None:
    assert DOCKER_DOC.is_file()
    text = DOCKER_DOC.read_text(encoding="utf-8")
    required = (
        "docker compose",
        "docker-compose.yml",
        ".env.docker.example",
        "environment.md",
        "GET /health",
        "browser-inference-design.md",
        "local-run.md",
    )
    for needle in required:
        assert needle in text, f"missing {needle!r} in docker-compose.md"


@pytest.mark.unit
def test_local_run_and_readme_link_optional_docker_packaging() -> None:
    local_run = LOCAL_RUN_DOC.read_text(encoding="utf-8")
    assert "docker-compose.md" in local_run
    readme = README.read_text(encoding="utf-8")
    assert "docs/development/docker-compose.md" in readme
