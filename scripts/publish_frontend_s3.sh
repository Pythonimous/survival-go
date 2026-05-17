#!/usr/bin/env bash
# Upload frontend/dist to S3 and optionally invalidate CloudFront.
#
# Required: S3_BUCKET (target bucket name)
# Optional: AWS_REGION, CLOUDFRONT_DISTRIBUTION_ID, S3_PREFIX, DRY_RUN=1
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${ROOT}/frontend/dist"

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

SYNC_ARGS=("${REGION_ARGS[@]}" --delete)
if [[ "${DRY_RUN:-}" == "1" ]]; then
    SYNC_ARGS+=(--dryrun)
fi

echo "aws s3 sync ${DIST_DIR}/ ${DEST}/ ${SYNC_ARGS[*]}"
aws s3 sync "${DIST_DIR}/" "${DEST}/" "${SYNC_ARGS[@]}"

if [[ -n "${CLOUDFRONT_DISTRIBUTION_ID:-}" && "${DRY_RUN:-}" != "1" ]]; then
    echo "Invalidating CloudFront distribution ${CLOUDFRONT_DISTRIBUTION_ID}"
    aws cloudfront create-invalidation \
        --distribution-id "${CLOUDFRONT_DISTRIBUTION_ID}" \
        --paths "/*" \
        "${REGION_ARGS[@]}"
fi

echo "Publish complete: ${DEST}"
