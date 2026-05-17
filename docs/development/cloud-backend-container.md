# Cloud backend container image (ECS / ECR)

The deployable backend image packages **FastAPI + KataGo** in one container. It is the same artifact used by [Docker Compose](docker-compose.md) locally and pushed to **ECR** for **ECS** in cloud deploys.

Topology context: [cloud-aws-ecs-topology.md](cloud-aws-ecs-topology.md).

## Image source

| Item | Value |
|------|--------|
| Dockerfile | [`docker/backend/Dockerfile`](../../docker/backend/Dockerfile) |
| Build context | Repository root (`.`) |
| Build helper | [`scripts/build_backend_image.sh`](../../scripts/build_backend_image.sh) |
| KataGo install | `scripts/setup_katago.sh` at **image build** time (`KATAGO_INSTALL_DIR=/opt/katago`) |

## KataGo wiring (fixed in-image paths)

Do not mount host KataGo paths in cloud deploy. Set ECS task environment variables to these **absolute** paths (already baked into the Dockerfile `ENV` defaults):

| Variable | In-container path | Notes |
|----------|-------------------|--------|
| `KATAGO_BINARY_PATH` | `/opt/katago/katago` | Downloaded at build from KataGo release zip (`setup_katago.sh`). |
| `KATAGO_CONFIG_PATH` | `/app/third_party/katago/analysis.docker.cfg` | Container-tuned analysis config ([katago-docker.md](katago-docker.md)). |
| `KATAGO_MODEL_PATH` | `/opt/katago/kata1-b20c256x2-s4384473088-d968438914.bin.gz` | Same net as local/Docker Compose; downloaded at build. |

Optional tuning (non-secret; safe as ECS env vars):

| Variable | Recommended (cloud MVP) | Notes |
|----------|-------------------------|--------|
| `KATAGO_ANALYSIS_TIMEOUT_SECONDS` | `45`–`60` | Raise under queue load before scaling CPU ([environment.md](environment.md)). |
| `KATAGO_TOP_N` | `8` | Engine-move candidate count. |
| `SURVIVAL_THRESHOLD` | `0.95` | Win/resign semantics. |

Full reference: [environment.md](environment.md). Cloud sizing and timeout tables: [cloud-env-and-sizing.md](cloud-env-and-sizing.md).

## Build locally

From the repo root:

```bash
./scripts/build_backend_image.sh
```

Defaults: image name `survival-go-backend`, tag `latest`. Override:

```bash
IMAGE_NAME=my-registry/survival-go-backend IMAGE_TAG=v0.1.0 ./scripts/build_backend_image.sh
```

First build downloads KataGo + model (~minutes, network required).

## Push to ECR

1. Create an ECR repository (e.g. `survival-go-backend`).
2. Authenticate Docker to ECR (`aws ecr get-login-password` …).
3. Build and tag:

```bash
export AWS_ACCOUNT_ID=123456789012
export AWS_REGION=us-east-1
export ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/survival-go-backend"
export IMAGE_TAG=v0.1.0

./scripts/build_backend_image.sh
docker tag survival-go-backend:${IMAGE_TAG} "${ECR_REGISTRY}:${IMAGE_TAG}"
docker push "${ECR_REGISTRY}:${IMAGE_TAG}"
```

Or set `ECR_REGISTRY` when running the build script to auto-tag after build (see script header).

## ECS task definition (env snippet)

Use the image URI from ECR. Example container `environment` block:

```json
[
  { "name": "KATAGO_BINARY_PATH", "value": "/opt/katago/katago" },
  { "name": "KATAGO_CONFIG_PATH", "value": "/app/third_party/katago/analysis.docker.cfg" },
  { "name": "KATAGO_MODEL_PATH", "value": "/opt/katago/kata1-b20c256x2-s4384473088-d968438914.bin.gz" },
  { "name": "KATAGO_ANALYSIS_TIMEOUT_SECONDS", "value": "45" },
  { "name": "KATAGO_TOP_N", "value": "8" },
  { "name": "SURVIVAL_THRESHOLD", "value": "0.95" }
]
```

Map container port **8000** to the ALB target group. Set `CORS_ALLOW_ORIGINS=https://app.<domain>` (comma-separated if needed). Frontend build: [cloud-frontend-static.md](cloud-frontend-static.md).

## Health check

The image defines a Docker **HEALTHCHECK** that calls `GET /health` on port 8000. ECS can use the same path on the container health check or rely on ALB HTTP checks to `/health`.

After deploy:

```bash
curl -fsS "https://api.<your-domain>/health"
curl -fsS "https://api.<your-domain>/api/presets"
```

## Operational notes

- **One KataGo subprocess per task** — matches [shared-katago-engine.md](shared-katago-engine.md); keep `desiredCount=1` until shared game state exists.
- **Games are in-memory** — task replacement drops sessions; plan maintenance accordingly.
- **Do not bake `.env` into the image** — `.dockerignore` excludes it; inject secrets via Secrets Manager and tuning via ECS env (see topology doc).
- **Rebuild the image** when upgrading KataGo version, model, or `analysis.docker.cfg` — paths inside the image stay the same; only image contents change.

## See also

- [cloud-aws-ecs-topology.md](cloud-aws-ecs-topology.md) — ALB, CloudFront, secrets
- [cloud-env-and-sizing.md](cloud-env-and-sizing.md) — ECS env, Fargate sizing, analysis timeouts
- [docker-compose.md](docker-compose.md) — same backend image with Compose + nginx frontend
- [katago-docker.md](katago-docker.md) — `analysis.docker.cfg` thread and timeout tuning
- [release-checklist.md](release-checklist.md) — tests before tagging an image
