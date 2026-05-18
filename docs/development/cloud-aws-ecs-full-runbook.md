# AWS runbook: ECS + ALB + CloudFront (full / later)

> **Not the default path.** For MVP and early testers, use **[cloud-aws-zero-to-domain-runbook.md](cloud-aws-zero-to-domain-runbook.md)** instead: one small EC2 instance, `docker compose`, Caddy for HTTPS — no load balancer, no CloudWatch log groups, no ECS, no split S3/CloudFront stack.
>
> Come back here only when you outgrow a single VM (autoscaling, separate static CDN, org IAM boundaries, etc.).

This document assumes **nothing** about your machine or AWS account except:

- You have (or can create) an AWS account.
- You own a domain (this guide uses Namecheap; other registrars work the same way).
- You have this repo cloned locally.

When finished you will have:

| URL | What it serves |
|-----|----------------|
| `https://app.<your-domain>` | React frontend (S3 + CloudFront) |
| `https://api.<your-domain>` | FastAPI + KataGo (ALB → ECS Fargate) |

**Time:** first-time setup is usually **3–6 hours** (mostly waiting on certificate validation and a slow first Docker image build).

**Cost (rough MVP):** on the order of **$30–80/month** with one small Fargate task always on (region-dependent).

Deeper reference docs (read if something is unclear):

- [cloud-aws-ecs-topology.md](cloud-aws-ecs-topology.md) — architecture picture
- [cloud-backend-container.md](cloud-backend-container.md) — what's inside the backend image
- [cloud-frontend-static.md](cloud-frontend-static.md) — `VITE_API_BASE_URL` and S3 publish
- [cloud-env-and-sizing.md](cloud-env-and-sizing.md) — CPU/RAM and timeouts
- [cloud-deploy-automation.md](cloud-deploy-automation.md) — `deploy_cloud.sh` / smoke scripts

---

## Part 1 — What you are building (one picture)

```text
Browser
  |
  |  https://app.example.com
  v
CloudFront  --->  S3 bucket (static files from frontend/dist)

Browser API calls
  |
  |  https://api.example.com
  v
Application Load Balancer (ALB)
  |
  v
ECS Fargate service (1 task)
  └── container: FastAPI :8000 + KataGo subprocess
```

**Three different “identities” in AWS (do not mix them up):**

| Identity | Where it lives | Who uses it | Purpose |
|----------|----------------|-------------|---------|
| **Deployer IAM user** (e.g. `survival-go-deployer`) | IAM → Users | **You** on your laptop (`aws` CLI, Console) | Create ECR repo, push images, create ECS/ALB/S3/CloudFront, run deploy scripts |
| **ECS task execution role** | IAM → Roles | **ECS service** (not you) | Pull image from ECR, write logs to CloudWatch |
| **ECS task role** | IAM → Roles | **Your app inside the container** (not you) | MVP: no AWS API calls from the app → role can have **no permissions** |

You will create all three in **Part 3** (deployer first, ECS roles before you create the ECS service).

---

## Part 2 — Local machine (before AWS login)

Do this on the computer you will deploy from (WSL/Linux is fine).

### 2.1 Install tools

```bash
# AWS CLI v2 (pick one)
# Ubuntu/Debian:
sudo apt-get update && sudo apt-get install -y awscli

# Or official installer: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html

docker --version    # must work
python3 --version   # for smoke script
```

Repo tests (optional but recommended before you pay for AWS):

```bash
cd /path/to/survival-go
./scripts/run_tests.sh release
```

### 2.2 Pick names (write these down)

Replace `example.com` with your real domain everywhere below.

| Setting | Example value | Notes |
|---------|---------------|--------|
| `DOMAIN_NAME` | `example.com` | Apex domain you bought |
| `APP_HOST` | `app.example.com` | Frontend |
| `API_HOST` | `api.example.com` | Backend |
| `AWS_REGION` | `us-east-1` | **Use one region for ECS/ALB/ECR.** CloudFront certs for custom domains also use **ACM in us-east-1** (AWS requirement). |
| ECR repo name | `survival-go-backend` | Fixed in our scripts |
| S3 bucket name | `survival-go-app-prod-<account-id>` | Must be **globally unique**; include account id |
| ECS cluster name | `survival-go` | Your choice |
| ECS service name | `survival-go-api` | Your choice |

