# Environment variables (local and packaging)

The backend loads settings from the process environment and an optional **`.env`** file at the repo root (`backend/app/config.py`). Invalid values **fail fast** at startup.

Templates:

| File | Use |
|------|-----|
| [`.env.example`](../../.env.example) | Native local dev (copy to `.env` if you want overrides) |
| [`.env.docker.example`](../../.env.docker.example) | Reference values for Docker Compose experiments |

**Do not commit `.env`** — it is gitignored.

## Optional variables (production-safe defaults)

| Variable | Default | Valid range | Notes |
|----------|---------|-------------|-------|
| `SURVIVAL_THRESHOLD` | `0.95` | `(0, 1]` | Black “wins” when min black ownership ≥ threshold; used by evaluator and AI resign heuristics. |
| `DEFAULT_TOP_N` | `8` | `≥ 1` | Default engine-move shortlist size when a game is created without custom difficulty. |
| `CORS_ALLOW_ORIGINS` | local Vite + Docker Compose origins | comma-separated URLs | Required when the browser calls the API on another host ([cloud-frontend-static.md](cloud-frontend-static.md)). |

Inference runs in the **browser** via ONNX Runtime. The backend does not load KataGo binaries or models. See [browser-inference-design.md](browser-inference-design.md) and [onnx-model-artifacts.md](onnx-model-artifacts.md).

## Production-safe practices

1. **Never ship a developer `.env` into production images** — `.dockerignore` excludes `.env`.
2. **Do not lower `SURVIVAL_THRESHOLD`** without understanding gameplay impact.
3. **Deploy ONNX artifacts** with the static frontend (`frontend/public/models/`) — see [cloud-frontend-static.md](cloud-frontend-static.md).

## Verify

Native:

```bash
source .venv/bin/activate
curl http://127.0.0.1:8000/health
pytest tests/integration/test_api_lifecycle.py -m integration
```

Docker ([`docker-compose.yml`](../../docker-compose.yml)):

```bash
docker compose up --build
curl http://127.0.0.1:8080/health
```

## See also

- [local-run.md](local-run.md) — venv, dev servers, ONNX models
- [docker-compose.md](docker-compose.md) — optional container packaging
- [cloud-backend-container.md](cloud-backend-container.md) — ECS/ECR backend image
