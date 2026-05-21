# AWS runbook: zero to custom domain (simple path)

**Goal:** `https://play.<your-domain>` serves the full app (UI + API) with minimal AWS surface area. Inference runs in the browser via ONNX.

**What you are *not* building on day one:** ECS, Fargate, Application Load Balancer, CloudWatch log groups, ECR, S3 static site hosting for the app itself, ACM juggling across two hostnames. That heavier split stack is outlined in **[cloud-aws-ecs-topology.md](cloud-aws-ecs-topology.md)** with supporting docs under `docs/development/cloud-*.md`.

**What you *are* building:**

```text
Browser  -->  https://play.example.com
                    |
                    v
              Caddy (TLS, ports 80/443 on the VM)
                    |
                    v
              docker compose (same as local packaging)
                frontend (nginx) :9080 on localhost
                backend (FastAPI API-only)
```

One hostname, one server, same `docker compose` flow you can run on your laptop. See [docker-compose.md](docker-compose.md).

**Rough cost:** ~**$8–25/month** (e.g. EC2 `t3.small` / `t3.medium` + Elastic IP, region-dependent).

**Time:** ~**1–2 hours** plus first image build time and DNS propagation.

---

## Before you start

| You need | Notes |
|----------|--------|
| AWS account | Console login at https://console.aws.amazon.com/ |
| Domain | e.g. bought on Namecheap |
| SSH key pair | Created in EC2 when launching the instance |
| This repo | Cloned on the server (or copied up via `git clone`) |

**Optional on your laptop:** AWS CLI — not required for this path if you use the Console for EC2 and SSH for everything else.

Pick a hostname, e.g. `play.example.com` (`PLAY_HOST`). You do **not** need separate `app.` and `api.` subdomains for this setup; nginx in the frontend container proxies `/api` to the backend (same as local Docker Compose).

---

## Part 1 — Launch one EC2 instance (AWS Console)

### 1.1 Region

Top-right of Console → choose a region close to you (e.g. **US East (N. Virginia)**). Stay in that region for the instance and Elastic IP.

### 1.2 Launch instance

**Console → EC2 → Instances → Launch instance**

| Setting | Recommended value |
|---------|-------------------|
| Name | `survival-go` |
| AMI | **Ubuntu Server 24.04 LTS** (64-bit x86) |
| Instance type | **`t3.small`** or **`t3.medium`** (API-only backend; start small and scale after load tests) |
| Key pair | Create new or select existing → **download `.pem`** — you need it to SSH |
| Network | Default VPC is fine |
| Auto-assign public IP | **Enable** |
| Security group | Create new, name `survival-go-sg` |
| Storage | 30–40 GiB gp3 |

**Security group inbound rules (only these):**

| Type | Port | Source | Why |
|------|------|--------|-----|
| SSH | 22 | **My IP** (Console button) | Admin access — do not use `0.0.0.0/0` for SSH |
| HTTP | 80 | `0.0.0.0/0` | Caddy → Let's Encrypt |
| HTTPS | 443 | `0.0.0.0/0` | Users |

Launch instance. Wait until **Instance state = running**.

### 1.2a Instance families (right-size for API-only backend)

Inference is browser-side; the EC2 host serves static files and a lightweight FastAPI backend.

| Family | Good for | Notes |
|--------|----------|-------|
| **t3 / t3a** | **Default MVP deploy** | Burstable and usually cheapest. Start at `t3.small`; bump to `t3.medium` if API latency or memory pressure appears. |
| **c7i / c6i** | Higher sustained API traffic | Usually unnecessary early unless you have sustained request volume. |
| **t4g / m7g / c7g** (ARM) | Cost optimization later | Works if your images/deps are multi-arch. Validate your build pipeline first. |

**Practical picks:** start with `t3.small`, move to `t3.medium` if needed, and only then consider compute-optimized families.

### 1.3 Elastic IP (stable DNS target)

**EC2 → Elastic IPs → Allocate → Associate** with `survival-go`.

Note the **Elastic IP address** (e.g. `3.12.34.56`) → `SERVER_IP`.

### 1.4 DNS at Namecheap

**Domain List → Manage → Advanced DNS**

| Type | Host | Value |
|------|------|--------|
| **A Record** | `play` | `SERVER_IP` (your Elastic IP) |

