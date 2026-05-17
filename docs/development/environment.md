# Environment variables (local and packaging)

The backend loads settings from the process environment and an optional **`.env`** file at the repo root (`backend/app/config.py`). Missing required paths or invalid values **fail fast** at startup so the API never runs with a broken KataGo wiring.

Templates:

| File | Use |
|------|-----|
| [`.env.example`](../../.env.example) | Native local dev (copy to `.env` after [KataGo setup](katago-wsl-linux.md)) |
| [`.env.docker.example`](../../.env.docker.example) | Reference values baked into [Docker Compose](../../docker-compose.yml) |

**Do not commit `.env`** — it is gitignored. Use the examples as documentation only.

## Required variables

| Variable | Description |
|----------|-------------|
| `KATAGO_BINARY_PATH` | Absolute path to the KataGo executable (`katago` in analysis mode). |
| `KATAGO_CONFIG_PATH` | Absolute path to an analysis config file (see [Config profiles](#config-profiles)). |
| `KATAGO_MODEL_PATH` | Absolute path to a compatible `.bin.gz` neural net. |

Paths must exist as regular files before the app starts.

## Optional variables (production-safe defaults)

| Variable | Default | Valid range | Notes |
|----------|---------|-------------|-------|
| `SURVIVAL_THRESHOLD` | `0.95` | `(0, 1]` | Black “wins” when min black ownership ≥ threshold; used by evaluator and AI resign heuristics. |
| `KATAGO_TOP_N` | `8` | `≥ 1` | How many KataGo candidates engine-move considers before Survival reranking. |
| `KATAGO_ANALYSIS_TIMEOUT_SECONDS` | `30` | `> 0` | Per HTTP analyze/engine-move deadline (includes queue wait; see [timeouts](#timeouts-under-load)). |
| `CORS_ALLOW_ORIGINS` | local Vite + Docker Compose origins | comma-separated URLs | Required when the browser calls the API on another host ([cloud-frontend-static.md](cloud-frontend-static.md)). |

Leave defaults unless you have a measured reason to change them.

## Config profiles

| Profile | `KATAGO_CONFIG_PATH` | Typical timeout | When |
|---------|----------------------|-----------------|------|
| **Local dev** | `third_party/katago/analysis.cfg` | `30` | WSL/Linux venv + `./scripts/run_backend.sh` |
| **Docker / packaging** | `third_party/katago/analysis.docker.cfg` | `45`–`60` | `docker compose up` (see [docker-compose.md](docker-compose.md)) |
| **Cloud deploy (ECS)** | `/app/third_party/katago/analysis.docker.cfg` | `45`–`60` | ECR image from [cloud-backend-container.md](cloud-backend-container.md); sizing/timeouts: [cloud-env-and-sizing.md](cloud-env-and-sizing.md) |

Thread and cache tuning live in the cfg files, not in env vars. Details: [katago-docker.md](katago-docker.md).

## Timeouts under load

One shared KataGo subprocess serves all games; analyze/engine-move calls are **serialized** ([shared-katago-engine.md](shared-katago-engine.md)). Wall-clock time per request is roughly:

```text
(queue wait) + (KataGo analysis time)
```

For Docker or a few concurrent testers, **raise `KATAGO_ANALYSIS_TIMEOUT_SECONDS` first** (e.g. `45` in `docker-compose.yml`) before increasing KataGo thread counts. Lowering the timeout below typical queue + analysis time causes spurious API errors while KataGo is healthy.

## Production-safe practices (local packaging)

1. **Never ship or mount a developer `.env` into production images** — `.dockerignore` excludes `.env`; Compose sets explicit `environment:` values for the backend service.
2. **Use absolute paths** for all `KATAGO_*` file paths (relative paths break when the process cwd differs).
3. **Keep `numAnalysisThreads = 1`** in analysis configs used with this app — extra analysis threads do not speed up the API because stdin/stdout is serialized.
4. **Prefer timeout tuning over thread inflation** for light multi-user Docker (see [katago-docker.md](katago-docker.md)).
5. **Do not lower `SURVIVAL_THRESHOLD`** without understanding gameplay impact; it changes win/resign semantics, not KataGo strength.
6. **Match model to binary** — use a net compatible with your KataGo build (same sources as [setup_katago.sh](../../scripts/setup_katago.sh)).

## Overriding Docker Compose env

Defaults are in [`docker-compose.yml`](../../docker-compose.yml) under `backend.environment`. To customize:

```yaml
services:
  backend:
    environment:
      KATAGO_ANALYSIS_TIMEOUT_SECONDS: "60"
```

Or add `env_file: .env.docker` (copy from `.env.docker.example`) — only for local packaging experiments, not for committing secrets.

## Verify

Native (with `.env` from `./scripts/setup_katago.sh`):

```bash
source .venv/bin/activate
curl http://127.0.0.1:8000/health
pytest tests/integration/test_katago_smoke.py -m integration
```

Docker:

```bash
docker compose up --build
curl http://127.0.0.1:8080/health
```

## See also

- [local-run.md](local-run.md) — venv, `.env`, and dev servers
- [docker-compose.md](docker-compose.md) — optional container packaging
- [katago-wsl-linux.md](katago-wsl-linux.md) — install binary, model, and `analysis.cfg`
- [katago-docker.md](katago-docker.md) — `analysis.docker.cfg` and queued-load tuning