### 2.3 Shell profile (fill in later)

After AWS login works, put this in `~/.bashrc` or a file `~/survival-go-deploy.env` you `source` before deploys:

```bash
export AWS_REGION="us-east-1"
export DOMAIN_NAME="example.com"
export APP_HOST="app.${DOMAIN_NAME}"
export API_HOST="api.${DOMAIN_NAME}"
# Set after: aws sts get-caller-identity
export AWS_ACCOUNT_ID="REPLACE_ME"
export ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/survival-go-backend"
export S3_BUCKET="survival-go-app-prod-${AWS_ACCOUNT_ID}"
export IMAGE_TAG="$(date +%Y%m%d-%H%M)"
```

---

## Part 3 — AWS account login and IAM (the part that confuses everyone)

### 3.1 Log into the AWS Console (browser)

1. Open https://console.aws.amazon.com/
2. Sign in with the **email/password for the AWS account** (this is the “root” login for a new personal account).
3. Top-right: confirm you are in region **US East (N. Virginia) / us-east-1** (click the region dropdown).

**Root vs IAM:** For day-to-day work you should **not** use root. Root is only needed briefly to create your first IAM deployer user (unless your org uses IAM Identity Center / SSO).

### 3.2 Create the deployer IAM user (Console — do this once)

**Where:** AWS Console → search bar → **IAM** → left menu **Users** → **Create user**

1. **User name:** `survival-go-deployer`
2. **Do not** enable console access unless you want a second password; CLI-only is enough for this guide.
3. **Permissions:** attach **one** custom policy (next subsection). Do **not** attach `AdministratorAccess` unless you accept full account risk.
4. After create: open the user → **Security credentials** → **Create access key** → choose **Command Line Interface (CLI)** → create → **download the CSV** (you only see the secret once).

You now have:

- `AWS_ACCESS_KEY_ID` (starts with `AKIA...`)
- `AWS_SECRET_ACCESS_KEY`

### 3.3 Deployer policy — least privilege that still works for day zero

**Where:** IAM → **Policies** → **Create policy** → **JSON** tab → paste → name: `SurvivalGoDeployerPolicy` → create → attach to `survival-go-deployer`.

