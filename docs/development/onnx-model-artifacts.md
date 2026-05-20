# ONNX model artifacts (browser inference)

This document describes the **shipped ONNX weight variants**, how the frontend **selects** among them, and how that maps to operator metrics. Implementation lives in `frontend/src/lib/analysis/runtime/modelVariant.ts` and `frontend/src/lib/analysis/runtime/probe.ts`.

## Kaya engine source pin (for the 7.7 port)

The ONNX engine port in `frontend/src/lib/analysis/onnx/kaya/` is pinned to:

- Upstream repo: `kaya-go/kaya`
- Commit SHA: `8fafeac0fedde020c447d931c0b1afdf283edf2a`
- Upstream subtree: `packages/ai-engine/src/` (plus required supporting modules vendored for local compilation)

Use this SHA as the canonical source reference when syncing or auditing ported engine files.

## Variant reference

By default the frontend fetches all three artifacts **directly from the
[kaya-go/kaya](https://huggingface.co/kaya-go/kaya) Hugging Face repo**. HF
serves the public files with reflected CORS headers (`Access-Control-Allow-Origin`
echoes the requesting origin), supports `Range` requests, and returns
`Cache-Control: public, max-age=31536000`, so browser-direct download works
with no proxy or app-side hosting required.

| Variant | Default URL (Hugging Face) | Approx size | Role | Notes |
|--------|-----------------------------|-------------|------|--------|
| **fp32** | `https://huggingface.co/kaya-go/kaya/resolve/main/kata1-b28c512nbt-s12043015936-d5616446734/kata1-b28c512nbt-s12043015936-d5616446734.fp32.onnx` | ~293 MB | Highest fidelity. Recommended when WebGPU is available (GPU keeps inference latency tolerable). | Full-precision weights; full memory footprint. |
| **fp16** | `…/kata1-b28c512nbt-s12043015936-d5616446734.fp16.onnx` | ~147 MB | **Default for capable CPU-only runtimes.** Roughly half the download / memory of `fp32` with very similar quality on CPU. | Same input/output tensor names and layout as `fp32`. |
| **uint8** | `…/kata1-b28c512nbt-s12043015936-d5616446734.uint8.onnx` | ~75 MB | **Constrained-runtime fallback** and "lightweight" user choice. | Quantized for smallest download and lowest memory. Same I/O contract as the others. |

Sources for naming and semantics of the three Kaya export flavors: [kaya-go/kaya on Hugging Face](https://huggingface.co/kaya-go/kaya) (model card table: fp32 / fp16 / uint8).

## Output contract verification

The pinned Kaya `uint8` artifact was inspected with `onnxruntime-web` session
metadata on 2026-05-19. The deployed model exposes the output names required by
Kaya's ONNX engine path: `policy`, `value`, `miscvalue`, and `ownership`.

Observed `outputNames`:

```text
policy, value, miscvalue, moremiscvalue, ownership, scoring, futurepos, seki,
scorebelief, 2724, 2750, 2751, 2752, 2754, 2756, 2758, 2760, 2813
```

`frontend/src/lib/analysis/onnx/kaya/onnx-session.ts` validates those required
names when a session is created so a mismatched artifact fails before analysis.

## Pinned verification manifest

Canonical filenames and SHA-256 checksums for the production-pinned trio are checked into:

- `scripts/onnx_artifact_manifest.json`

This manifest is based on the Hugging Face model API (`?blobs=true`) for `kaya-go/kaya` and records:

- variant (`fp32`, `fp16`, `uint8`)
- canonical filename and upstream relative path
- `size_bytes`
- `sha256`

Use this manifest as the source of truth for artifact verification in sync/deploy tooling.

### Local verification workflow (no AWS required)

Use `scripts/sync_onnx_artifacts.sh` in local mirror mode to validate the
download + hash-check pipeline without S3 credentials:

```bash
ONNX_ARTIFACT_LOCAL_DIR=frontend/public/models \
ONNX_ARTIFACT_PREFIX=kaya/v0.2.2 \
./scripts/sync_onnx_artifacts.sh
```

This will:

- download pinned artifacts from the manifest upstream
- verify SHA-256 for each file
- copy verified files into `frontend/public/models/kaya/v0.2.2/`

If you also set `ONNX_ARTIFACT_BUCKET`, the same run mirrors locally and uploads
to S3. At least one destination (`ONNX_ARTIFACT_LOCAL_DIR` or
`ONNX_ARTIFACT_BUCKET`) is required.

### Overriding the artifact source

Two optional Vite build-time env vars in `modelVariant.ts` switch the source
without touching code. They're consumed by `resolveArtifactUrls()`.

| Env var | Default | Effect |
|---------|---------|--------|
| `VITE_ONNX_MODEL_BASE_URL` | `https://huggingface.co/kaya-go/kaya/resolve/main/kata1-b28c512nbt-s12043015936-d5616446734` | Directory URL containing the three files. Trailing `/` optional. |
| `VITE_ONNX_MODEL_FILENAME_PREFIX` | `kata1-b28c512nbt-s12043015936-d5616446734` | Filename stem before `.<variant>.onnx`. |

Resolved URL = `${VITE_ONNX_MODEL_BASE_URL}/${VITE_ONNX_MODEL_FILENAME_PREFIX}.<variant>.onnx`.

Examples:

- **Self-host under `frontend/public/models/` with the legacy `kaya.*.onnx` filenames:**
  ```
  VITE_ONNX_MODEL_BASE_URL=/models
  VITE_ONNX_MODEL_FILENAME_PREFIX=kaya
  ```
- **Mirror to a CDN with the upstream Kaya naming:**
  ```
  VITE_ONNX_MODEL_BASE_URL=https://cdn.example.com/kaya
  # (filename prefix can be omitted to keep the HF default)
  ```

## Default selection policy (implemented)

1. **GPU-capable runtimes:** recommend **`fp32`** at `/models/kaya.fp32.onnx` when `getActiveOnnxRuntimeCapability()` reports `supported` **and** `webGpuSupported`. Full precision is fast enough on a GPU.
2. **Viable CPU runtimes:** recommend **`fp16`** at `/models/kaya.fp16.onnx` when capability is `supported` but WebGPU is not available. Full precision on CPU is too slow to feel interactive; `fp16` is the balanced default.
3. **Constrained fallback:** recommend **`uint8`** at `/models/kaya.uint8.onnx` when the preferred path is not viable — selection reason `constrained_runtime_fallback` in instrumentation and rollout metrics.

The setup screen surfaces all three variants as explicit picker buttons (`AnalysisRuntimeModelPicker`). The user must pick a variant; that choice overrides the policy via `setUserSelectedOnnxModelVariant(...)` and tags the active selection reason as `user_selection`. The recommendation badge is driven by `getRecommendedOnnxModelArtifactSelection()` and continues to reflect the policy above.

## Deploying artifacts

- **Default deployment requires no model files in this repo**: the browser
  fetches them straight from `huggingface.co/kaya-go/kaya`. No CDN, no proxy.
  Set `HF_TOKEN` in production if you want to escape unauthenticated rate
  limits (per the `x-hf-warning` header HF returns).
- **Self-hosted variant**: place weight files under
  **`frontend/public/models/`** (Vite serves them as static `/models/...`),
  point `VITE_ONNX_MODEL_BASE_URL=/models` at build time, and use whichever
  filename prefix you adopt (`VITE_ONNX_MODEL_FILENAME_PREFIX`). See the
  rollout runbook for CDN/nginx checks.
- **ONNX Runtime Web** ships separate `ort-wasm-simd-threaded*.wasm` binaries
  for the browser WASM/WebGPU stack. `npm install` in `frontend/` copies them
  into **`frontend/public/wasm/`** (Kaya's default `wasmPaths`; see
  `frontend/public/wasm/README.md`). Do not remove that step for production
  builds.
- Files are **large binaries** and may be gitignored locally; obtain
  compatible exports from your approved model channel (project docs
  reference the Kaya ONNX release family on Hugging Face).

## Related documentation

- [Browser inference design](./browser-inference-design.md) — overall architecture.
- [Browser inference rollout runbook](../operations/browser-inference-rollout-runbook.md) — metrics (`onnx_model_selected`, fallback rate) and troubleshooting.
