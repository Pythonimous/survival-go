# AWS runbook: zero to custom domain (simple path)

**Goal:** `https://play.<your-domain>` serves the full app (UI + API + KataGo) with minimal AWS surface area.

**What you are *not* building on day one:** ECS, Fargate, Application Load Balancer, CloudWatch log groups, ECR, S3 static site, CloudFront, ACM juggling across two hostnames. That stack is documented separately when you actually need it: **[cloud-aws-ecs-full-runbook.md](cloud-aws-ecs-full-runbook.md)**.

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
                backend (FastAPI + KataGo)
```

One hostname, one server, same `docker compose` flow you can run on your laptop. See [docker-compose.md](docker-compose.md).

**Rough cost:** ~**$15–40/month** (e.g. EC2 `t3.large` or similar + Elastic IP — region-dependent).

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
| Instance type | **`t3.large`** or **`t3a.large`** (2 vCPU, 8 GiB, **x86_64**) — see [§1.2a Instance families](#12a-instance-families-t3-vs-t4g-vs-c7i) |
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

### 1.2a Instance families (t3 vs t4g vs c7i)

Our Docker image ships a **prebuilt KataGo x86_64 binary**. Pick an **x86** instance and the **64-bit (x86) Ubuntu** AMI.

| Family | Works out of the box? | Good for |
|--------|------------------------|----------|
| **t3 / t3a** | Yes | **Default for initial testing** — cheap, 8 GiB on `large`, enough for a few concurrent users. CPU is *burstable* (credits); sustained engine analysis can slow down if you hammer it for hours. |
| **c7i / c6i** | Yes | **Snappier engine moves** — compute-optimized, sustained CPU without burst credits. `c7i.large` is only **4 GiB RAM** (tight for KataGo + model); prefer **`c7i.xlarge`** (4 vCPU, 8 GiB) if moves feel slow and you do not mind the cost. |
| **t4g / m7g / c7g** (Graviton, **ARM**) | **No** (current image) | Cheaper per spec on paper, but KataGo in this repo is **not** the ARM zip — you would need an ARM build or compile from source. Skip unless you explicitly invest in that. |

**Practical picks:**

- **Budget / first deploy:** `t3a.large` (same idea as `t3.large`, often a bit cheaper).
- **“Engine feels sluggish” on t3:** try `c6i.large` or `c7i.xlarge` (not `*.medium` — too little RAM).
- **Do not use `t4g`** for this project until the image uses an ARM KataGo binary.

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

First start (downloads KataGo + model; **10–30+ minutes**):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

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
export PLAY_HOST="play.example.com"
echo "${PLAY_HOST} {
    reverse_proxy 127.0.0.1:9080
}" | sudo tee /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy obtains a Let's Encrypt certificate on first request (ports 80/443 must be open — §1.2).

**Checkpoint from your laptop:**

```bash
curl -fsS "https://play.example.com/health"
curl -fsS "https://play.example.com/api/presets" | head
```

Open `https://play.example.com` in a browser → presets → start a game → play a move.

**CORS:** With this layout the browser talks to one origin; nginx proxies `/api`. You do **not** need `VITE_API_BASE_URL` or extra `CORS_ALLOW_ORIGINS` for the single-hostname setup.

---

## Part 5 — Deploy updates (day two and onward)

SSH to the server:

```bash
cd ~/survival-go
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
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

## Part 6 — Tuning and ops (still simple)

| Knob | Where |
|------|--------|
| KataGo timeout under load | `KATAGO_ANALYSIS_TIMEOUT_SECONDS` in `docker-compose.yml` (e.g. `60`) |
| More CPU/RAM | Change instance type → stop instance → change type → start |
| Disk full | `docker system prune` (careful) or enlarge volume |
| Restart everything | `docker compose -f docker-compose.yml -f docker-compose.prod.yml restart` |

**Sessions:** Games live in backend memory. Rebooting the VM ends in-progress games (same as local). One KataGo process per server — see [shared-katago-engine.md](shared-katago-engine.md).

**Security basics:** SSH restricted to your IP; app listens on localhost **9080** only; keep Ubuntu updated (`sudo apt upgrade`).

---

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| Docker frontend build: `Cannot find module '../lib/api'` | `frontend/src/lib/` was missing from git (old `.gitignore` had `lib/`). Pull latest repo; confirm `ls frontend/src/lib/api.ts` exists before build. |
| `failed to bind host port ... address already in use` | `docker compose ... down`, then `sudo ss -tlnp \| grep -E '8080|9080'`. Prod uses **9080** only; do not run local compose (8080) on the same VM. |
| SSH timeout | Security group allows 22 from your current IP; instance running |
| `curl 127.0.0.1:9080` fails | `docker compose logs backend`; first build still running |
| Backend restart loop | Usually KataGo paths or OOM → try `t3.large` |
| HTTPS certificate fails | DNS A record points to Elastic IP; ports 80/443 open |
| Site loads, engine times out | Raise `KATAGO_ANALYSIS_TIMEOUT_SECONDS` |
| Out of disk on first build | 30 GiB minimum; KataGo + model are large |

---

## When to use the heavy AWS path

Move to **[cloud-aws-ecs-full-runbook.md](cloud-aws-ecs-full-runbook.md)** if you need things this VM model does not give you:

- Separate `app.` and `api.` hostnames with a CDN for static assets
- Multiple backend replicas / autoscaling
- No SSH on a box in production
- Fine-grained IAM for a team pushing images without server access

Until then, the single-VM path matches the repo’s Docker packaging and is enough for early users and smoke checks in a real environment.

---

## Checklist

- [ ] EC2 `t3.large` (or similar) + Elastic IP
- [ ] Security group: 22 (my IP), 80, 443
- [ ] Namecheap A record `play` → Elastic IP
- [ ] Docker + compose plugin on server
- [ ] `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`
- [ ] `curl http://127.0.0.1:9080/health` on server
- [ ] Caddy → `https://play.<domain>`
- [ ] Browser: presets, move, engine reply
- [ ] Optional: `smoke_deploy.py` against `https://play.<domain>`
