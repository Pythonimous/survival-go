# Cloud frontend static build and publish (S3 + CloudFront)

Production frontend is a **static Vite build** (`frontend/dist`) served from **S3 + CloudFront**. The browser calls the API on a separate subdomain via `VITE_API_BASE_URL`.

Topology context: [cloud-aws-ecs-topology.md](cloud-aws-ecs-topology.md). Backend image: [cloud-backend-container.md](cloud-backend-container.md).

## API base URL (`VITE_API_BASE_URL`)

| Deploy shape | `VITE_API_BASE_URL` | API requests |
|--------------|---------------------|--------------|
| Vite dev (`npm run dev`) | unset | `/api/...` proxied to `127.0.0.1:8000` |
| Docker Compose (nginx) | unset | `/api/...` proxied to `backend:8000` |
| S3 + CloudFront + ALB API | `https://api.<your-domain>` | absolute URLs to API host |

Set at **build time** (baked into the JS bundle). Example:

```bash
export VITE_API_BASE_URL="https://api.example.com"
./scripts/build_frontend.sh
```

Template: [`frontend/.env.production.example`](../../frontend/.env.production.example). Helper: `frontend/src/lib/api/client.ts` (`apiUrl()`).

Do not include a trailing slash on the base URL.

## Build static assets

From the repo root:

```bash
./scripts/build_frontend.sh
```

With API host:

```bash
VITE_API_BASE_URL="https://api.example.com" ./scripts/build_frontend.sh
```

Output: `frontend/dist/` (content-hashed JS/CSS; `index.html` for SPA routing).

Run [release-checklist.md](release-checklist.md) frontend steps (`npm test`, `npm run build`) before cloud publish.

## Publish to S3 (+ CloudFront invalidation)

Prerequisites: AWS CLI configured, bucket created, CloudFront origin pointing at the bucket (see topology doc).

```bash
export S3_BUCKET=my-survival-go-frontend
export AWS_REGION=us-east-1
export CLOUDFRONT_DISTRIBUTION_ID=E1234567890ABC   # optional

VITE_API_BASE_URL="https://api.example.com" ./scripts/build_frontend.sh
./scripts/publish_frontend_s3.sh
```

Script: [`scripts/publish_frontend_s3.sh`](../../scripts/publish_frontend_s3.sh). Set `DRY_RUN=1` to preview `aws s3 sync` without uploading.

CloudFront should serve `index.html` for unknown paths (SPA fallback). Use the distribution’s custom error response or equivalent so client-side routes work.

## Backend CORS

When the frontend origin differs from the API host, configure ECS env:

```text
CORS_ALLOW_ORIGINS=https://app.example.com
```

Comma-separated list for multiple origins. Defaults include local Vite (`5173`) and Docker Compose nginx (`8080`). See [environment.md](environment.md).

## Manual deploy sequence (MVP)

1. Build and push backend image — [cloud-backend-container.md](cloud-backend-container.md).
2. Update ECS service to new image; set `CORS_ALLOW_ORIGINS` to `https://app.<domain>`.
3. `VITE_API_BASE_URL=https://api.<domain> ./scripts/build_frontend.sh`
4. `./scripts/publish_frontend_s3.sh` (with `S3_BUCKET` set).
5. Smoke: open `https://app.<domain>`, load presets, start a game.

API smoke (from any host):

```bash
curl -fsS "https://api.<domain>/health"
curl -fsS "https://api.<domain>/api/presets"
```

## Docker image (optional)

[`docker/frontend/Dockerfile`](../../docker/frontend/Dockerfile) builds without `VITE_API_BASE_URL` and proxies `/api` to the backend — suited to Compose, not split-domain cloud. For ECS-only backend + static frontend, prefer S3 publish above.

## See also

- [cloud-aws-ecs-topology.md](cloud-aws-ecs-topology.md) — domains, TLS, manual deploy overview
- [docker-compose.md](docker-compose.md) — same-origin nginx packaging
- [environment.md](environment.md) — `CORS_ALLOW_ORIGINS` and backend vars
- [release-checklist.md](release-checklist.md) — pre-deploy test gate
