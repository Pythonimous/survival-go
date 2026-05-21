# Docker Compose (optional local packaging)

Run the full stack in containers without installing Python or Node on the host. Inference runs in the **browser** (ONNX); the backend container is API-only.

## What you get

| Service | Role |
|---------|------|
| `backend` | FastAPI (game state, Survival semantics) |
| `frontend` | Built React app + nginx; proxies `/api` and `/health` to the backend |

Open **http://127.0.0.1:8080/** after:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

## Prerequisites

- **Docker** and **Docker Compose** v2
- ONNX artifacts baked into the frontend image build (`frontend/public/models/`) — see [onnx-model-artifacts.md](onnx-model-artifacts.md)

## Quick start

```bash
./scripts/docker_compose.sh -f docker-compose.yml -f docker-compose.local.yml up --build
```

The helper sets `VITE_APP_BUILD_ID` from the current git short SHA (or `dev`) so the frontend image bakes cache-bust query params into `coi-serviceworker.js` and `/wasm/*`. You can export `VITE_APP_BUILD_ID` yourself or pass the same build-arg via plain `docker compose` if you prefer.

Verify (`GET /health` and presets via nginx):

```bash
curl http://127.0.0.1:8080/health
curl http://127.0.0.1:8080/api/presets
```

## Configuration

Optional backend overrides: [`.env.docker.example`](../../.env.docker.example). Full reference: [environment.md](environment.md).

| Variable | Default | Notes |
|----------|---------|-------|
| `SURVIVAL_THRESHOLD` | `0.95` | Survival scoring |
| `DEFAULT_TOP_N` | `8` | Default engine shortlist |

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| Presets fail in UI | `curl http://127.0.0.1:8080/health` and `/api/presets` |
| Engine never responds | Browser console; ONNX model load ([browser-inference-design.md](browser-inference-design.md)) |
| Port 8080 in use | Change host port in `docker-compose.local.yml` |

Games are in-memory; `docker compose down` clears sessions.

## Files

| Path | Purpose |
|------|---------|
| `docker-compose.yml` | Service definitions and healthcheck |
| `docker-compose.local.yml` | Publish UI on `127.0.0.1:8080` |
| `docker-compose.prod.yml` | Publish UI on `127.0.0.1:9080` for Caddy on a VM |
| `docker/backend/Dockerfile` | Python API only |
| `docker/frontend/Dockerfile` | Vite build + nginx |
| `docker/frontend/nginx.conf` | Static assets + API proxy |

## See also

- [local-run.md](local-run.md) — native dev run
- [cloud-aws-zero-to-domain-runbook.md](cloud-aws-zero-to-domain-runbook.md) — one-VM deploy
- [browser-inference-design.md](browser-inference-design.md) — ONNX architecture
