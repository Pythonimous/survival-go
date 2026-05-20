# ONNX models on S3 + CloudFront

Host the three pinned Kaya ONNX weight files on **your** S3 bucket behind **CloudFront**, then point the frontend build at that CDN URL. This is optional on the single-VM path ([cloud-aws-zero-to-domain-runbook.md](cloud-aws-zero-to-domain-runbook.md) Part 5) and matches the production default in the [ECS topology](cloud-aws-ecs-topology.md).

**Default without this doc:** browsers download from [kaya-go/kaya on Hugging Face](https://huggingface.co/kaya-go/kaya) — no AWS objects required.

**When self-hosting helps:**

- You control availability (no third-party rate limits on gameplay).
- Versioned rollout: ship `kaya/v0.2.3/` alongside `v0.2.2/`, flip one env var, rebuild frontend.
- Edge caching closer to users (large ~75–293 MB downloads per variant).

**Rough extra cost:** S3 storage for ~515 MB + CloudFront egress (often a few dollars/month at low traffic; scales with downloads).

Artifact details, filenames, and checksums: [onnx-model-artifacts.md](onnx-model-artifacts.md). Upload helper: [`scripts/sync_onnx_artifacts.sh`](../../scripts/sync_onnx_artifacts.sh).

---

## End state

```text
Browser (https://play.example.com)
  GET https://models.example.com/kaya/v0.2.2/<file>.fp16.onnx
        |
        v
  CloudFront distribution
        |
        v
  S3 bucket (private; Origin Access Control only)
      s3://survival-go-models/kaya/v0.2.2/
```

The app origin (`play.`) and model origin (`models.` or `*.cloudfront.net`) are **different hosts**, so the CDN must return **CORS** headers that allow `https://play.<your-domain>`.

---

## Before you start

| Item | Notes |
|------|--------|
| Working app | [Part 4](cloud-aws-zero-to-domain-runbook.md#part-4--https-with-caddy-automatic-certificates) done — you know `PLAY_HOST` (e.g. `play.example.com`) |
| AWS CLI | Configured on your laptop (`aws sts get-caller-identity`) |
| Region | Pick one and stay consistent (e.g. `us-east-1`). **ACM certificates used by CloudFront must be in `us-east-1`**, even if the S3 bucket is elsewhere |
| Hostname plan | Either CloudFront default domain (`d1234abcd.cloudfront.net`) or custom `models.example.com` |

Pinned prefix in examples: **`kaya/v0.2.2/`** (from `scripts/onnx_artifact_manifest.json`).

---

## 1 — Create the S3 bucket

**Console → S3 → Create bucket**

| Setting | Value |
|---------|--------|
| Bucket name | Globally unique, e.g. `survival-go-models-<account-id>` |
| Region | Your choice (e.g. `us-east-1`) |
| Block all public access | **On** (keep it on) |
| Bucket versioning | Optional (helps audit rollbacks) |

No website hosting, no public ACLs. CloudFront will read objects via **Origin Access Control (OAC)**.

---

## 2 — Upload pinned artifacts

From your laptop (repo root), with AWS credentials that can `s3:PutObject` on the bucket.

**Dry run (download + hash verify only, no upload):**

```bash
DRY_RUN=1 \
ONNX_ARTIFACT_BUCKET=survival-go-models-YOUR_ID \
ONNX_ARTIFACT_PREFIX=kaya/v0.2.2 \
AWS_REGION=us-east-1 \
./scripts/sync_onnx_artifacts.sh
```

**Real upload** (downloads from Hugging Face per manifest, verifies SHA-256, uploads three `.onnx` files):

```bash
ONNX_ARTIFACT_BUCKET=survival-go-models-YOUR_ID \
ONNX_ARTIFACT_PREFIX=kaya/v0.2.2 \
AWS_REGION=us-east-1 \
./scripts/sync_onnx_artifacts.sh
```

**Checkpoint:**

```bash
aws s3 ls s3://survival-go-models-YOUR_ID/kaya/v0.2.2/
```

You should see three objects whose names start with `kata1-b28c512nbt-s12043015936-d5616446734.` and end with `.fp32.onnx`, `.fp16.onnx`, `.uint8.onnx`.

To mirror locally instead of (or before) S3, see [onnx-model-artifacts.md](onnx-model-artifacts.md) (`ONNX_ARTIFACT_LOCAL_DIR`).

---

## 3 — S3 CORS (required for browser fetches)

Because `https://play.example.com` loads scripts from one origin and fetches `.onnx` from another, S3 must allow cross-origin **GET** (and **HEAD**). CloudFront will forward CORS-related headers when configured in step 4.

**S3 → your bucket → Permissions → Cross-origin resource sharing (CORS)**

Replace `https://play.example.com` with your real app URL (scheme + host, no trailing slash):

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": ["https://play.example.com"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
    "MaxAgeSeconds": 86400
  }
]
```

Add extra `AllowedOrigins` entries if you also test from `http://localhost:5173` or a staging host.

