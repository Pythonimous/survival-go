# Cloud environment variables, resource sizing, and KataGo timeouts

Canonical reference for **ECS / Fargate** deploys: which env vars to set, how large the task should be, and how to tune analyze/engine-move deadlines under queued load.

Related docs:

- Topology (ALB, CloudFront, secrets): [cloud-aws-ecs-topology.md](cloud-aws-ecs-topology.md)
- Backend image and in-container KataGo paths: [cloud-backend-container.md](cloud-backend-container.md)
- Frontend build-time API URL: [cloud-frontend-static.md](cloud-frontend-static.md)
- General env reference (local + Docker): [environment.md](environment.md)
- KataGo cfg thread/cache tuning: [katago-docker.md](katago-docker.md)

## Backend env vars (ECS task)

All backend settings are validated at startup ([`backend/app/config.py`](../../backend/app/config.py)). Missing files or invalid values fail fast.

### Required (fixed in-image paths)

Set these on the ECS container — do **not** mount host paths in cloud deploy:

| Variable | Cloud value | Notes |
|----------|-------------|--------|
| `KATAGO_BINARY_PATH` | `/opt/katago/katago` | Installed at image build via `setup_katago.sh`. |
| `KATAGO_CONFIG_PATH` | `/app/third_party/katago/analysis.docker.cfg` | Container profile; see [katago-docker.md](katago-docker.md). |
| `KATAGO_MODEL_PATH` | `/opt/katago/kata1-b20c256x2-s4384473088-d968438914.bin.gz` | Same net as local/Docker Compose. |

Full JSON snippet: [cloud-backend-container.md](cloud-backend-container.md).

### Optional tuning (ECS env, non-secret)

