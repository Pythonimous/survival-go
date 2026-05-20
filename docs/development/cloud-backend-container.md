# Cloud backend container image (ECS / ECR)

The deployable backend image packages **FastAPI only** (game state, rules, Survival semantics). **Browser ONNX** inference runs in the browser via ONNX Runtime; the image does not include KataGo.

Topology context: [cloud-aws-ecs-topology.md](cloud-aws-ecs-topology.md).

## Image source

| Item | Value |
|------|--------|
| Dockerfile | [`docker/backend/Dockerfile`](../../docker/backend/Dockerfile) |
| Build context | Repository root (`.`) |
| Build helper | [`scripts/build_backend_image.sh`](../../scripts/build_backend_image.sh) |

## Environment (ECS task)

| Variable | Recommended | Notes |
|----------|-------------|-------|
| `SURVIVAL_THRESHOLD` | `0.95` | Win/resign semantics |
| `DEFAULT_TOP_N` | `8` | Default engine shortlist when games omit custom difficulty |
| `CORS_ALLOW_ORIGINS` | Your CloudFront / site origin | Required for browser API calls |

Full reference: [environment.md](environment.md). Deploy ONNX weights with the **frontend** static bundle: [cloud-frontend-static.md](cloud-frontend-static.md).

## Build locally

```bash
./scripts/build_backend_image.sh
```

## Push to ECR

1. Create an ECR repository (e.g. `survival-go-backend`).
2. Authenticate Docker to ECR.
3. Build, tag, and push (see script header in `build_backend_image.sh`).

## ECS task definition (env snippet)

```json
[
  { "name": "SURVIVAL_THRESHOLD", "value": "0.95" },
  { "name": "DEFAULT_TOP_N", "value": "8" },
  { "name": "CORS_ALLOW_ORIGINS", "value": "https://your-domain.example" }
]
```

## HEALTHCHECK

The Dockerfile probes `GET /health` on port 8000. Use the same path in load balancer health checks.

## See also

- [cloud-env-and-sizing.md](cloud-env-and-sizing.md) — CPU/RAM starting points
- [browser-inference-design.md](browser-inference-design.md) — inference architecture