Replace `<ACCOUNT_ID>` with your 12-digit account id (Console top-right “Account” menu, or after CLI login).

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "StsIdentity",
      "Effect": "Allow",
      "Action": "sts:GetCallerIdentity",
      "Resource": "*"
    },
    {
      "Sid": "EcrAuth",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "EcrRepo",
      "Effect": "Allow",
      "Action": [
        "ecr:CreateRepository",
        "ecr:DescribeRepositories",
        "ecr:BatchGetImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage"
      ],
      "Resource": "arn:aws:ecr:*:<ACCOUNT_ID>:repository/survival-go-backend"
    },
    {
      "Sid": "Ecs",
      "Effect": "Allow",
      "Action": [
        "ecs:*",
        "ec2:Describe*",
        "ec2:CreateSecurityGroup",
        "ec2:AuthorizeSecurityGroupIngress",
        "ec2:AuthorizeSecurityGroupEgress",
        "ec2:CreateTags",
        "elasticloadbalancing:*",
        "logs:CreateLogGroup",
        "logs:PutRetentionPolicy",
        "logs:DescribeLogGroups",
        "iam:CreateServiceLinkedRole",
        "iam:GetRole",
        "iam:ListRoles"
      ],
      "Resource": "*"
    },
    {
      "Sid": "PassRoleToEcsOnly",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": [
        "arn:aws:iam::<ACCOUNT_ID>:role/survival-go-ecs-task-execution-role",
        "arn:aws:iam::<ACCOUNT_ID>:role/survival-go-ecs-task-role"
      ],
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "ecs-tasks.amazonaws.com"
        }
      }
    },
    {
      "Sid": "S3FrontendBucket",
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:ListBucket",
        "s3:GetBucketLocation",
        "s3:GetBucketPolicy",
        "s3:PutBucketPolicy",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:PutPublicAccessBlock"
      ],
      "Resource": [
        "arn:aws:s3:::survival-go-app-prod-*",
        "arn:aws:s3:::survival-go-app-prod-*/*"
      ]
    },
    {
      "Sid": "CloudFrontAcm",
      "Effect": "Allow",
      "Action": [
        "cloudfront:*",
        "acm:RequestCertificate",
        "acm:DescribeCertificate",
        "acm:ListCertificates",
        "acm:DeleteCertificate",
        "acm:AddTagsToCertificate"
      ],
      "Resource": "*"
    }
  ]
}
```

**If something fails with `AccessDenied`:** note the **exact** action from the error message, add that action to the policy (scoped if possible), try again. After the first successful deploy, use IAM **Access Advisor** on the policy to remove unused actions.

**Bootstrap escape hatch (only if you are stuck for hours):** temporarily attach `PowerUserAccess` to `survival-go-deployer`, finish this runbook once, then replace with the custom policy above and remove `PowerUserAccess`.

### 3.4 Create ECS roles (Console — before ECS service)

ECS needs two **roles** (not users). You create them in IAM → **Roles**.

#### Role A — Task execution role (required)

1. IAM → **Roles** → **Create role**
2. **Trusted entity type:** AWS service
3. **Use case:** Elastic Container Service → **Elastic Container Service Task**
4. **Role name:** `survival-go-ecs-task-execution-role`
5. **Permissions:** attach AWS managed policy **`AmazonECSTaskExecutionRolePolicy`**
6. Create role

This role lets ECS pull your image from ECR and send stdout to CloudWatch Logs. Your deployer user does **not** use this role; only ECS does.

#### Role B — Task role (required name, optional permissions)

1. IAM → **Roles** → **Create role**
2. Same trusted entity: **ECS Task**
3. **Role name:** `survival-go-ecs-task-role`
4. **Permissions:** attach **no** policies (Survival Go MVP does not call AWS APIs from Python at runtime)
5. Create role

When you create the ECS **task definition** later, you will select:

- **Task execution role:** `survival-go-ecs-task-execution-role`
- **Task role:** `survival-go-ecs-task-role`

### 3.5 Configure AWS CLI on **this** computer (you were not logged in — that's OK)

```bash
aws configure
```

Prompts:

| Prompt | What to enter |
|--------|----------------|
| AWS Access Key ID | From CSV for `survival-go-deployer` |
| AWS Secret Access Key | From CSV |
| Default region name | `us-east-1` |
| Default output format | `json` |

Credentials are stored in `~/.aws/credentials` under profile `[default]` unless you chose another name.

**Verify login works:**

```bash
aws sts get-caller-identity
```

**Expected output** (shape matters, numbers differ):

```json
{
    "UserId": "AIDA....",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/survival-go-deployer"
}
```

If you see `Unable to locate credentials` → run `aws configure` again.

If you see `InvalidClientTokenId` → wrong access key or typo in secret.

If you see `AccessDenied` on later commands → fix deployer policy (§3.3).

**Set account id in your shell file:**

```bash
export AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
echo "$AWS_ACCOUNT_ID"
```

---

## Part 4 — Backend image registry and first push

All commands from repo root unless noted.

### 4.1 Create ECR repository

```bash
source ~/survival-go-deploy.env   # or export vars manually

aws ecr create-repository \
  --repository-name survival-go-backend \
  --region "$AWS_REGION"
```

If it already exists, `RepositoryAlreadyExistsException` is fine.

### 4.2 Log Docker into ECR

```bash
aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin \
  "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
```

Expected: `Login Succeeded`

### 4.3 Build and push (slow first time — downloads KataGo + model)

```bash
export IMAGE_TAG="$(date +%Y%m%d-%H%M)"
export ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/survival-go-backend"

