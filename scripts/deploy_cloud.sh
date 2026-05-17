#!/usr/bin/env bash
# Orchestrate manual cloud deploy steps and run post-deploy smoke checks.
#
# Required for smoke: API_BASE_URL (e.g. https://api.example.com)
# Backend: IMAGE_NAME, IMAGE_TAG; optional ECR_REGISTRY triggers docker push
# Frontend: VITE_API_BASE_URL (defaults to API_BASE_URL), S3_BUCKET for publish
#
# Skip phases: SKIP_BACKEND=1, SKIP_FRONTEND=1, SKIP_SMOKE=1
# Analyze smoke: SMOKE_WITH_ANALYZE=1 (slow; needs live KataGo in the task)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

API_BASE_URL="${API_BASE_URL:-}"
SMOKE_WITH_ANALYZE="${SMOKE_WITH_ANALYZE:-0}"
SMOKE_TIMEOUT_SECONDS="${SMOKE_TIMEOUT_SECONDS:-30}"

if [[ "${SKIP_BACKEND:-}" != "1" ]]; then
    echo "==> Building backend image"
    ./scripts/build_backend_image.sh
    if [[ -n "${ECR_REGISTRY:-}" ]]; then
        remote_ref="${ECR_REGISTRY}:${IMAGE_TAG:-latest}"
        echo "==> Pushing ${remote_ref}"
        docker push "${remote_ref}"
        echo "Update ECS task/service to ${remote_ref}, then re-run with SKIP_BACKEND=1"
    fi
fi

if [[ "${SKIP_FRONTEND:-}" != "1" ]]; then
    export VITE_API_BASE_URL="${VITE_API_BASE_URL:-${API_BASE_URL}}"
    if [[ -z "${VITE_API_BASE_URL}" ]]; then
        echo "VITE_API_BASE_URL or API_BASE_URL is required for frontend build" >&2
        exit 1
    fi
    echo "==> Building frontend (VITE_API_BASE_URL=${VITE_API_BASE_URL})"
    ./scripts/build_frontend.sh
    if [[ -n "${S3_BUCKET:-}" ]]; then
        echo "==> Publishing frontend to S3"
        ./scripts/publish_frontend_s3.sh
    else
        echo "S3_BUCKET unset; skipping publish_frontend_s3.sh (dist is in frontend/dist)"
    fi
fi

if [[ "${SKIP_SMOKE:-}" != "1" ]]; then
    if [[ -z "${API_BASE_URL}" ]]; then
        echo "API_BASE_URL is required for smoke checks" >&2
        exit 1
    fi
    smoke_args=(--api-base-url "${API_BASE_URL}" --timeout "${SMOKE_TIMEOUT_SECONDS}")
    if [[ "${SMOKE_WITH_ANALYZE}" == "1" ]]; then
        smoke_args+=(--with-analyze)
    fi
    echo "==> Running post-deploy smoke"
    python3 "${ROOT}/scripts/smoke_deploy.py" "${smoke_args[@]}"
fi

echo "Deploy automation finished."
