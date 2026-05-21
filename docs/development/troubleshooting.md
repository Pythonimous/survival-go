# Troubleshooting (local setup)

Use this guide when the app does not start, presets never load, the ONNX model fails to download, or moves stall after local inference. It targets **local development** and the default Vite + FastAPI layout. Operators deploying to AWS should also see [browser-inference-rollout-runbook.md](../operations/browser-inference-rollout-runbook.md) and [cloud-frontend-static.md](cloud-frontend-static.md).

## Quick checks (2 minutes)

| Check | Command / action | Healthy result |
|-------|------------------|----------------|
| Backend up | `curl -s http://127.0.0.1:8000/health` | `"status":"ok"` and `"ready":true` |
| Presets API | `curl -s http://127.0.0.1:8000/api/presets` | JSON array with at least one preset |
| Frontend proxy | Open http://127.0.0.1:5173/ — DevTools → Network → `GET /api/presets` | Status 200 (Vite proxies `/api` to port 8000) |
| ONNX runtime | Setup screen banner | No red “incompatible browser” alert; model download reaches “ready” after you pick a variant |

If `/health` shows `"ready":false`, inspect the `checks` object (see [Preset bundle fails to load](#preset-bundle-fails-to-load)).

---

## Backend API not reachable

### Symptoms

- UI: **“Could not load presets. Please try again.”**
- UI after a move: network-style errors mentioning the API, or engine move never completes the server round-trip.
- Browser console: `Failed to fetch`, `net::ERR_CONNECTION_REFUSED`, or `could not reach the API`.

### Fixes

1. **Start the backend** from the repo root:
   ```bash
   source .venv/bin/activate
   ./scripts/run_backend.sh
   ```
2. **Confirm health**:
   ```bash
   curl -s http://127.0.0.1:8000/health | python3 -m json.tool
   ```
3. **Local Vite dev:** leave `VITE_API_BASE_URL` **unset** so requests use relative paths (`/api/...`). Vite proxies `/api` and `/health` to `http://127.0.0.1:8000` (see `frontend/vite.config.ts`).
4. **Production or split-domain builds:** set `VITE_API_BASE_URL` at **build time** to the public API origin (no trailing slash). Rebuild the frontend after changing it. See `frontend/.env.production.example` and [cloud-frontend-static.md](cloud-frontend-static.md).
5. **Docker Compose:** use http://127.0.0.1:8080/ (nginx serves the SPA and proxies `/api` to the backend container). Do not point the browser at port 8000 unless you also configure CORS for that origin.

### Verify in DevTools

- Request URL should be `http://127.0.0.1:5173/api/presets` (dev) or `https://api.<domain>/api/presets` (split deploy), not a wrong host/port.
- If the request never leaves the browser, the backend is down or the base URL is wrong.

---

## API rate limits (429 / 503)

### Symptoms

- `POST /api/games` or move/analyze calls return **429** with `"code":"rate_limited"`.
- Many new games from one client return **503** with `"code":"too_many_games"`.
- Oversized POST bodies return **413** with `"code":"payload_too_large"`.

### Context

Public deploys apply **conservative** per-IP limits so scripted floods cannot exhaust a small VM. Normal play stays well under defaults. Docker/VM nginx enforces edge limits; the FastAPI app mirrors them as a safety net.

### Fixes

1. **Legitimate heavy use:** raise limits in backend env (see [environment.md](environment.md)): `API_CREATE_RATE_PER_MINUTE`, `API_WRITE_RATE_PER_MINUTE`, `MAX_ACTIVE_GAMES_PER_IP`, `MAX_ACTIVE_GAMES_GLOBAL`.
2. **Docker/VM:** nginx limits live in [`docker/frontend/nginx.conf`](../../docker/frontend/nginx.conf); rebuild the frontend image after changing zones.
3. **Behind a reverse proxy:** ensure `X-Forwarded-For` carries the real client IP so per-IP caps apply to users, not the proxy alone.
4. **Stuck games:** `DELETE /api/games/{game_id}` frees a per-IP slot; rebooting the VM clears all in-memory games.

---

## CORS errors

### Symptoms

- Browser console: `Access to fetch at 'http://127.0.0.1:8000/...' from origin 'http://127.0.0.1:5173' has been blocked by CORS policy`.
- `GET /api/presets` fails in the network tab with no response body (browser blocks before your code sees JSON).

### When it happens

- You set **`VITE_API_BASE_URL=http://127.0.0.1:8000`** while opening the UI on **port 5173** (or another origin). That is a cross-origin request; the API must allow your frontend origin.
- Cloud/static hosting: SPA on `https://app.example.com` calling `https://api.example.com` without updating backend CORS.

### Fixes

1. **Preferred for local dev:** unset `VITE_API_BASE_URL` and use the Vite proxy (same origin from the browser’s perspective).
2. **If you must call the API directly**, add your frontend origin to backend `CORS_ALLOW_ORIGINS` (comma-separated, no spaces required):
   ```bash
   CORS_ALLOW_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
   ```
   Defaults already include Vite `5173` and Docker nginx `8080` ([environment.md](environment.md)).
3. **Restart the backend** after changing `.env`.
4. **Confirm CORS headers** (replace origins as needed):
   ```bash
   curl -sI -H "Origin: http://127.0.0.1:5173" http://127.0.0.1:8000/health | grep -i access-control
   ```
   Expect `access-control-allow-origin` echoing your origin.

ONNX weight fetches use a **separate** origin (Hugging Face or your CDN). HF reflects the request `Origin` for model files; a self-hosted CDN must send its own `Access-Control-Allow-Origin` — see [ONNX model fetch fails](#onnx-model-fetch-fails).

---

## Preset bundle fails to load

### Symptoms

- `curl http://127.0.0.1:8000/health` returns `"ready": false` and `checks.preset_bundle.status` is `"error"`.
- `GET /api/presets` returns HTTP 500 or an error payload.
- UI: **“Could not load presets”** even when the backend process is running.

### Common causes

| Cause | What you see | Fix |
|-------|----------------|-----|
| Missing preset directory | `no preset SGF files found in ...` | Ensure `backend/app/presets/sgf/` contains the shipped `.sgf` files (clone intact; do not delete). |
| Invalid SGF | `invalid SGF: <name>` | Restore the file from git; presets must be setup-only 19×19 boards with `PL` set. |
| Wrong file extension | `preset file must be .sgf` | Rename or remove non-SGF files in the preset directory. |
| Custom deploy path | Readiness error with a custom path | If you override `presets_dir` at app factory time, point it at a directory that exists and contains valid SGFs. |

### Verify

```bash
curl -s http://127.0.0.1:8000/health | python3 -m json.tool
curl -s http://127.0.0.1:8000/api/presets | python3 -m json.tool
```

Preset loading runs at startup via [readiness checks](../../backend/app/readiness.py); a broken bundle makes the service **unhealthy** even though the process listens on port 8000.

---

## ONNX model fetch fails

### Symptoms

- Setup banner: **“Model load failed: …”** or download progress stuck.
- Browser console: failed `GET` to `huggingface.co`, your CDN, or `/models/...`.
- CORS error on the **model** URL (not `/api`).
- `window.__SURVIVAL_GO_ROLLOUT_METRICS__?.getSnapshot().model.loadErrors` increases ([rollout runbook](../operations/browser-inference-rollout-runbook.md)).

### Default behavior

By default the app downloads weights from the public [kaya-go/kaya](https://huggingface.co/kaya-go/kaya) Hugging Face repo (CORS-enabled, long cache). No files are required in `frontend/public/models/` for that path. See [onnx-model-artifacts.md](onnx-model-artifacts.md).

### Fixes

| Issue | Fix |
|-------|-----|
| Offline / corporate block on HF | Self-host: copy verified artifacts with `scripts/sync_onnx_artifacts.sh`, set `VITE_ONNX_MODEL_BASE_URL=/models` and matching `VITE_ONNX_MODEL_FILENAME_PREFIX` at build time. |
| HF rate limit (`x-hf-warning`) | Retry later; set `HF_TOKEN` for authenticated HF access in production; or mirror to your CDN ([cloud-onnx-s3-cloudfront.md](cloud-onnx-s3-cloudfront.md)). |
| Wrong URL / 404 | Check DevTools request URL matches `${VITE_ONNX_MODEL_BASE_URL}/${prefix}.<variant>.onnx`. Rebuild after env changes. |
| CDN without CORS | Ensure `Access-Control-Allow-Origin` on `.onnx` responses (and range support for large files). |
| Local files not served | Place files under `frontend/public/models/` and use `/models` as base URL; run `npm run copy-ort-wasm` for WASM binaries separately. |

### Hash verification

```bash
ONNX_ARTIFACT_LOCAL_DIR=frontend/public/models \
ONNX_ARTIFACT_PREFIX=kaya/v0.2.2 \
./scripts/sync_onnx_artifacts.sh
```

Uses `scripts/onnx_artifact_manifest.json` to verify SHA-256 after download.

---

## WebGPU / WASM runtime and variant fallback

### Symptoms

- Red alert: **incompatible browser** — **Start game** stays disabled.
- Notice that the app is using a **smaller / uint8** model (constrained-runtime fallback).
- Console: `wasm validation error: ... failed to match magic number`.
- Inference very slow on CPU-only machines (expected with larger variants).

### Capability and fallback (no server toggle)

The browser picks execution providers and may recommend **`uint8`** when `fp32` / `fp16` are not viable. This is intentional; there is no server-side inference fallback. Policy details: [onnx-model-artifacts.md](onnx-model-artifacts.md) and [browser-inference-design.md](browser-inference-design.md).

### Fixes

| Issue | Fix |
|-------|-----|
| WASM magic number / HTML instead of `.wasm` | Run `cd frontend && npm install` (runs `copy-ort-wasm`). Confirm `optimizeDeps.exclude` includes `onnxruntime-web` in `vite.config.ts`. In dev, `/wasm/*` is proxied from `node_modules/onnxruntime-web/dist/`. |
| Threaded WASM / COI | Dev server sets COOP/COEP; `coi-serviceworker.js` is copied to `public/`. If embedding in an iframe, the parent may strip isolation — threaded workers may fall back to single-thread. |
| Force WASM-only (debug) | `VITE_ONNX_PREFER_WEBGPU=0` in `frontend/.env` or shell when starting Vite. |
| WASM threads / SIMD | `VITE_ONNX_NUM_THREADS`, `VITE_ONNX_WASM_SIMD=0`, `VITE_ONNX_WASM_PROXY=1` — see [local-run.md](local-run.md#runtime-safety-switches). |
| HMR stalls ONNX boot | Default: HMR off. Set `VITE_DEV_HMR=1` only when not debugging ONNX workers. |
| Corporate policy blocks WASM | Try another browser; WASM cannot be polyfilled — use a machine without the block. |

Pick a model variant on the setup screen; **Start game** requires the selected variant to reach **ready** (download + session init complete).

---

## API request timeouts (after local inference)

### Symptoms

- Move appears to hang after the board updates locally; error mentions **“server did not respond within Ns”**.
- Message notes that **local inference is not timed** — ONNX/MCTS already finished; the slow part is uploading raw tensors and waiting for Python semantics on `POST /api/games/{id}/analyze` or `.../engine-move`.

### Defaults and tuning

| Setting | Default | Notes |
|---------|---------|--------|
| `VITE_API_REQUEST_TIMEOUT_MS` | `90000` (90s) | Build-time env; see `frontend/src/lib/api/fetchWithTimeout.ts`. |
| Backend processing | No separate app timeout on analyze | Large payloads; slow disk or debug logging can extend response time. |

### Fixes

1. Confirm the backend is healthy (`/health`) and not wedged (restart `./scripts/run_backend.sh`).
2. Retry the move — transient load or first-request JIT is common.
3. If payloads are legitimately slow (remote API, debug), raise `VITE_API_REQUEST_TIMEOUT_MS` and **rebuild** the frontend.
4. Distinguish from [API not reachable](#backend-api-not-reachable): timeouts mean TCP worked but the response took too long; network errors mean the host/port/base URL is wrong.

---

## Symptom → doc map

| Symptom | Primary doc |
|---------|-------------|
| First-time install and run | [local-run.md](local-run.md) |
| Env vars (`CORS_ALLOW_ORIGINS`, thresholds) | [environment.md](environment.md) |
| ONNX variants, HF vs self-host | [onnx-model-artifacts.md](onnx-model-artifacts.md) |
| Production rollout / metrics | [browser-inference-rollout-runbook.md](../operations/browser-inference-rollout-runbook.md) |
| Release test failures | [release-checklist.md](release-checklist.md) |
| API payloads and error codes | [api-reference.md](../api-reference.md) |
| Play scenarios | [user flows](../user_flows/index.md) |