ECR_REGISTRY="$ECR_REGISTRY" IMAGE_TAG="$IMAGE_TAG" ./scripts/build_backend_image.sh
docker tag "survival-go-backend:${IMAGE_TAG}" "${ECR_REGISTRY}:${IMAGE_TAG}"
docker push "${ECR_REGISTRY}:${IMAGE_TAG}"
```

**Checkpoint:**

```bash
aws ecr describe-images \
  --repository-name survival-go-backend \
  --region "$AWS_REGION" \
  --query 'imageDetails[0].imageTags'
```

You should see your `IMAGE_TAG`.

**Write down** `ECR_REGISTRY` and `IMAGE_TAG` — you need them for the ECS task definition.

Image env paths (already in image; set again on ECS task):

| Variable | Value |
|----------|--------|
| `KATAGO_BINARY_PATH` | `/opt/katago/katago` |
| `KATAGO_CONFIG_PATH` | `/app/third_party/katago/analysis.docker.cfg` |
| `KATAGO_MODEL_PATH` | `/opt/katago/kata1-b20c256x2-s4384473088-d968438914.bin.gz` |
| `KATAGO_ANALYSIS_TIMEOUT_SECONDS` | `60` |
| `KATAGO_TOP_N` | `8` |
| `SURVIVAL_THRESHOLD` | `0.95` |
| `CORS_ALLOW_ORIGINS` | `https://app.<your-domain>` (replace domain) |

---

## Part 5 — Network, load balancer, and ECS (API)

You can do this in the Console (recommended first time) or CLI. Below is **Console-first** with exact navigation.

### 5.1 VPC and subnets

**Easiest path — default VPC:**

1. Console → **VPC** → **Your VPCs**
2. If a **default VPC** exists (marked default), note its **VPC ID** and two **public subnets** in different Availability Zones (VPC → **Subnets**, filter by that VPC, “Auto-assign public IP” = Yes).

**If you have no default VPC:** VPC → **Create VPC** → **VPC and more** → name `survival-go-vpc` → 2 AZs → public subnets only → create. Use those subnet IDs below.

Write down:

- `VPC_ID`
- `SUBNET_ID_1`, `SUBNET_ID_2` (public, different AZs)

### 5.2 Security groups

**Console → VPC → Security groups → Create security group**

#### SG 1 — ALB (`survival-go-alb-sg`)

- VPC: your VPC
- **Inbound rules:**
  - HTTP 80 from `0.0.0.0/0`
  - HTTPS 443 from `0.0.0.0/0`
- **Outbound:** all traffic (default)

Note `ALB_SG_ID`.

#### SG 2 — ECS tasks (`survival-go-ecs-sg`)

- VPC: same VPC
- **Inbound:**
  - Custom TCP **8000**, source = **security group** `survival-go-alb-sg` (not 0.0.0.0/0)
- **Outbound:** all traffic

Note `ECS_SG_ID`.

### 5.3 CloudWatch log group

**Console → CloudWatch → Log groups → Create**

- Name: `/ecs/survival-go-api`
- Retention: 30 days (optional)

### 5.4 Target group (for ALB → container)

**Console → EC2 → Target groups → Create**

| Field | Value |
|-------|--------|
| Target type | IP addresses |
| Name | `survival-go-api-tg` |
| Protocol | HTTP |
| Port | 8000 |
| VPC | your VPC |
| Health check path | `/health` |
| Healthy threshold | 2 |
| Interval | 30 s |

Create → note `TARGET_GROUP_ARN`.

### 5.5 Application Load Balancer

**Console → EC2 → Load balancers → Create → Application Load Balancer**

| Field | Value |
|-------|--------|
| Name | `survival-go-api-alb` |
| Scheme | Internet-facing |
| IP address type | IPv4 |
| VPC | your VPC |
| Subnets | both public subnets |
| Security group | `survival-go-alb-sg` |
| Listener | HTTP :80 (temporary; HTTPS added after ACM) |

