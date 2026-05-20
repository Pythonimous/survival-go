# survival-go

Local-first web prototype for a Go training variant built around **total board ownership**. Black aims to own every point on the board; White aims to keep at least one point from full Black control. The engine is **KataGo**, run as an ONNX export inside the user's browser via `onnxruntime-web`; the Python backend is the source of truth for game state, rules, API contracts, and Survival analysis semantics.

The objective shaping is intentionally simple and directional: evaluate each candidate move by the board's weakest ownership point for Black (`min p_black`). If the engine is playing Black, it picks moves that raise that floor (fix the weakest point first); if it is playing White, it picks moves that lower the same floor (make Black's weakest point even weaker). This reframes move choice around a single bottleneck metric, which lets the project repurpose a strong general Go model for Survival Go behavior **without retraining** — KataGo's policy and ownership are wrapped and reranked, not relearned.

In addition to ownership-driven Survival metrics, the project also uses komi-aware score signals (extreme-komi framing) where appropriate in browser-era ranking/evaluation, improving practical move quality under browser inference constraints.

**Audience:** Go players who want to practice killing and living with invasions when they do not have a practice partner.

## Quick Start

**Run the app locally:** full walkthrough in [`docs/development/local-run.md`](docs/development/local-run.md).

1. `python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
2. `cd frontend && npm install && cd ..`
3. Place the KataGo ONNX export(s) under `frontend/public/models/` — see [`onnx-model-artifacts.md`](docs/development/onnx-model-artifacts.md).
4. Terminal A: `./scripts/run_backend.sh` — Terminal B: `./scripts/run_frontend.sh`
5. Open http://127.0.0.1:5173/ — pick a preset, play a move, and confirm engine response plus metrics updates.

Verify: `./scripts/run_tests.sh fast` and `curl http://127.0.0.1:8000/health`.

**Docker Compose (optional):** `docker compose -f docker-compose.yml -f docker-compose.local.yml up --build` then open http://127.0.0.1:8080/ — see [`docs/development/docker-compose.md`](docs/development/docker-compose.md).

**E2E tests:** set `E2E_SERVER_COMMAND` to customize server startup; `E2E_SERVER_DISABLED=true` when tests manage their own server.

For quick local validation from repo root:

```bash
# Backend checks
./scripts/run_tests.sh fast
./scripts/run_tests.sh lint
./scripts/run_tests.sh types

# Frontend tests
cd frontend && npm test

# Full gate (includes E2E)
./scripts/run_tests.sh release
```

## Scaffold Overview

This repository includes:

- **Inference path:** Browser-side **KataGo via ONNX Runtime Web** is the only execution path. Capability probing picks `fp32` when viable and falls back to `uint8` for constrained runtimes; there is no server-side inference fallback.
- **Boundary contract:** TypeScript only encodes ONNX **model inputs** and transports **raw model outputs** (policy logits, ownership tensor, optional value head). All semantic interpretation — softmax over policy, ownership → `p_black`, Survival metrics, reranking, resignation — lives in Python (`backend/app/game_service.py`, `engine/`).
- **Survival reranking:** KataGo's top-N policy candidates are re-evaluated by Survival objective; difficulty controls (`max_visits`, `top_n`, `randomness`, `temperature`, `blunder_margin`, `variant_awareness`) shape the final pick. See [`survival-difficulty-model.md`](docs/development/survival-difficulty-model.md).
- **Komi-based framing:** Alongside ownership bottleneck metrics, score/komi signals are used to stabilize browser-side evaluation and candidate quality in practice.
- **Testing:** `./scripts/run_tests.sh` (or `make test-*`) for unit, integration, e2e, lint, and type checks; see `tests/README.md`. CI: `.github/workflows/ci.yml`. **Release gate:** [`docs/development/release-checklist.md`](docs/development/release-checklist.md) (`./scripts/run_tests.sh full` or `release`).
- **Linting & types:** `flake8` (including `max-complexity=10`) and `mypy` via `pytest -m lint` and project config.
- **Architecture:** Layered layout and boundaries described in `docs/architecture.md` (thin handlers, focused services).
- **Frontend organization:** React app is split into `features/` UI areas and `lib/` domain modules (`analysis`, `api`, `go`) with a shared `@/*` import alias.
- **User flows:** Journey templates under `docs/user_flows/`; log new flows in `docs/user_flows/index.md`.

## Core Idea

```text
Black wins if Black can eventually own/control 100% of the board (all 361 points on 19×19).
White wins if White can prevent Black from achieving 100% board ownership.
```

KataGo-derived ownership priors provide normal-Go signal; Survival logic reinterprets that signal for this asymmetric objective. The project centers on a local web app where a human can play either side against the engine.

## Go in 30 Seconds

In regular Go, players place black and white stones to surround empty areas ("territory") and to capture groups with no liberties (adjacent empty points). You usually win by having more total controlled points than your opponent, not by controlling every point on the board.

Survival Go changes that win condition. Black's target is absolute control (all 361 points on a 19x19 board), while White only needs to keep a single point from becoming Black-owned. That makes this project more like bottleneck defense/attack than standard score maximization: Black closes the last weak gaps, White keeps at least one gap alive.

## License

This repository is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE). The switch from MIT to AGPL-3.0-or-later is intentional: Survival Go incorporates and ports code from **Kaya**'s AGPL-3.0 `packages/ai-engine` ONNX stack.

**Kaya**, **KataGo**, **sgfmill**, **React**, **Shudan**, **onnxruntime-web**, and other dependencies are credited in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). KataGo/Kaya ONNX weights are downloaded separately and placed under `frontend/public/models/` — they are not shipped in git.

## References

- **Contributors and acknowledgments:** `CONTRIBUTORS.md`
- **Environment variables:** `docs/development/environment.md`
- **Local run:** `docs/development/local-run.md`
- **Browser inference design (KataGo via ONNX):** `docs/development/browser-inference-design.md`
- **ONNX model artifact variants (`fp32` / `uint8`):** `docs/development/onnx-model-artifacts.md`
- **Browser inference rollout/operations:** `docs/operations/browser-inference-rollout-runbook.md`
- **Survival difficulty model (reranking + glossary):** `docs/development/survival-difficulty-model.md`
- **Frontend source structure:** `docs/development/frontend-structure.md`
- **Docker Compose:** `docs/development/docker-compose.md`
- **AWS deploy (one VM + Docker Compose):** `docs/development/cloud-aws-zero-to-domain-runbook.md`
- **Cloud deployment topology (ECS + ALB + CDN):** `docs/development/cloud-aws-ecs-topology.md`
- **Cloud backend container (API image):** `docs/development/cloud-backend-container.md`
- **Cloud frontend static (S3 / API base URL / ONNX assets):** `docs/development/cloud-frontend-static.md`
- **Cloud env and sizing:** `docs/development/cloud-env-and-sizing.md`
- **Cloud deploy automation and smoke checks:** `docs/development/cloud-deploy-automation.md`
- **Release checklist:** `docs/development/release-checklist.md`
- Development workflow: `.github/instructions/development.instructions.md`
- Testing workflow: `.github/instructions/testing.instructions.md`
- Architecture: `docs/architecture.md`
- Prompt / command index: `docs/prompt_index.md`
- User flows: `docs/user_flows/`
- Cursor commands: `.cursor/commands/` (`make-specs.md`, `make-todo.md`, `continue-development`, `close-phase`)