| Variable | Cloud MVP default | Valid range | When to change |
|----------|-------------------|-------------|----------------|
| `KATAGO_ANALYSIS_TIMEOUT_SECONDS` | `45`–`60` | `> 0` | **First knob** when users see timeouts under concurrent play (see [timeouts](#kataGo-analysis-timeouts) below). |
| `KATAGO_TOP_N` | `8` | `≥ 1` | Lower for faster engine-move; raise only if reranking needs more candidates. |
| `SURVIVAL_THRESHOLD` | `0.95` | `(0, 1]` | Changes win/resign semantics, not KataGo strength. |
| `CORS_ALLOW_ORIGINS` | `https://app.<your-domain>` | comma-separated URLs | Must include the CloudFront frontend origin ([cloud-frontend-static.md](cloud-frontend-static.md)). |

Do not put KataGo paths in Secrets Manager — they are not secret and must match the image layout.

### Secrets Manager (MVP)

No KataGo-related keys are required for the current app. Use Secrets Manager when you add API keys, DB credentials, or other sensitive values (see topology doc). Keep `SURVIVAL_THRESHOLD`, `KATAGO_TOP_N`, and `KATAGO_ANALYSIS_TIMEOUT_SECONDS` as plain ECS env vars unless policy requires otherwise.

## Frontend build-time variable

| Variable | Set when | Example |
|----------|----------|---------|
| `VITE_API_BASE_URL` | `npm run build` / `./scripts/build_frontend.sh` | `https://api.example.com` |

Not an ECS variable — baked into static assets. See [cloud-frontend-static.md](cloud-frontend-static.md).

## ECS / Fargate resource sizing

The backend task runs **FastAPI + one shared KataGo subprocess** with a loaded neural net. Games are in-memory; keep **`desiredCount=1`** until shared state exists.

### Recommended starting task (MVP, ~10–50 casual users)

| Resource | Starting value | Rationale |
|----------|----------------|-----------|
| CPU | `2 vCPU` (2048 CPU units) | KataGo search is CPU-bound; headroom for FastAPI + queue wait. |
| Memory | `4 GB` (4096 MiB) | Model + NN cache (`analysis.docker.cfg`) + Python; `8 GB` if OOM during engine-move. |
| Tasks | `1` | One KataGo process per task; multiple tasks fragment sessions. |

Fargate task size must use [supported CPU/memory pairs](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-cpu-memory-error.html) (e.g. 2 vCPU → 4–16 GB).

### When to scale up vs tune timeouts

| Symptom | Try first | Then |
|---------|-----------|------|
| HTTP 504 / timeout on analyze/engine-move under light concurrency | Raise `KATAGO_ANALYSIS_TIMEOUT_SECONDS` to `60`–`90` | Confirm queueing ([shared-katago-engine.md](shared-katago-engine.md)) |
| Timeouts persist with healthy KataGo logs | Bump CPU to `4 vCPU` | Revisit `numSearchThreadsPerAnalysisThread` in cfg (not `numAnalysisThreads`) |
| Container OOM / ECS task stopped | Increase memory to `8 GB` | Lower `nnCacheSizePowerOfTwo` in `analysis.docker.cfg` only if RAM-constrained |
| Sustained high CPU with acceptable latency | Stay on 2 vCPU until cost/latency tradeoff hurts | Consider ECS on EC2 for cost at steady load (topology doc) |

**Do not** raise `numAnalysisThreads` above `1` for this app — API traffic is serialized on stdin/stdout; extra analysis threads add RAM without shortening queued requests ([katago-docker.md](katago-docker.md)).

### ALB and container health checks

| Check | Path / setting | Notes |
|-------|----------------|-------|
| ALB target group | `GET /health` | HTTP 200; interval ≥ 30s for cold start after deploy. |
| ECS container health | Same as image `HEALTHCHECK` | Allow `startPeriod` ≥ 30s while KataGo boots. |
| Client / smoke | `GET /api/presets` | Confirms app + routing, not full KataGo analysis. |

Analysis workload timeouts are **application-level** (`KATAGO_ANALYSIS_TIMEOUT_SECONDS`), not ALB idle timeout — keep ALB idle timeout above your longest expected HTTP request (e.g. 120s if using 90s analysis timeout).

## KataGo analysis timeouts

Per HTTP **analyze** and **engine-move** call, the backend enforces `KATAGO_ANALYSIS_TIMEOUT_SECONDS`. This includes **queue wait** while another game holds the shared KataGo lock:

```text
wall-clock ≈ (time waiting in queue) + (KataGo analysis time)
```

### Suggested values by load (single task, `desiredCount=1`)

| Concurrent active games (rough) | `KATAGO_ANALYSIS_TIMEOUT_SECONDS` | Notes |
|---------------------------------|-----------------------------------|--------|
| 1–2 | `45` | Matches Docker Compose default. |
| 3–5 casual | `60` | Typical MVP peak with tab overlap. |
| 6–10 overlapping analyze/engine-move | `75`–`90` | Prefer timeout over extra vCPU first. |
| > 10 sustained | Not recommended on one task | Add UX “server busy” later; scale-out needs shared game state. |

### Tuning order (do not skip steps)

1. **Increase `KATAGO_ANALYSIS_TIMEOUT_SECONDS`** in the ECS task definition and redeploy.
2. Confirm `numAnalysisThreads = 1` in `analysis.docker.cfg` (shipped in image).
3. If each analysis is still slow when alone in queue, raise `numSearchThreadsPerAnalysisThread` (e.g. `4` → `6`) in a custom cfg copy and rebuild the image — see [katago-docker.md](katago-docker.md).
4. Increase task **CPU** before adding a second ECS task (second task does not share in-memory games or one KataGo queue).

### What timeouts do *not* fix

- Invalid model/binary mismatch — fails at startup or first query; fix the image build.
- Path errors — startup validation fails with clear path messages.
- User closing the browser — idle games remain until `DELETE` or task restart ([shared-katago-engine.md](shared-katago-engine.md)).

## `analysis.docker.cfg` vs env timeout

| Layer | Controls |
|-------|----------|
| `KATAGO_ANALYSIS_TIMEOUT_SECONDS` | Max wait for the **HTTP handler** (queue + KataGo). |
| `numSearchThreadsPerAnalysisThread` | How hard KataGo searches **once** it receives a query. |
| `numAnalysisThreads` | Must stay `1` for Survival Go’s serialized client. |
| `nnCacheSizePowerOfTwo` / `nnMaxBatchSize` | RAM vs speed inside the container. |

Shipped docker cfg defaults: `numAnalysisThreads = 1`, `numSearchThreadsPerAnalysisThread = 4`, `nnCacheSizePowerOfTwo = 18` ([`third_party/katago/analysis.docker.cfg`](../../third_party/katago/analysis.docker.cfg)).

## Example ECS environment block

```json
[
  { "name": "KATAGO_BINARY_PATH", "value": "/opt/katago/katago" },
  { "name": "KATAGO_CONFIG_PATH", "value": "/app/third_party/katago/analysis.docker.cfg" },
  { "name": "KATAGO_MODEL_PATH", "value": "/opt/katago/kata1-b20c256x2-s4384473088-d968438914.bin.gz" },
  { "name": "KATAGO_ANALYSIS_TIMEOUT_SECONDS", "value": "60" },
  { "name": "KATAGO_TOP_N", "value": "8" },
  { "name": "SURVIVAL_THRESHOLD", "value": "0.95" },
  { "name": "CORS_ALLOW_ORIGINS", "value": "https://app.example.com" }
]
```

## Verify after changing env or sizing

```bash
export API_BASE_URL="https://api.<your-domain>"
python3 scripts/smoke_deploy.py --api-base-url "$API_BASE_URL"
```

Optional analysis smoke (uses KataGo, may take tens of seconds):

```bash
SMOKE_TIMEOUT_SECONDS=90 python3 scripts/smoke_deploy.py --api-base-url "$API_BASE_URL" --with-analyze
```

See [cloud-deploy-automation.md](cloud-deploy-automation.md) for `deploy_cloud.sh` and skip flags.

Watch ECS task memory and CPU during two browser sessions both requesting engine-move; if only the second client times out, raise `KATAGO_ANALYSIS_TIMEOUT_SECONDS` before resizing the task.

## See also

- [cloud-aws-ecs-topology.md](cloud-aws-ecs-topology.md) — network, domain, manual deploy
- [cloud-backend-container.md](cloud-backend-container.md) — build, ECR push, HEALTHCHECK
- [shared-katago-engine.md](shared-katago-engine.md) — queueing and session lifecycle
- [release-checklist.md](release-checklist.md) — pre-deploy test gate