Create → copy **DNS name** (e.g. `survival-go-api-alb-123.us-east-1.elb.amazonaws.com`) → this is `ALB_DNS_NAME`.

**Register targets later:** ECS service creation will attach tasks to the target group automatically if you wire it in the service wizard.

### 5.6 ECS cluster

**Console → ECS → Clusters → Create cluster**

- Name: `survival-go`
- Infrastructure: **AWS Fargate (serverless)**
- Create

### 5.7 ECS task definition

**Console → ECS → Task definitions → Create**

| Section | Value |
|---------|--------|
| Family | `survival-go-api` |
| Launch type | Fargate |
| OS/Arch | Linux / X86_64 |
| Task size CPU | 2 vCPU (2048) |
| Task size Memory | 4 GB (4096) |
| Task execution role | `survival-go-ecs-task-execution-role` |
| Task role | `survival-go-ecs-task-role` |

**Container:**

| Field | Value |
|-------|--------|
| Name | `api` |
| Image URI | `${ECR_REGISTRY}:${IMAGE_TAG}` (paste real values) |
| Port | 8000 TCP |
| Environment | all `KATAGO_*`, `SURVIVAL_THRESHOLD`, `CORS_ALLOW_ORIGINS` from §4.3 |
| Log configuration | `awslogs` → group `/ecs/survival-go-api` → stream prefix `ecs` |
| Health check (optional) | CMD curl localhost:8000/health or rely on ALB |

Create task definition revision.

### 5.8 ECS service

**Console → ECS → Clusters → `survival-go` → Create service**

| Field | Value |
|-------|--------|
| Launch type | Fargate |
| Task definition | `survival-go-api` (latest) |
| Service name | `survival-go-api` |
| Desired tasks | 1 |
| VPC / subnets | your VPC, **public subnets** (for MVP simplicity) |
| Security group | `survival-go-ecs-sg` |
| Public IP | **Turn ON** (required if tasks are in public subnets without NAT) |
| Load balancer | Application Load Balancer → existing `survival-go-api-alb` |
| Listener | HTTP :80 → forward to `survival-go-api-tg` |
| Target group | `survival-go-api-tg` |
| Health check grace period | 120 seconds (KataGo boot is slow) |

Create service → wait until **Running** and target is **healthy**.

**Checkpoint (before DNS/TLS):**

```bash
# Replace with your ALB DNS name
curl -sS "http://survival-go-api-alb-XXXX.us-east-1.elb.amazonaws.com/health"
```

Expected JSON includes `"status":"ok"`.

```bash
curl -sS "http://ALB_DNS_NAME/api/presets" | head
```

If target is **unhealthy**: ECS → service → **Logs** (CloudWatch) — common causes: wrong image URI, task cannot pull from ECR (execution role), app crash on startup (KataGo paths).

---

## Part 6 — TLS certificates (ACM) — two certificates, two places

| Certificate for | Request in ACM region | Used by |
|-----------------|----------------------|---------|
| `api.<domain>` | **Same as ECS** (`us-east-1` if ECS is there) | ALB HTTPS listener |
| `app.<domain>` | **Must be us-east-1** for CloudFront | CloudFront alternate domain |

### 6.1 Request `api` certificate

**Console → Certificate Manager** (region = **us-east-1**) → **Request certificate**

- Public certificate
- Domain: `api.example.com`
- Validation: **DNS validation**
- Create

Open certificate → **Domains** → copy **CNAME name** and **CNAME value** → add both in **Namecheap → Domain → Advanced DNS** (see Part 8).

Wait until status **Issued** (5–30 minutes, sometimes longer).

### 6.2 Add HTTPS listener on ALB

**EC2 → Load balancers → your ALB → Listeners → Add listener**

- HTTPS :443
- Default action: forward to `survival-go-api-tg`
- Certificate: select `api.example.com` ACM cert
- Security policy: default recommended

**Edit HTTP :80 listener** → redirect to HTTPS 443.

**Checkpoint:**

```bash
curl -sS "https://api.example.com/health"
```

(Only works after DNS points to ALB — Part 8.)

