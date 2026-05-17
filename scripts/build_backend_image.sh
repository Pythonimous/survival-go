#!/usr/bin/env bash
# Build the deployable backend image (FastAPI + KataGo) from docker/backend/Dockerfile.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCKERFILE="${ROOT}/docker/backend/Dockerfile"
IMAGE_NAME="${IMAGE_NAME:-survival-go-backend}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
LOCAL_REF="${IMAGE_NAME}:${IMAGE_TAG}"

echo "Building ${LOCAL_REF} from ${DOCKERFILE}"
docker build -f "${DOCKERFILE}" -t "${LOCAL_REF}" "${ROOT}"

if [[ -n "${ECR_REGISTRY:-}" ]]; then
    remote_ref="${ECR_REGISTRY}:${IMAGE_TAG}"
    docker tag "${LOCAL_REF}" "${remote_ref}"
    echo "Tagged ${remote_ref}"
    echo "Push with: docker push ${remote_ref}"
fi

echo "Done: ${LOCAL_REF}"
