#!/usr/bin/env bash
# Upload frontend/dist to S3 and optionally invalidate CloudFront.
#
# Required: S3_BUCKET (target bucket name)
# Optional: AWS_REGION, CLOUDFRONT_DISTRIBUTION_ID, S3_PREFIX, DRY_RUN=1
#           CLOUDFRONT_INVALIDATE_ALL=1 to invalidate /* (legacy behavior)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${ROOT}/frontend/dist"
CACHE_LIB="${ROOT}/scripts/lib/frontend_static_cache.sh"

# shellcheck source=scripts/lib/frontend_static_cache.sh
source "${CACHE_LIB}"

if [[ -z "${S3_BUCKET:-}" ]]; then
    echo "S3_BUCKET is required (e.g. export S3_BUCKET=my-app-frontend)" >&2
    exit 1
fi

if [[ ! -d "${DIST_DIR}" ]]; then
    echo "Missing ${DIST_DIR}; run ./scripts/build_frontend.sh first" >&2
    exit 1
fi

REGION_ARGS=()
if [[ -n "${AWS_REGION:-}" ]]; then
    REGION_ARGS=(--region "${AWS_REGION}")
fi

DEST="s3://${S3_BUCKET}"
if [[ -n "${S3_PREFIX:-}" ]]; then
    DEST="${DEST%/}/${S3_PREFIX#/}"
fi

if [[ "${DRY_RUN:-}" == "1" ]]; then
    echo "[dry-run] Would publish ${DIST_DIR}/ to ${DEST}/ with tiered Cache-Control"
    echo "  HTML: ${CACHE_HTML}"
    echo "  assets/: ${CACHE_IMMUTABLE}"
    echo "  wasm/, coi-serviceworker.js, other: ${CACHE_RUNTIME}"
    exit 0
fi

publish_frontend_dist_to_s3 "${DIST_DIR}" "${DEST}" "${REGION_ARGS[@]}"

if [[ -n "${CLOUDFRONT_DISTRIBUTION_ID:-}" ]]; then
    INVALIDATION_PATHS=()
    if [[ "${CLOUDFRONT_INVALIDATE_ALL:-}" == "1" ]]; then
        INVALIDATION_PATHS=("/*")
    else
        while IFS= read -r path; do
            [[ -n "${path}" ]] && INVALIDATION_PATHS+=("${path}")
        done < <(default_cloudfront_invalidation_paths)
    fi
    echo "Invalidating CloudFront distribution ${CLOUDFRONT_DISTRIBUTION_ID}: ${INVALIDATION_PATHS[*]}"
    aws cloudfront create-invalidation \
        --distribution-id "${CLOUDFRONT_DISTRIBUTION_ID}" \
        --paths "${INVALIDATION_PATHS[@]}" \
        "${REGION_ARGS[@]}"
fi

echo "Publish complete: ${DEST}"