---

## 4 — CloudFront distribution

### 4.1 Create distribution

**Console → CloudFront → Create distribution**

| Section | Setting |
|---------|---------|
| Origin domain | Select your **S3 bucket** (not the website endpoint) |
| Origin access | **Origin access control settings (recommended)** → Create new OAC → allow CloudFront to update bucket policy |
| Viewer protocol policy | **Redirect HTTP to HTTPS** |
| Allowed HTTP methods | **GET, HEAD** (optionally enable **OPTIONS** if preflight fails in browser devtools) |
| Cache policy | Start with **CachingOptimized**; if CORS headers are missing in the browser, switch origin/cache to forward `Origin` (see troubleshooting) |
| Price class | Use only North America and Europe (or all edge locations) per budget |
| Alternate domain (CNAME) | Optional: `models.example.com` (requires ACM cert in **us-east-1**, step 4.3) |
| Default root object | Leave empty (you serve files by full path, not `index.html`) |

After creation, note:

- **Distribution domain name** — e.g. `d111111abcdef8.cloudfront.net`
- **Distribution ID** — for invalidations (usually unnecessary when using versioned prefixes)

S3 bucket policy: when you create OAC, CloudFront offers to **copy the bucket policy** that grants `s3:GetObject` to the distribution. Accept that update.

### 4.2 Object metadata (recommended)

Large binaries should not be gzip-compressed at the edge. In S3, ensure objects are uploaded as `binary/octet-stream` or `application/octet-stream` (the sync script uses default `aws s3 cp` types). Do not enable CloudFront **Compress objects automatically** for this behavior if you add a separate behavior for `*.onnx`.

Long cache is safe because paths are versioned (`kaya/v0.2.2/...`). Default TTL (e.g. 24h–1y) is fine; bumping `v0.2.3` is a new URL, not an overwrite.

### 4.3 Optional custom domain + TLS

Skip this if the default `https://d….cloudfront.net` URL is enough for MVP.

1. **ACM (us-east-1 only):** Request a public certificate for `models.example.com` (DNS validation).
2. **CloudFront → your distribution → Edit → Alternate domain names:** add `models.example.com`, attach the ACM cert.
3. **Namecheap → Advanced DNS:** CNAME `models` → `d111111abcdef8.cloudfront.net` (the distribution domain, not the bucket).

Wait for DNS + cert validation before testing HTTPS on the custom name.

### 4.4 Optional response headers policy

If the browser still reports CORS errors after S3 CORS is set, add a **Response headers policy** on the distribution behavior:

- `Access-Control-Allow-Origin`: `https://play.example.com` (or use origin override from request if you prefer dynamic origins)
- `Access-Control-Allow-Methods`: `GET, HEAD, OPTIONS`
- `Access-Control-Expose-Headers`: `Content-Length, Content-Range, Accept-Ranges, ETag`

Prefer fixing **S3 CORS + forwarding `Origin`** first; duplicate ACAO headers from S3 and CloudFront can conflict.

---

## 5 — Verify the CDN

Set variables for your environment:

```bash
export CDN_BASE="https://d111111abcdef8.cloudfront.net/kaya/v0.2.2"
# or: export CDN_BASE="https://models.example.com/kaya/v0.2.2"

export STEM="kata1-b28c512nbt-s12043015936-d5616446734"
```

**Object exists (expect HTTP 200):**

```bash
curl -fsSI "${CDN_BASE}/${STEM}.fp16.onnx" | head -5
curl -fsSI "${CDN_BASE}/${STEM}.uint8.onnx" | head -5
```

**CORS (expect `access-control-allow-origin` matching your app or `*`):**

```bash
curl -fsSI \
  -H "Origin: https://play.example.com" \
  "${CDN_BASE}/${STEM}.uint8.onnx" | grep -i access-control
```