(Use host `@` instead of `play` if you want the apex domain.)

Propagation: often 5–30 minutes. Check: `dig +short play.example.com` should return `SERVER_IP`.

---

## Part 2 — SSH into the server and install Docker

Use the **Elastic IP** (or the instance **public** IPv4) from the EC2 console — not the private `10.x.x.x` address (that only works inside AWS).

From your laptop (fix key permissions first — SSH refuses `0644` on `.pem` files):

```bash
chmod 400 ~/.ssh/survival-go.pem   # or wherever you saved the key
ssh -i ~/.ssh/survival-go.pem ubuntu@SERVER_IP
```

**Username is lowercase `ubuntu`** for the official Ubuntu AMI (not `UBUNTU` or `root`).

If you see `WARNING: UNPROTECTED PRIVATE KEY FILE` or `bad permissions`, run `chmod 400` on the `.pem` and try again.

On the server:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git

# Docker official install (Ubuntu)
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo ${VERSION_CODENAME}) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

sudo usermod -aG docker ubuntu
```

Log out and SSH back in so `docker` works without `sudo`:

```bash
exit
ssh -i ~/.ssh/survival-go.pem ubuntu@SERVER_IP
docker --version
docker compose version
```

---

## Part 3 — Clone repo and start the stack

```bash
git clone https://github.com/YOUR_ORG/survival-go.git
cd survival-go
```

First start (builds frontend/backend images; duration depends on network and cache):

```bash
./scripts/docker_compose.sh -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

This sets `VITE_APP_BUILD_ID` from the repo’s git short SHA so each deploy busts browser cache for unhashed static assets (`coi-serviceworker.js`, `/wasm/*`).

`docker-compose.prod.yml` binds the app to **127.0.0.1:9080** (not 8080 — local compose uses 8080) so only Caddy faces the public internet.

**Checkpoint on the server:**

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
docker port survival-go-frontend-1
# should show 127.0.0.1:9080 -> 80/tcp

curl -fsS http://127.0.0.1:9080/health
curl -fsS http://127.0.0.1:9080/api/presets | head
```

If `curl` cannot connect but the container is Up, port mapping is missing — run `git pull`, confirm `docker-compose.prod.yml` contains `127.0.0.1:9080:80` (no `!reset`), then `docker compose ... up -d --force-recreate`.

Expected: health JSON with `"status":"ok"`; presets list non-empty.

**Logs if something fails:**

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

No CloudWatch required — `docker compose logs` is enough for MVP.

---

## Part 4 — HTTPS with Caddy (automatic certificates)

Still on the server:

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update
sudo apt-get install -y caddy
```

Create Caddyfile (replace domain):

```bash
export PLAY_HOST="survival-go.com"
echo "${PLAY_HOST} {
    reverse_proxy 127.0.0.1:9080
}" | sudo tee /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy obtains a Let's Encrypt certificate on first request (ports 80/443 must be open — §1.2).

**Checkpoint from your laptop:**

```bash
curl -fsS "https://survival-go.com/health"
curl -fsS "https://survival-go.com/api/presets" | head
```

Open `https://play.example.com` in a browser → presets → start a game → play a move.

**CORS:** With this layout the browser talks to one origin; nginx proxies `/api`. You do **not** need `VITE_API_BASE_URL` or extra `CORS_ALLOW_ORIGINS` for the single-hostname setup.

---

## Part 5 — Optional: host ONNX model files on S3 + CloudFront

By default, browsers fetch ONNX weights from Hugging Face (`kaya-go/kaya`). That is fine for MVP.

Use S3 + CloudFront when you want a project-controlled origin, better edge caching for large downloads, or explicit version rollout (`kaya/v0.2.2/` → `v0.2.3/`).

**Full walkthrough (S3 bucket, CORS, CloudFront OAC, DNS, verify, rebuild):** **[cloud-onnx-s3-cloudfront.md](cloud-onnx-s3-cloudfront.md)**

Summary:

1. Upload pinned artifacts: `ONNX_ARTIFACT_BUCKET=… ONNX_ARTIFACT_PREFIX=kaya/v0.2.2 ./scripts/sync_onnx_artifacts.sh` ([onnx-model-artifacts.md](onnx-model-artifacts.md)).
2. Create a **private** S3 bucket + **CloudFront** distribution with **Origin Access Control** (not public bucket ACLs).
3. Configure **S3 CORS** so `https://play.<your-domain>` can `GET` the `.onnx` files (app and CDN are different origins).
4. On the EC2 host, rebuild with the CDN base URL (no trailing slash):

