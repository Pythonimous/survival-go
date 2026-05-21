#!/usr/bin/env bash
# Run docker compose with VITE_APP_BUILD_ID set for frontend image cache busting.
#
# Example (production VM):
#   ./scripts/docker_compose.sh -f docker-compose.yml -f docker-compose.prod.yml up -d --build
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${VITE_APP_BUILD_ID:-}" ]]; then
    if command -v git >/dev/null 2>&1 && git -C "${ROOT}" rev-parse --short HEAD >/dev/null 2>&1; then
        export VITE_APP_BUILD_ID="$(git -C "${ROOT}" rev-parse --short HEAD)"
    else
        export VITE_APP_BUILD_ID="dev"
    fi
fi

echo "Using VITE_APP_BUILD_ID=${VITE_APP_BUILD_ID} for frontend image build"
exec docker compose "$@"
