# Cloud deployment topology (AWS + ECS, MVP)

This document defines the MVP cloud topology for Survival Go using your chosen constraints:

- AWS-first
- ECS runtime
- single backend instance initially
- manual deploys
- low cost with acceptable latency
- custom domain managed in Namecheap

Backend container image and KataGo path wiring: [cloud-backend-container.md](cloud-backend-container.md). Frontend static build and S3 publish: [cloud-frontend-static.md](cloud-frontend-static.md). **Env vars, Fargate sizing, and analysis timeouts:** [cloud-env-and-sizing.md](cloud-env-and-sizing.md). **Deploy scripts and post-deploy smoke:** [cloud-deploy-automation.md](cloud-deploy-automation.md).

## Recommended topology

### Backend and KataGo (ECS)

- Run the backend as a single ECS service with `desiredCount=1`.
- Package KataGo binary, model, and analysis config into the same backend container image.
- Keep one shared KataGo subprocess per backend task (already matches app behavior).
- Use ECS capacity strategy:
  - **MVP default:** ECS on **Fargate** (simpler operations, acceptable cost at small scale).
  - **Cost-down later:** move same task definition to ECS on EC2 if sustained usage makes Fargate more expensive.

Why this shape:

- One running backend task maps cleanly to your current single shared KataGo process.
- No cross-instance state complexity yet (games are in-memory).
- Operationally simple while still production-like.

### Frontend (static hosting)

Use **S3 + CloudFront** for the frontend.

- Build with `./scripts/build_frontend.sh` and `VITE_API_BASE_URL=https://api.<domain>` (see [cloud-frontend-static.md](cloud-frontend-static.md)).
- Upload `frontend/dist` to S3 via `./scripts/publish_frontend_s3.sh`.
- Serve through CloudFront for HTTPS, caching, and global edge delivery.

Why this is recommended:

- Lowest operational overhead and usually lowest cost for static React assets.
- Decouples frontend deploys from backend runtime.
- Works well with Namecheap-managed domains.

## Network layout

```text
Browser
  -> CloudFront (frontend static assets, custom domain)
  -> ALB (api.<domain>) -> ECS service (FastAPI + KataGo subprocess)
```

- Frontend and API should use separate subdomains:
  - `app.<your-domain>` for CloudFront
  - `api.<your-domain>` for ALB/ECS
- Backend CORS should allow only frontend origin(s).

## Domain and TLS (Namecheap + AWS)

You can keep Namecheap as registrar and DNS host, or move DNS to Route 53. Either works.

### Option A (keep Namecheap DNS)

- Create ACM certificate(s) in AWS for `app.<domain>` and `api.<domain>`.
- Complete DNS validation in Namecheap.
- Point:
  - `app.<domain>` CNAME to CloudFront distribution domain.
  - `api.<domain>` CNAME to ALB DNS name.

### Option B (Route 53 hosted zone)

- Delegate NS records from Namecheap to Route 53.
- Manage records/certs fully in AWS.

MVP recommendation: Option A first (fewer moving parts if you already manage DNS in Namecheap).

## Secrets and config strategy

Use **AWS Secrets Manager** for sensitive runtime values and inject them into the ECS task.

- Store secrets/config keys that should not live in git or plaintext env files.
- Keep non-sensitive tuning values in ECS task environment variables.

Suggested split:

- Secrets Manager:
  - future API keys/tokens (if added)
  - any sensitive private endpoints/credentials
- ECS env vars (non-sensitive defaults):
  - `SURVIVAL_THRESHOLD`
  - `KATAGO_TOP_N`
  - `KATAGO_ANALYSIS_TIMEOUT_SECONDS`

KataGo file path vars still exist, but in container deploy they should point to fixed in-image paths.

## State and scaling implications

Current app state is in-memory per backend process.

- With `desiredCount=1`, game sessions work as expected.
- Horizontal scale is intentionally deferred; with multiple tasks, sessions would fragment unless you add shared state.

For MVP (10 users initial, up to ~50 concurrent peak), keep single task and monitor queue latency.

## Sizing and latency guidance (cost-first)

See **[cloud-env-and-sizing.md](cloud-env-and-sizing.md)** for ECS CPU/memory tables, `KATAGO_ANALYSIS_TIMEOUT_SECONDS` by load, and tuning order. Summary: start around `2 vCPU / 4 GB RAM`, keep `desiredCount=1`, raise analysis timeout before scaling CPU; KataGo queries are queue-based, not parallel per request.

## Manual deploy flow (MVP)

1. Build backend image (`./scripts/build_backend_image.sh`) and push to ECR — see [cloud-backend-container.md](cloud-backend-container.md).
2. Update ECS service/task definition to new image tag.
3. Build and publish frontend (`VITE_API_BASE_URL`, `build_frontend.sh`, `publish_frontend_s3.sh`) — [cloud-frontend-static.md](cloud-frontend-static.md).
4. Invalidate CloudFront cache (or use content-hashed assets).
5. Run smoke checks (`scripts/smoke_deploy.py` or `scripts/deploy_cloud.sh` — see [cloud-deploy-automation.md](cloud-deploy-automation.md)).

## Smoke checks after deploy

Post-deploy verification should include `GET /health`, `GET /api/presets`, and a quick gameplay path (see [cloud-deploy-automation.md](cloud-deploy-automation.md)).

Automated (recommended):

```bash
export API_BASE_URL="https://api.<your-domain>"
python3 scripts/smoke_deploy.py --api-base-url "$API_BASE_URL"
# optional KataGo path:
python3 scripts/smoke_deploy.py --api-base-url "$API_BASE_URL" --with-analyze
```

Manual UI check on the frontend domain:

- start game
- human move
- engine move or analyze

## Out-of-scope for this step

- fully automated CI/CD (GitHub Actions → ECS)
- blue/green deploy
- autoscaling policies
- distributed game-state persistence

These belong to later section 6 tasks.
