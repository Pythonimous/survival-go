# Local run (first app version)

Use this guide to run the Survival Go web app on your machine and confirm the MVP works end to end: presets, human moves, browser ONNX engine moves, and Survival metrics in the UI.

## What you will validate

| Area | Pass criteria |
|------|----------------|
| Backend | `GET /health` returns `{"status":"ok",...}` |
| Frontend | Presets load; board renders; human click triggers engine response |
| ONNX | Model loads in browser (see [onnx-model-artifacts.md](onnx-model-artifacts.md)) |
| Gameplay | Complete at least one human/engine turn pair |
| Metrics | UI shows unresolved count and min black probability after engine move |

## Optional: Docker Compose

To run backend + frontend in containers, see **[docker-compose.md](docker-compose.md)**. Open http://127.0.0.1:8080/ after `docker compose up --build`.

## Prerequisites

- **Python 3.12** (matches CI; 3.11+ should work)
- **Node.js 18+** and **npm** (for the Vite frontend)
- **ONNX model artifacts** under `frontend/public/models/` (see [onnx-model-artifacts.md](onnx-model-artifacts.md))

## One-time setup

### 1. Python environment

From the repo root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Frontend dependencies and ONNX models

```bash
cd frontend && npm install && cd ..
```

**ONNX Runtime Web assets.** With **COOP/COEP** headers (see `frontend/vite.config.ts`), threaded WASM needs stable same-origin URLs. Kaya's `OnnxEngine` defaults `ort.env.wasm.wasmPaths` to `/wasm/`, so we serve the threaded artifacts at that URL in both modes. In **dev**, `vite-plugin-ort-wasm-dev.ts` proxies `/wasm/*` directly from `node_modules/onnxruntime-web/dist/` (dynamic `import()` of `public/wasm/*.mjs` is invalid in Vite dev). In **production**, `npm install` / `npm run copy-ort-wasm` fills `frontend/public/wasm/` and the built bundle serves the same `/wasm/` URLs as static assets. `onnxruntime-web` stays excluded from `optimizeDeps`. If you see **“wasm validation error: … failed to match magic number”**, confirm `optimizeDeps.exclude` includes `onnxruntime-web` and that `public/wasm/` contains the threaded artifacts after `npm run copy-ort-wasm`.

**`coi-serviceworker` bootstrap.** Kaya's web app loads [`coi-serviceworker`](https://github.com/gzuidhof/coi-serviceworker) from `apps/web/index.html`. We mirror that: `npm install` (or `npm run copy-coi-serviceworker`) copies `coi-serviceworker.js` into `frontend/public/`, and `frontend/index.html` loads it via `<script src="/coi-serviceworker.js"></script>`. The SW is a same-origin safety net: even when COOP/COEP are stripped (CDN, preview host, embedder), it re-injects them so `self.crossOriginIsolated` stays `true` and ONNX Runtime Web's threaded pthread workers can spawn. With our dev/nginx headers already correct it's a no-op; without it, multi-worker WASM silently falls back to single-thread.

**ONNX Runtime Web version pin.** `frontend/package.json` pins `onnxruntime-web` to **`1.24.3`** (no caret) — the version Kaya's `bun.lock` resolves at the upstream commit our engine port targets (see [`onnx-model-artifacts.md`](onnx-model-artifacts.md)). Newer minor releases (1.25+, 1.26+) ship changes to the threaded WASM bootstrap that we have not validated; do not bump this without re-running the multi-worker smoke test.

**Provenance note.** Survival Go is adopting Kaya's AGPL-3.0 `packages/ai-engine` browser ONNX stack under the project's AGPL-3.0-or-later license. Ported files should keep SPDX and upstream attribution headers that name the Kaya path and pinned commit.

### Runtime safety switches

Use these frontend env flags for fast mitigation when browser/runtime behavior differs across machines:

- `VITE_ONNX_PREFER_WEBGPU=0`: force WASM-only provider selection.
- `VITE_ONNX_NUM_THREADS=<n>`: set explicit WASM thread count (omit to use COI-based threading from Kaya defaults).
- `VITE_ONNX_WASM_SIMD=0`: disable SIMD in ORT WASM env.
- `VITE_ONNX_WASM_PROXY=1`: enable ORT proxy worker mode.
- `VITE_DEV_HMR=1`: re-enable Vite HMR (off by default to match Kaya's worker-safe dev config; HMR can stall ONNX pthread workers during boot).

Place `kaya.fp32.onnx` (and optionally `kaya.uint8.onnx`) in `frontend/public/models/` per [onnx-model-artifacts.md](onnx-model-artifacts.md).

Optional env overrides: copy [`.env.example`](../../.env.example) to `.env` — see [environment.md](environment.md).

### 3. Verify before starting servers

```bash
source .venv/bin/activate
./scripts/run_tests.sh fast
```

## Run the app

**Terminal A — backend:**

```bash
source .venv/bin/activate
./scripts/run_backend.sh
```

**Terminal B — frontend:**

```bash
./scripts/run_frontend.sh
```

Open http://127.0.0.1:5173/

## Quick health check

```bash
curl http://127.0.0.1:8000/health
```

## See also

- [browser-inference-design.md](browser-inference-design.md) — ONNX architecture
- [environment.md](environment.md) — backend env vars
- [docker-compose.md](docker-compose.md) — container packaging
