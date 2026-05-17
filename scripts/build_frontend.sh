#!/usr/bin/env bash
# Build production frontend static assets (frontend/dist).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${ROOT}/frontend"

cd "${FRONTEND_DIR}"

if [[ ! -d node_modules ]]; then
    echo "Installing frontend dependencies..."
    npm ci
fi

if [[ -n "${VITE_API_BASE_URL:-}" ]]; then
    export VITE_API_BASE_URL
    echo "Building with VITE_API_BASE_URL=${VITE_API_BASE_URL}"
else
    echo "Building with same-origin API paths (VITE_API_BASE_URL unset)"
fi

npm run build
echo "Done: ${FRONTEND_DIR}/dist"
