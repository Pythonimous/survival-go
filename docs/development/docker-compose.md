# Docker Compose (optional local packaging)

Run the full stack in containers without installing Python, Node, or KataGo on the host. This is optional; for day-to-day development, use [local-run.md](local-run.md).

## What you get

| Service | Role |
|---------|------|
| `backend` | FastAPI + one shared KataGo subprocess (`analysis.docker.cfg`) |
| `frontend` | Built React app behind nginx; proxies `/api` and `/health` to the backend |

Open **http://127.0.0.1:8080/** after `docker compose up`.

## Prerequisites

- **Docker** and **Docker Compose** v2 (`docker compose` command)
- ~2 GB free disk for image layers (includes KataGo binary + model download at build time)
- Network access during **first build** (downloads KataGo release and neural net)

## Quick start

From the repo root:

```bash
docker compose up --build
```

First build can take several minutes (KataGo + model + `npm ci`).

Verify (`GET /health` via nginx proxy):

```bash
curl http://127.0.0.1:8080/health
curl http://127.0.0.1:8080/api/presets
```

Stop: `Ctrl+C`, then optionally `docker compose down`.

## Configuration

Default paths and timeouts are set in `docker-compose.yml` and baked into `docker/backend/Dockerfile`. Reference copy: [`.env.docker.example`](../../.env.docker.example). Full variable reference and production-safe defaults: [environment.md](environment.md).

| Variable | Container value |
|----------|-----------------|
| `KATAGO_BINARY_PATH` | `/opt/katago/katago` |
| `KATAGO_CONFIG_PATH` | `/app/third_party/katago/analysis.docker.cfg` |
| `KATAGO_MODEL_PATH` | `/opt/katago/kata1-b20c256x2-s4384473088-d968438914.bin.gz` |
| `KATAGO_ANALYSIS_TIMEOUT_SECONDS` | `45` (queued load; see [katago-docker.md](katago-docker.md)) |

To override, add an `environment:` block under `backend` in `docker-compose.yml` or use a compose env file.

Thread and timeout tuning for containers: [katago-docker.md](katago-docker.md). Shared-engine behavior (queueing, sessions): [shared-katago-engine.md](shared-katago-engine.md).

## Manual validation

Same checklist as [local-run.md](local-run.md) (presets, play a move, engine move, metrics), but use port **8080** instead of 5173.

## Rebuild after code changes

```bash
docker compose up --build
```

Rebuild only one service:

```bash
docker compose build backend
docker compose build frontend
```

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| Build fails downloading KataGo | Network; GitHub and katagotraining.org reachable |
| `backend` unhealthy / restarts | `docker compose logs backend`; KataGo paths inside image |
| Presets fail in UI | `curl http://127.0.0.1:8080/health` and `/api/presets` |
| Engine move timeout | Raise `KATAGO_ANALYSIS_TIMEOUT_SECONDS` in compose |
| Port 8080 in use | Change `frontend.ports` in `docker-compose.yml` (e.g. `"3000:80"`) |

Games are in-memory; `docker compose down` clears sessions. One KataGo process serves all games (see [shared-katago-engine.md](shared-katago-engine.md)).

## Files

| Path | Purpose |
|------|---------|
| `docker-compose.yml` | Service definitions and healthcheck |
| `docker/backend/Dockerfile` | Python app + `setup_katago.sh` at build |
| `docker/frontend/Dockerfile` | Vite build + nginx |
| `docker/frontend/nginx.conf` | Static assets + API proxy |
| `.dockerignore` | Keeps local `.venv`, `node_modules`, host KataGo artifacts out of context |

## See also

- [cloud-backend-container.md](cloud-backend-container.md) — same backend image for ECR/ECS deploy
- [environment.md](environment.md) — all env vars, defaults, and safe overrides
- [local-run.md](local-run.md) — native dev run (venv + npm)
- [katago-docker.md](katago-docker.md) — analysis config and timeouts
- [katago-wsl-linux.md](katago-wsl-linux.md) — host KataGo install (non-Docker)