### 6.3 Request `app` certificate (CloudFront)

Still in **ACM us-east-1** (even if ECS were elsewhere):

- Request certificate for `app.example.com`
- DNS validation → add CNAMEs in Namecheap
- Wait for **Issued**

---

## Part 7 — Frontend (S3 + CloudFront)

### 7.1 Create S3 bucket

**Console → S3 → Create bucket**

| Field | Value |
|-------|--------|
| Name | `survival-go-app-prod-<ACCOUNT_ID>` (globally unique) |
| Region | `us-east-1` |
| Block all public access | **On** (CloudFront will access via OAC, not public bucket) |

### 7.2 Build frontend locally

```bash
cd /path/to/survival-go
export VITE_API_BASE_URL="https://${API_HOST}"
./scripts/build_frontend.sh
```

### 7.3 Publish to S3

```bash
export S3_BUCKET="survival-go-app-prod-${AWS_ACCOUNT_ID}"
export AWS_REGION="us-east-1"
./scripts/publish_frontend_s3.sh
```

### 7.4 CloudFront distribution

**Console → CloudFront → Create distribution**

| Field | Value |
|-------|--------|
| Origin | S3 bucket (pick your bucket) |
| Origin access | **Origin access control (OAC)** — create new OAC if prompted |
| Viewer protocol policy | Redirect HTTP to HTTPS |
| Alternate domain name (CNAME) | `app.example.com` |
| Custom SSL certificate | Select ACM cert for `app.example.com` (**us-east-1**) |
| Default root object | `index.html` |

After create, CloudFront shows a policy snippet — **apply it to the S3 bucket** (button in UI: “Copy policy” → S3 bucket permissions).

**SPA routing (required for React):**

CloudFront → your distribution → **Error pages** → Create custom error response:

- HTTP error code: **403** and repeat for **404**
- Response page path: `/index.html`
- HTTP response code: **200**

Or use a CloudFront Function / Lambda@Edge later; error page trick is enough for MVP.

Note **Distribution domain name** (e.g. `d111111abcdef8.cloudfront.net`) → `CLOUDFRONT_DOMAIN`.

Optional invalidation after each deploy:

```bash
export CLOUDFRONT_DISTRIBUTION_ID="E1234567890ABC"
aws cloudfront create-invalidation \
  --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --paths "/*"
```

(`publish_frontend_s3.sh` can do this if `CLOUDFRONT_DISTRIBUTION_ID` is set.)

---

## Part 8 — Namecheap DNS (all records in one place)

**Namecheap → Domain List → Manage → Advanced DNS**

Add records (Host is the subdomain part only):

| Type | Host | Value | TTL | Purpose |
|------|------|-------|-----|---------|
| CNAME | (from ACM) | (from ACM) | Automatic | Validate `api` cert |
| CNAME | (from ACM) | (from ACM) | Automatic | Validate `app` cert |
| CNAME | `api` | `survival-go-api-alb-....elb.amazonaws.com` | Automatic | Point API to ALB |
| CNAME | `app` | `d111111abcdef8.cloudfront.net` | Automatic | Point app to CloudFront |

**Do not** use A records for ALB/CloudFront unless AWS docs say otherwise — CNAME to the AWS-provided hostname is correct for this setup.

Wait 5–60 minutes, then:

```bash
dig +short api.example.com
dig +short app.example.com
```

### 8.1 Final smoke tests

```bash
export API_BASE_URL="https://${API_HOST}"
python3 scripts/smoke_deploy.py --api-base-url "$API_BASE_URL"
```

Optional (KataGo, slower):

```bash
SMOKE_TIMEOUT_SECONDS=90 \
  python3 scripts/smoke_deploy.py --api-base-url "$API_BASE_URL" --with-analyze
```

Browser:

1. Open `https://app.example.com`
2. Presets load
3. Start game → play one move → engine responds

If presets fail in browser but smoke passes: check `CORS_ALLOW_ORIGINS` on ECS task matches `https://app.example.com` exactly (no trailing slash).

