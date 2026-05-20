#!/usr/bin/env bash
# Sync pinned ONNX artifacts from upstream and publish to S3 and/or local dir.
#
# Required (at least one destination):
#   ONNX_ARTIFACT_BUCKET (target S3 bucket)
#   ONNX_ARTIFACT_LOCAL_DIR (target local directory)
#
# Optional:
#   ONNX_ARTIFACT_MANIFEST (default: scripts/onnx_artifact_manifest.json)
#   ONNX_ARTIFACT_PREFIX (default: kaya/<manifest.version>)
#   AWS_REGION
#   DRY_RUN=1
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST_PATH="${ONNX_ARTIFACT_MANIFEST:-${ROOT}/scripts/onnx_artifact_manifest.json}"
TARGET_BUCKET="${ONNX_ARTIFACT_BUCKET:-}"
LOCAL_DIR="${ONNX_ARTIFACT_LOCAL_DIR:-}"

if [[ -z "${TARGET_BUCKET}" && -z "${LOCAL_DIR}" ]]; then
    echo "Set ONNX_ARTIFACT_BUCKET and/or ONNX_ARTIFACT_LOCAL_DIR as a destination." >&2
    exit 1
fi

if [[ ! -f "${MANIFEST_PATH}" ]]; then
    echo "Manifest not found: ${MANIFEST_PATH}" >&2
    exit 1
fi

for tool in python3 curl sha256sum; do
    if ! command -v "${tool}" >/dev/null 2>&1; then
        echo "Missing required tool: ${tool}" >&2
        exit 1
    fi
done

if [[ -n "${TARGET_BUCKET}" ]] && ! command -v aws >/dev/null 2>&1; then
    echo "Missing required tool: aws" >&2
    exit 1
fi

manifest_version="$(python3 - "${MANIFEST_PATH}" <<'PY'
import json
import pathlib
import sys

manifest_path = pathlib.Path(sys.argv[1])
data = json.loads(manifest_path.read_text(encoding="utf-8"))
version = data.get("version")
if not isinstance(version, str) or not version:
    raise SystemExit("Manifest version is required")
print(version)
PY
)"

TARGET_PREFIX="${ONNX_ARTIFACT_PREFIX:-kaya/${manifest_version}}"
TARGET_PREFIX="${TARGET_PREFIX#/}"
TARGET_PREFIX="${TARGET_PREFIX%/}"

REGION_ARGS=()
if [[ -n "${AWS_REGION:-}" ]]; then
    REGION_ARGS=(--region "${AWS_REGION}")
fi

DRY_RUN_ARGS=()
if [[ "${DRY_RUN:-0}" == "1" ]]; then
    DRY_RUN_ARGS=(--dryrun)
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

echo "Syncing artifacts from manifest: ${MANIFEST_PATH}"
if [[ -n "${TARGET_BUCKET}" ]]; then
    echo "S3 destination: s3://${TARGET_BUCKET}/${TARGET_PREFIX}/"
fi
if [[ -n "${LOCAL_DIR}" ]]; then
    echo "Local destination: ${LOCAL_DIR%/}/${TARGET_PREFIX}/"
fi

while IFS=$'\t' read -r variant filename sha256 source_url; do
    target_file="${TMP_DIR}/${filename}"
    echo "Downloading ${variant}: ${source_url}"
    curl --fail --location --silent --show-error --retry 3 --retry-delay 2 \
        --output "${target_file}" \
        "${source_url}"

    actual_sha="$(sha256sum "${target_file}" | awk '{print $1}')"
    if [[ "${actual_sha}" != "${sha256}" ]]; then
        echo "SHA-256 mismatch for ${filename}" >&2
        echo "Expected: ${sha256}" >&2
        echo "Actual:   ${actual_sha}" >&2
        exit 1
    fi

    if [[ -n "${LOCAL_DIR}" ]]; then
        local_destination_dir="${LOCAL_DIR%/}/${TARGET_PREFIX}"
        mkdir -p "${local_destination_dir}"
        local_destination_path="${local_destination_dir}/${filename}"
        echo "Writing local mirror ${filename} -> ${local_destination_path}"
        cp "${target_file}" "${local_destination_path}"
    fi

    if [[ -n "${TARGET_BUCKET}" ]]; then
        s3_destination="s3://${TARGET_BUCKET}/${TARGET_PREFIX}/${filename}"
        echo "Uploading ${filename} -> ${s3_destination}"
        aws s3 cp "${target_file}" "${s3_destination}" "${REGION_ARGS[@]}" "${DRY_RUN_ARGS[@]}"
    fi
done < <(
    python3 - "${MANIFEST_PATH}" <<'PY'
import json
import pathlib
import sys

manifest_path = pathlib.Path(sys.argv[1])
data = json.loads(manifest_path.read_text(encoding="utf-8"))
source_base = data.get("source", {}).get("repo_resolve_base_url")
if not isinstance(source_base, str) or not source_base:
    raise SystemExit("Manifest source.repo_resolve_base_url is required")
source_base = source_base.rstrip("/")

artifacts = data.get("artifacts")
if not isinstance(artifacts, list) or not artifacts:
    raise SystemExit("Manifest artifacts list is required")

for entry in artifacts:
    variant = entry.get("variant")
    filename = entry.get("filename")
    sha256 = entry.get("sha256")
    if not all(isinstance(value, str) and value for value in (variant, filename, sha256)):
        raise SystemExit("Each artifact must define variant, filename, and sha256")
    source_url = f"{source_base}/{filename}"
    print(f"{variant}\t{filename}\t{sha256}\t{source_url}")
PY
)

echo "Artifact sync complete."
