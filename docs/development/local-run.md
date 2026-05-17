# Local run (first app version)

Use this guide to run the Survival KataGo web app on your machine and confirm the MVP works end to end: presets, human moves, engine moves, and Survival metrics in the UI.

## What you will validate

| Area | Pass criteria |
|------|----------------|
| Backend | `GET /health` returns `{"status":"ok",...}` |
| KataGo | Integration smoke test passes (real subprocess + ownership) |
| Frontend | Presets load; board renders; moves and engine controls work |
| Gameplay | Complete at least one human/engine turn pair (UF-1 or UF-2) |
| Metrics | After **Engine move** or **Analyze position**, UI shows unresolved count and min black probability (UF-3) |

User scenarios are defined in `specification.md` (UF-1–UF-4). This doc focuses on setup and a short manual checklist.

## Optional: Docker Compose

To run backend + frontend + KataGo in containers (no local Python/Node/KataGo install), see **[docker-compose.md](docker-compose.md)**. Open http://127.0.0.1:8080/ after `docker compose up --build`.

## Prerequisites

- **Python 3.12** (matches CI; 3.11+ should work)
- **Node.js 18+** and **npm** (for the Vite frontend)
- **WSL2 or Linux** with **curl** (for KataGo setup)
- Disk space for KataGo binary + model (~100 MB under `third_party/katago/`)

## One-time setup

### 1. Python environment

From the repo root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. KataGo (engine)

Install binary, analysis config, and model, then write `.env`:

```bash
./scripts/setup_katago.sh
```

Details, manual install, and troubleshooting: [katago-wsl-linux.md](katago-wsl-linux.md).

Confirm paths in `.env` (or copy from `.env.example` and set absolute paths). Variable reference and production-safe defaults: [environment.md](environment.md).

- `KATAGO_BINARY_PATH`
- `KATAGO_CONFIG_PATH`
- `KATAGO_MODEL_PATH`

### 3. Frontend dependencies

```bash
cd frontend && npm install && cd ..
```

(`scripts/run_frontend.sh` runs `npm install` automatically if `node_modules` is missing.)

## Verify before starting servers

Activate the venv, then run checks from the repo root:

```bash
source .venv/bin/activate

# Unit + integration (integration uses real KataGo when .env is set)
./scripts/run_tests.sh fast

# Optional: full gate used in CI
./scripts/run_tests.sh all
```

KataGo-only smoke:

```bash
pytest tests/integration/test_katago_smoke.py -m integration -v
```

Quick binary check:

```bash
third_party/katago/katago version
```

## Start the app

Use **two terminals**, both from the repo root, with the venv activated.

**Terminal 1 — backend** (port 8000):

```bash
source .venv/bin/activate
./scripts/run_backend.sh
```

**Terminal 2 — frontend** (port 5173, proxies `/api` and `/health` to the backend):

```bash
./scripts/run_frontend.sh
```

Health check (backend direct or via Vite proxy):

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:5173/health
```

Open the UI: **http://127.0.0.1:5173/**

## Manual validation checklist

### Setup (UF-4)

1. Page title **Survival KataGo** loads; presets appear (not “Could not load presets”).
2. Choose a preset (e.g. **balanced**) and your color (**White** or **Black**). White always plays first in the preset position; if you choose Black, the engine plays White’s opening move automatically.
3. Start the game; a **game id** and board appear.

### Play a turn (UF-1 or UF-2)

4. Click a point on the board **or** enter a GTP coordinate (e.g. `D4`) and click **Submit move**.
5. Click **Engine move**; the board updates with the engine’s reply.
6. Under **Position analysis**, confirm **Unresolved points** and **Min black probability** updated (UF-3).
7. If candidates are returned, a **Candidate comparison** table lists alternative moves with survival scores.

Optional: click **Analyze position** without playing a move to refresh metrics only.

### API-only smoke (no browser)

With the backend running:

```bash
# List presets
curl -s http://127.0.0.1:8000/api/presets | python3 -m json.tool

# Create game (adjust preset_id / human_side as needed)
GAME_ID=$(curl -s -X POST http://127.0.0.1:8000/api/games \
  -H 'Content-Type: application/json' \
  -d '{"preset_id":"balanced","human_side":"W"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['game_id'])")

curl -s "http://127.0.0.1:8000/api/games/$GAME_ID" | python3 -m json.tool

# Human move then engine move (example coordinates; use legal moves for your position)
curl -s -X POST "http://127.0.0.1:8000/api/games/$GAME_ID/move" \
  -H 'Content-Type: application/json' \
  -d '{"move":"D4"}'

curl -s -X POST "http://127.0.0.1:8000/api/games/$GAME_ID/engine-move" | python3 -m json.tool
```

## Stop

- `Ctrl+C` in each terminal running backend and frontend.
- Games are in-memory only; restarting the backend clears active sessions.

## Shared KataGo engine and sessions

The backend keeps **one** KataGo process for all games. Concurrent analyze/engine-move calls **queue**; only one query runs at a time. See [shared-katago-engine.md](shared-katago-engine.md) for queue timeouts, RAM (one model load), and when game state is freed.

| What you do | What the server does |
|-------------|----------------------|
| **New game** in the UI | `DELETE /api/games/{id}` then `POST /api/games` |
| **Close the browser tab** | Nothing — idle game stays in memory |
| **Restart backend** | All games cleared; KataGo stops |

To drop a session without starting a new game:

```bash
curl -X DELETE "http://127.0.0.1:8000/api/games/$GAME_ID"
```

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| Presets fail to load | Backend running on 8000; `curl http://127.0.0.1:8000/api/presets` |
| Engine move / analyze errors | `.env` KataGo paths; run KataGo smoke test; see [katago-wsl-linux.md](katago-wsl-linux.md) |
| Backend exits on start | Missing or invalid `KATAGO_*` in `.env` (pydantic validates at startup) |
| Frontend install issues | Node/npm version; delete `frontend/node_modules` and run `npm install` again |
| Slow engine responses | Increase `KATAGO_ANALYSIS_TIMEOUT_SECONDS` in `.env`; lower threads in `analysis.cfg` |
| `pytest: cannot execute: required file not found` | `.venv` was copied from another path; recreate it (see below) |

### Broken virtualenv after copy or rename

If `pytest`, `uvicorn`, or `./scripts/run_tests.sh` fail with **required file not found**, console scripts in `.venv/bin/` still point at an old interpreter path (e.g. another repo). Recreate the venv from the repo root:

```bash
deactivate 2>/dev/null || true
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

`./scripts/run_tests.sh` and `./scripts/run_backend.sh` call `python -m pytest` / `python -m uvicorn` so they work even before you recreate the venv, as long as `.venv/bin/python` itself is valid.

## Related docs

- [Release checklist](release-checklist.md) (lint, types, unit, integration, e2e before tag/deploy)
- [Docker Compose packaging](docker-compose.md)
- [Shared KataGo engine](shared-katago-engine.md)
- [KataGo WSL/Linux setup](katago-wsl-linux.md)
- [Test commands](../../tests/README.md) and `./scripts/run_tests.sh help`
- [Architecture](../architecture.md)
