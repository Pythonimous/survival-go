# KataGo local setup (WSL / Linux)

The backend runs KataGo as an **analysis subprocess** (`katago analysis -config … -model …`). You need three files on disk and three environment variables pointing at them.

## Prerequisites

- **WSL2** or native Linux (tested on Ubuntu 24.04 LTS / noble).
- **curl** and **python3** (used to download and extract the release zip if `unzip` is missing).
- Python project venv with test dependencies (`pip install -r requirements.txt`).

## Automated setup (recommended)

From the repo root:

```bash
./scripts/setup_katago.sh
```

This installs into `third_party/katago/` (gitignored artifacts except `analysis.cfg`):

| Artifact | Default | Purpose |
|----------|---------|---------|
| Binary | `third_party/katago/katago` | KataGo **v1.16.4** `eigenavx2` CPU build |
| Config | `third_party/katago/analysis.cfg` | Analysis-engine settings (checked into git) |
| Model | `third_party/katago/kata1-b20c256x2-s4384473088-d968438914.bin.gz` | Compatible kata1 network (~83 MB) |

On first run the script writes **`.env`** with absolute `KATAGO_*` paths. Copy from `.env.example` if you prefer to create it yourself.

### Optional installer overrides

```bash
KATAGO_VERSION=1.16.4          # default; use 1.16.4+ on Ubuntu 24.04
KATAGO_BUILD=eigenavx2           # CPU build with AVX2 (or eigen without AVX2)
KATAGO_MODEL_NAME=other.bin.gz   # any kata1 .bin.gz from katagotraining.org
KATAGO_INSTALL_DIR=/path/to/dir  # default: repo/third_party/katago
```

## Required environment variables

| Variable | Description |
|----------|-------------|
| `KATAGO_BINARY_PATH` | Executable `katago` file |
| `KATAGO_CONFIG_PATH` | Analysis config (`.cfg`) |
| `KATAGO_MODEL_PATH` | Neural network (`.bin.gz`) |

Optional tuning (defaults in `backend/app/config.py`):

- `SURVIVAL_THRESHOLD` (default `0.95`)
- `KATAGO_TOP_N` (default `8`)
- `KATAGO_ANALYSIS_TIMEOUT_SECONDS` (default `30`)

Pydantic loads `.env` from the repo root when the backend or tests run there.

## Verify installation

**1. Binary runs**

```bash
third_party/katago/katago version
```

Expect a version line (e.g. `KataGo v1.16.4`) and `Using Eigen(CPU) backend`.

**2. Smoke integration test**

```bash
source .venv/bin/activate
pytest tests/integration/test_katago_smoke.py -m integration -v
```

Pass criteria: subprocess stays up, empty-board analysis returns **361** ownership values in `[0, 1]`.

**3. Backend health** (after other setup)

```bash
./scripts/run_backend.sh
curl http://127.0.0.1:8000/health
```

## What each file does

### `analysis.cfg`

Shipped at `third_party/katago/analysis.cfg`. Tuned for **CPU / single-query** dev work:

- `numAnalysisThreads = 1`
- `numSearchThreadsPerAnalysisThread = 2`

For heavier analysis later, see [KataGo’s analysis example config](https://github.com/lightvector/KataGo/blob/master/cpp/configs/analysis_example.cfg) and increase threads gradually.

The backend always runs **one** shared analysis subprocess for all games; see [shared-katago-engine.md](shared-katago-engine.md) for queueing, RAM, and session lifecycle.

For Docker or a small shared host (light concurrent load), use `third_party/katago/analysis.docker.cfg` and see [katago-docker.md](katago-docker.md).

### Neural network (`.bin.gz`)

Must be a **kata1** network in `.bin.gz` format from [katagotraining.org/networks](https://katagotraining.org/networks/). The default model is smaller than current “best” nets but fast enough for smoke tests and local iteration.

### Binary

Must support the `analysis` subcommand. This project does **not** use GTP mode for the MVP client.

## Manual setup

If you already have KataGo installed:

1. Ensure `katago analysis -help` or `katago version` works.
2. Point `KATAGO_CONFIG_PATH` at an analysis config (start from `third_party/katago/analysis.cfg` or upstream `analysis_example.cfg`).
3. Download a `.bin.gz` model and set `KATAGO_MODEL_PATH`.
4. Create `.env` from `.env.example` with **absolute** paths.

## Troubleshooting

### `libzip.so.5` / `libssl.so.1.1` not found

Common on **Ubuntu 22.04+** and **24.04** with **KataGo ≤ 1.15.x** builds. Fix:

- Re-run setup so you get **v1.16.4+** (default in `scripts/setup_katago.sh`), or
- Set `KATAGO_VERSION=1.16.4` and remove the old binary/zip under `third_party/katago/`, then run the script again.

Avoid installing legacy OpenSSL 1.1 packages unless you have a strong reason; newer KataGo releases target current distros.

### `unzip: command not found`

The setup script falls back to `python3 -m zipfile`. If extraction still fails, install `unzip` or extract the release zip manually into `third_party/katago/` so `katago` is executable.

### Smoke test skipped

Message: *“Real KataGo not configured…”*

- Run `./scripts/setup_katago.sh` or set all three `KATAGO_*` variables.
- Paths must exist, and the binary must be executable.

### `KataGo stdout closed before analysis completed`

Usually the process crashed on startup. Check:

```bash
third_party/katago/katago analysis \
  -config third_party/katago/analysis.cfg \
  -model third_party/katago/<your-model>.bin.gz
```

Read stderr for config/model mismatch or missing libraries.

### `timed out waiting for KataGo analysis response`

- Increase `KATAGO_ANALYSIS_TIMEOUT_SECONDS` in `.env`.
- Lower thread counts in `analysis.cfg` if the machine is overloaded.
- Try a smaller network for faster CPU inference.

### Unit tests fail after adding `.env`

Tests that expect **missing** env vars use `Settings(_env_file=None)` or an empty temp directory so your local `.env` does not mask failures. Integration tests intentionally use real paths from `.env` when present.

### Wrong model / config pairing

Symptoms: immediate exit, parse errors, or nonsense ownership. Use a **kata1** `.bin.gz` with a recent KataGo binary; keep `analysis.cfg` in analysis-engine format (not GTP-only configs).

## Further reading

- [KataGo Analysis Engine](https://github.com/lightvector/KataGo/blob/master/docs/Analysis_Engine.md)
- [KataGo releases](https://github.com/lightvector/KataGo/releases)
- [kata1 networks](https://katagotraining.org/networks/)