---

## Part 9 — Releases after day zero

```bash
source ~/survival-go-deploy.env
./scripts/run_tests.sh release

export IMAGE_TAG="$(date +%Y%m%d-%H%M)"
# build + push image (§4.3)
# Console: ECS → task definition → new revision with new image tag
# Console: ECS → service → Update → force new deployment

VITE_API_BASE_URL="https://${API_HOST}" ./scripts/build_frontend.sh
./scripts/publish_frontend_s3.sh
python3 scripts/smoke_deploy.py --api-base-url "https://${API_HOST}"
```

Or orchestrated:

```bash
API_BASE_URL="https://${API_HOST}" \
VITE_API_BASE_URL="https://${API_HOST}" \
S3_BUCKET="$S3_BUCKET" \
ECR_REGISTRY="$ECR_REGISTRY" \
IMAGE_TAG="$IMAGE_TAG" \
CLOUDFRONT_DISTRIBUTION_ID="$CLOUDFRONT_DISTRIBUTION_ID" \
./scripts/deploy_cloud.sh
```

(ECS service still updated manually in MVP when only the image tag changes.)

---

## Part 10 — Rollback

1. ECS → service → task definition → roll back to previous revision → **Update service** → force deployment.
2. Re-publish previous `frontend/dist` from git tag or local backup; invalidate CloudFront.
3. Re-run smoke script.

---

## Appendix A — Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `Unable to locate credentials` | CLI not configured on this machine | `aws configure` with deployer keys (§3.5) |
| `InvalidClientTokenId` | Wrong key/secret | Create new access key for deployer user |
| `AccessDenied` on `ecs:CreateService` | Deployer policy too narrow | Add action from error or temporary `PowerUserAccess` (§3.3) |
| `AccessDenied` on `iam:PassRole` | PassRole not scoped to ECS roles | Fix policy `PassRoleToEcsOnly` ARNs; roles must exist with exact names |
| ECR push 403 | Wrong login or no ECR permissions | Re-run `docker login` (§4.2); check ECR policy |
| ECS task stops immediately | Bad image, env, or OOM | CloudWatch log group `/ecs/survival-go-api` |
| Target unhealthy | App not listening on 8000 or slow start | Increase health grace; check logs |
| `curl https://api...` fails, HTTP works | DNS or cert not ready | Wait for ACM Issued; check Namecheap CNAME |
| Browser CORS error | `CORS_ALLOW_ORIGINS` mismatch | ECS task env must be `https://app.<domain>` |
| CloudFront 403 on refresh | No SPA fallback | §7.4 error pages → `index.html` |

---

## Appendix B — IAM quick reference (what goes where)

```text
YOU (laptop)
  aws configure  -->  IAM User: survival-go-deployer
                        Policy: SurvivalGoDeployerPolicy

ECS (AWS service)
  Task execution role: survival-go-ecs-task-execution-role
                        Managed: AmazonECSTaskExecutionRolePolicy

  Task role:           survival-go-ecs-task-role
                        (no policies for MVP)
```

**Never** put your personal access keys on the ECS task definition. **Never** use the ECS task role for local `aws` CLI commands.

---

## Appendix C — Order checklist (print this)

- [ ] Local: Docker, AWS CLI, repo tests
- [ ] IAM user `survival-go-deployer` + policy + access key
- [ ] IAM roles: execution + task
- [ ] `aws configure` + `aws sts get-caller-identity` works
- [ ] ECR repo + image push
- [ ] VPC + 2 public subnets + 2 security groups
- [ ] CloudWatch log group
- [ ] Target group + ALB (HTTP OK)
- [ ] ECS cluster + task definition + service (healthy target)
- [ ] ACM `api` cert + ALB HTTPS listener
- [ ] S3 bucket + frontend build/publish
- [ ] CloudFront + OAC + SPA error pages
- [ ] ACM `app` cert on distribution
- [ ] Namecheap: validation CNAMEs + `api` + `app` CNAMEs
- [ ] `smoke_deploy.py` + browser UF-1 flow
