# Cloud deploy automation and post-deploy smoke

Scripts to orchestrate a **manual** AWS deploy (build/publish) and verify the live API afterward. They complement the step-by-step guides in [cloud-aws-ecs-topology.md](cloud-aws-ecs-topology.md), [cloud-backend-container.md](cloud-backend-container.md), and [cloud-frontend-static.md](cloud-frontend-static.md).

## Quick smoke (API only)

After ECS is serving a new task and DNS points at the ALB:

```bash
export API_BASE_URL="https://api.<your-domain>"
python3 scripts/smoke_deploy.py --api-base-url "$API_BASE_URL"
```

Optional KataGo analysis smoke (slower; needs a healthy backend task with in-image KataGo):

```bash
export API_BASE_URL="https://api.<your-domain>"
export SMOKE_TIMEOUT_SECONDS=90
python3 scripts/smoke_deploy.py --api-base-url "$API_BASE_URL" --with-analyze
```

Or:

```bash
SMOKE_WITH_ANALYZE=1 ./scripts/deploy_cloud.sh
```

### What each check does

| Step | Endpoint | Pass criteria |
|------|----------|---------------|
| `health` | `GET /health` | HTTP 200, `status=ok`, `service=survival-go` |
| `presets` | `GET /api/presets` | HTTP 200, non-empty list with `id` on first preset |
| `analyze` (optional) | `POST /api/games` then `POST .../analyze` | HTTP 201 + 200, metrics with `unresolved_count` and `min_black_probability` in `[0,1]` |

Exit code `0` prints `smoke passed (...)`; non-zero prints `smoke failed: ...` on stderr.

## Full deploy orchestration

`scripts/deploy_cloud.sh` runs build/publish phases you have not skipped, then smoke:

```bash
export API_BASE_URL="https://api.<your-domain>"
export VITE_API_BASE_URL="$API_BASE_URL"
export S3_BUCKET="my-app-frontend"
export CLOUDFRONT_DISTRIBUTION_ID="E123..."   # optional
export ECR_REGISTRY="123456789.dkr.ecr.us-east-1.amazonaws.com/survival-go-backend"
export IMAGE_TAG="20260517"

./scripts/deploy_cloud.sh
```

### Skip flags

| Env | Effect |
|-----|--------|
| `SKIP_BACKEND=1` | Skip `build_backend_image.sh` / `docker push` |
| `SKIP_FRONTEND=1` | Skip frontend build and S3 publish |
| `SKIP_SMOKE=1` | Skip post-deploy smoke |

Typical two-step backend rollout:

1. Build and push: run without `SKIP_BACKEND`; note the image tag.
2. Update ECS task definition / service to the new tag in the AWS console or CLI.
3. Smoke only: `SKIP_BACKEND=1 SKIP_FRONTEND=1 API_BASE_URL=... ./scripts/deploy_cloud.sh`

If `ECR_REGISTRY` is set, the script tags and pushes after build; you still update ECS manually for MVP.

Frontend publish runs only when `S3_BUCKET` is set; otherwise `frontend/dist` is built but not uploaded.

## Environment reference

| Variable | Used by | Notes |
|----------|---------|-------|
| `API_BASE_URL` | smoke, frontend default | API origin, no trailing slash |
| `SMOKE_WITH_ANALYZE` | `deploy_cloud.sh` | `1` adds `--with-analyze` |
| `SMOKE_TIMEOUT_SECONDS` | smoke | Default `30`; use `60`–`90` for analyze on cold tasks |
| `VITE_API_BASE_URL` | frontend build | Defaults to `API_BASE_URL` in `deploy_cloud.sh` |
| `S3_BUCKET`, `AWS_REGION`, `CLOUDFRONT_DISTRIBUTION_ID` | `publish_frontend_s3.sh` | See [cloud-frontend-static.md](cloud-frontend-static.md) |
| `ECR_REGISTRY`, `IMAGE_NAME`, `IMAGE_TAG` | `build_backend_image.sh` | See [cloud-backend-container.md](cloud-backend-container.md) |

## Pre-deploy gate

Run the release checklist before pushing images or static assets:

```bash
./scripts/run_tests.sh release
```

See [release-checklist.md](release-checklist.md).

## See also

- [cloud-env-and-sizing.md](cloud-env-and-sizing.md) — timeouts and Fargate sizing when analyze smoke times out
- [cloud-aws-ecs-topology.md](cloud-aws-ecs-topology.md) — network, domain, manual ECS update
- [local-run.md](local-run.md) — curl examples for the same API flow locally
