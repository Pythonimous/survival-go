"""Tests for scripts/sync_onnx_artifacts.sh."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SYNC_SCRIPT = PROJECT_ROOT / "scripts" / "sync_onnx_artifacts.sh"


def _write_manifest(path: Path, *, base_url: str, sha256: str) -> None:
    manifest = {
        "model": "kaya-go/kaya",
        "version": "v0.2.2",
        "artifact_prefix": "kata1-test",
        "source": {
            "provider": "huggingface",
            "repo_api_url": "https://example.invalid/api",
            "repo_resolve_base_url": base_url,
        },
        "artifacts": [
            {
                "variant": "fp16",
                "filename": "kata1-test.fp16.onnx",
                "relative_path": "kata1-test/kata1-test.fp16.onnx",
                "size_bytes": 3,
                "sha256": sha256,
            }
        ],
    }
    path.write_text(json.dumps(manifest), encoding="utf-8")


def _make_fake_aws(bin_dir: Path, log_path: Path) -> None:
    aws = bin_dir / "aws"
    aws.write_text(
        "#!/usr/bin/env bash\n"
        "set -euo pipefail\n"
        f'echo \"$*\" >> "{log_path}"\n',
        encoding="utf-8",
    )
    aws.chmod(0o755)


@pytest.mark.unit
def test_sync_script_downloads_verifies_and_uploads(tmp_path: Path) -> None:
    source_dir = tmp_path / "source"
    source_dir.mkdir()
    artifact = source_dir / "kata1-test.fp16.onnx"
    artifact.write_bytes(b"abc")
    expected_hash = hashlib.sha256(b"abc").hexdigest()

    manifest = tmp_path / "manifest.json"
    _write_manifest(manifest, base_url=source_dir.as_uri(), sha256=expected_hash)

    aws_log = tmp_path / "aws.log"
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    _make_fake_aws(fake_bin, aws_log)

    env = os.environ.copy()
    env["PATH"] = f"{fake_bin}:{env['PATH']}"
    env["ONNX_ARTIFACT_BUCKET"] = "survival-go-models"
    env["ONNX_ARTIFACT_PREFIX"] = "kaya/v0.2.2"
    env["ONNX_ARTIFACT_MANIFEST"] = str(manifest)

    first = subprocess.run(
        ["bash", str(SYNC_SCRIPT)],
        cwd=PROJECT_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert first.returncode == 0, first.stderr
    first_log = aws_log.read_text(encoding="utf-8")
    assert "s3 cp" in first_log
    assert "s3://survival-go-models/kaya/v0.2.2/kata1-test.fp16.onnx" in first_log

    second = subprocess.run(
        ["bash", str(SYNC_SCRIPT)],
        cwd=PROJECT_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert second.returncode == 0, second.stderr
    lines = aws_log.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 2


@pytest.mark.unit
def test_sync_script_fails_on_hash_mismatch(tmp_path: Path) -> None:
    source_dir = tmp_path / "source"
    source_dir.mkdir()
    (source_dir / "kata1-test.fp16.onnx").write_bytes(b"abc")

    manifest = tmp_path / "manifest.json"
    _write_manifest(manifest, base_url=source_dir.as_uri(), sha256="0" * 64)

    aws_log = tmp_path / "aws.log"
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    _make_fake_aws(fake_bin, aws_log)

    env = os.environ.copy()
    env["PATH"] = f"{fake_bin}:{env['PATH']}"
    env["ONNX_ARTIFACT_BUCKET"] = "survival-go-models"
    env["ONNX_ARTIFACT_PREFIX"] = "kaya/v0.2.2"
    env["ONNX_ARTIFACT_MANIFEST"] = str(manifest)

    result = subprocess.run(
        ["bash", str(SYNC_SCRIPT)],
        cwd=PROJECT_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode != 0
    assert "SHA-256 mismatch" in result.stderr
    assert not aws_log.exists()


@pytest.mark.unit
def test_sync_script_supports_local_destination_without_aws(tmp_path: Path) -> None:
    source_dir = tmp_path / "source"
    source_dir.mkdir()
    artifact = source_dir / "kata1-test.fp16.onnx"
    artifact.write_bytes(b"abc")
    expected_hash = hashlib.sha256(b"abc").hexdigest()

    manifest = tmp_path / "manifest.json"
    _write_manifest(manifest, base_url=source_dir.as_uri(), sha256=expected_hash)

    local_dir = tmp_path / "local-models"

    env = os.environ.copy()
    env["ONNX_ARTIFACT_LOCAL_DIR"] = str(local_dir)
    env["ONNX_ARTIFACT_PREFIX"] = "kaya/v0.2.2"
    env["ONNX_ARTIFACT_MANIFEST"] = str(manifest)
    env.pop("ONNX_ARTIFACT_BUCKET", None)

    result = subprocess.run(
        ["bash", str(SYNC_SCRIPT)],
        cwd=PROJECT_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    local_artifact = local_dir / "kaya" / "v0.2.2" / "kata1-test.fp16.onnx"
    assert local_artifact.is_file()
    assert local_artifact.read_bytes() == b"abc"