```bash
VITE_ONNX_MODEL_BASE_URL="https://models.example.com/kaya/v0.2.2" \
./scripts/docker_compose.sh -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Use the CloudFront domain (`https://d….cloudfront.net/kaya/v0.2.2`) if you skip a custom `models.` hostname. Keep `VITE_ONNX_MODEL_FILENAME_PREFIX` at default unless you renamed files during mirroring.

---

## Part 6 — Deploy updates (day two and onward)

SSH to the server:

```bash
cd ~/survival-go
git pull
./scripts/docker_compose.sh -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Optional smoke from laptop (needs Python + repo):

```bash
python3 scripts/smoke_deploy.py --api-base-url "https://play.example.com"
```

Optional analyze smoke (slow):

```bash
SMOKE_TIMEOUT_SECONDS=90 python3 scripts/smoke_deploy.py \
  --api-base-url "https://play.example.com" --with-analyze
```

---

## Part 7 — Tuning and ops (still simple)

| Knob | Where |
|------|--------|
| Survival defaults | `SURVIVAL_THRESHOLD`, `DEFAULT_TOP_N` in compose env if needed |
| More CPU/RAM | Change instance type → stop instance → change type → start |
| Model origin | `VITE_ONNX_MODEL_BASE_URL` (+ optional `VITE_ONNX_MODEL_FILENAME_PREFIX`) at frontend build time |
| Disk full | `docker system prune` (careful) or enlarge volume |
| Restart everything | `docker compose -f docker-compose.yml -f docker-compose.prod.yml restart` |

**Sessions:** Games live in backend memory. Rebooting the VM ends in-progress games (same as local). Engine inference runs in each user's browser (ONNX).

**Security basics:** SSH restricted to your IP; app listens on localhost **9080** only; keep Ubuntu updated (`sudo apt upgrade`).

---

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| Docker frontend build: `Cannot find module '../lib/api'` | `frontend/src/lib/` was missing from git (old `.gitignore` had `lib/`). Pull latest repo; confirm `ls frontend/src/lib/api/client.ts` exists before build. |
| `failed to bind host port ... address already in use` | `docker compose ... down`, then `sudo ss -tlnp \| grep -E '8080|9080'`. Prod uses **9080** only; do not run local compose (8080) on the same VM. |
| SSH timeout | Security group allows 22 from your current IP; instance running |
| `curl 127.0.0.1:9080` fails | `docker compose logs backend`; first build still running |
| Backend restart loop | Check `docker compose logs backend`; OOM → bump instance size |
| HTTPS certificate fails | DNS A record points to Elastic IP; ports 80/443 open |
| Site loads, engine never moves | Browser devtools network tab: ONNX model fetches. If using default HF origin, check outbound access/rate limits. If self-hosting, verify `VITE_ONNX_MODEL_BASE_URL` and that CDN URLs return `200` for all variants. |
| Out of disk on first build | 20–30 GiB is usually enough; increase if Docker cache grows |

---

## When to use the heavy AWS path

Move to the **[ECS topology](cloud-aws-ecs-topology.md)** and related `cloud-*` docs if you need things this VM model does not give you:

- Separate `app.` and `api.` hostnames with a CDN for static assets
- Multiple backend replicas / autoscaling
- No SSH on a box in production
- Fine-grained IAM for a team pushing images without server access

Until then, the single-VM path matches the repo’s Docker packaging and is enough for early users and smoke checks in a real environment.

---

## Checklist

- [ ] EC2 `t3.small` or `t3.medium` + Elastic IP
- [ ] Security group: 22 (my IP), 80, 443
- [ ] Namecheap A record `play` → Elastic IP
- [ ] Docker + compose plugin on server
- [ ] `./scripts/docker_compose.sh -f docker-compose.yml -f docker-compose.prod.yml up -d --build`
- [ ] `curl http://127.0.0.1:9080/health` on server
- [ ] Caddy → `https://play.<domain>`
- [ ] Browser: presets, move, engine reply
- [ ] Optional: `smoke_deploy.py` against `https://play.<domain>`