**Range support (optional; large downloads may use ranges):**

```bash
curl -fsSI -H "Range: bytes=0-1023" "${CDN_BASE}/${STEM}.uint8.onnx" | grep -i content-range
```

In browser devtools (Network), confirm all three variants return **200** when starting analysis.

---

## 6 — Point the frontend build at the CDN

On the **EC2 server** (same place you run `docker compose`), rebuild with the CDN base URL **without** a trailing slash:

```bash
cd ~/survival-go
git pull

export PLAY_HOST="play.example.com"   # for your own notes; Caddy already set
export VITE_ONNX_MODEL_BASE_URL="https://models.example.com/kaya/v0.2.2"
# or: export VITE_ONNX_MODEL_BASE_URL="https://d111111abcdef8.cloudfront.net/kaya/v0.2.2"

# Default filename prefix matches upstream Kaya names — omit unless you renamed files:
# export VITE_ONNX_MODEL_FILENAME_PREFIX="kata1-b28c512nbt-s12043015936-d5616446734"

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Resolved fetch URL (default prefix):

```text
${VITE_ONNX_MODEL_BASE_URL}/${VITE_ONNX_MODEL_FILENAME_PREFIX}.fp16.onnx
```

**Checkpoint:** open `https://play.example.com`, start a game, watch Network for `.onnx` requests hitting your CDN host (not `huggingface.co`).

---

## 7 — Ship a new model version

1. Update `scripts/onnx_artifact_manifest.json` (version + checksums) per your release process.
2. Upload to a **new prefix**, e.g. `kaya/v0.2.3/`:

   ```bash
   ONNX_ARTIFACT_BUCKET=survival-go-models-YOUR_ID \
   ONNX_ARTIFACT_PREFIX=kaya/v0.2.3 \
   ./scripts/sync_onnx_artifacts.sh
   ```

3. Change `VITE_ONNX_MODEL_BASE_URL` to the new prefix and rebuild frontend on the server.
4. **Invalidation:** usually **not** needed — old URLs remain cached under `v0.2.2/`; users on the new build request `v0.2.3/` only. If you overwrite files **in place** at the same key, create an invalidation for `/kaya/v0.2.2/*` or wait for TTL expiry.

---

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| `403` from CloudFront | OAC bucket policy applied; object key matches URL path (`kaya/v0.2.2/...`) |
| `403` from S3 directly | Expected — bucket should stay private; test via CloudFront URL only |
| CORS error in browser | S3 CORS `AllowedOrigins` includes exact app origin (`https://`, no path); CloudFront forwards `Origin` or adds response headers policy |
| `200` in `curl` but CORS fails in browser | Compare `curl -H "Origin: …"` response headers; fix S3 CORS before duplicating headers on CloudFront |
| Engine stuck loading; HF worked before | Wrong `VITE_ONNX_MODEL_BASE_URL` (typo, trailing slash doubled, missing `/kaya/v0.2.2` segment) |
| `404` on one variant only | Re-run `aws s3 ls` for that filename; sync script may have failed mid-upload |
| Slow first load | Normal for 75–293 MB; confirm edge cache hit on second load (`x-cache: Hit from cloudfront`) |
| Cert error on custom domain | ACM cert must be in **us-east-1** and **Issued**; CNAME points to distribution domain |

---

## Quick checklist

- [ ] S3 bucket created (block public access on)
- [ ] `sync_onnx_artifacts.sh` uploaded `kaya/v0.2.2/` (three files)
- [ ] S3 CORS allows `https://play.<domain>`
- [ ] CloudFront distribution with S3 OAC origin
- [ ] `curl` 200 + CORS headers for at least `uint8` and `fp16`
- [ ] `VITE_ONNX_MODEL_BASE_URL` set on EC2 rebuild
- [ ] Browser game: ONNX requests go to CDN, engine moves

---

## See also

- [cloud-aws-zero-to-domain-runbook.md](cloud-aws-zero-to-domain-runbook.md) — single VM + Caddy
- [onnx-model-artifacts.md](onnx-model-artifacts.md) — variants, env vars, manifest
- [browser-inference-rollout-runbook.md](../operations/browser-inference-rollout-runbook.md) — metrics and rollout
- [cloud-aws-ecs-topology.md](cloud-aws-ecs-topology.md) — split `app.` / `api.` / `models.` stack
