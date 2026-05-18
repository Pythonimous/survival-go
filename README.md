# survival-go

Local-first web prototype for a Go training variant built around **total board ownership**. Black aims to own every point on the board; White aims to keep at least one point from full Black control. The app wraps [KataGo](https://github.com/lightvector/KataGo) in analysis mode, extracts ownership estimates, and reranks moves with a custom Survival Go evaluator.

The objective shaping is intentionally simple and directional: evaluate each candidate move by the board's weakest ownership point for Black (`min p_black`). If the engine is playing Black, it picks moves that raise that floor (fix the weakest point first); if it is playing White, it picks moves that lower the same floor (make Black's weakest point even weaker). This reframes move choice around a single bottleneck metric, which lets the project repurpose a strong general model for Survival Go behavior without retraining.

**Audience:** Go players who want to practice killing and living with invasions when they do not have a practice partner.

## Quick Start

**Run the app locally:** full walkthrough in [`docs/development/local-run.md`](docs/development/local-run.md).

1. `python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
2. `./scripts/setup_katago.sh` (writes `.env` with `KATAGO_*` paths — see [KataGo setup](docs/development/katago-wsl-linux.md))
3. `cd frontend && npm install && cd ..`
4. Terminal A: `./scripts/run_backend.sh` — Terminal B: `./scripts/run_frontend.sh`
5. Open http://127.0.0.1:5173/ — pick a preset, play a move, request an engine move, confirm metrics update.

Verify: `./scripts/run_tests.sh fast` and `curl http://127.0.0.1:8000/health`.

**Docker Compose (optional):** `docker compose -f docker-compose.yml -f docker-compose.local.yml up --build` then open http://127.0.0.1:8080/ — see [`docs/development/docker-compose.md`](docs/development/docker-compose.md).

**E2E tests:** set `E2E_SERVER_COMMAND` to customize server startup; `E2E_SERVER_DISABLED=true` when tests manage their own server.

## Scaffold Overview

This repo started from a lightweight Python agent template. It includes:

- **Testing:** `./scripts/run_tests.sh` (or `make test-*`) for unit, integration, e2e, lint, and type checks; see `tests/README.md`. CI: `.github/workflows/ci.yml`. **Release gate:** [`docs/development/release-checklist.md`](docs/development/release-checklist.md) (`./scripts/run_tests.sh full` or `release`).
- **Linting & types:** `flake8` (including `max-complexity=10`) and `mypy` via `pytest -m lint` and project config.
- **Architecture:** Layered layout and boundaries described in `docs/architecture.md` (thin handlers, focused services).
- **User flows:** Journey templates under `docs/user_flows/`; log new flows in `docs/user_flows/index.md`.

## Core Idea

```text
Black wins if Black can eventually own/control 100% of the board (all 361 points on 19×19).
White wins if White can prevent Black from achieving 100% board ownership.
```

KataGo supplies normal-Go understanding and ownership predictions; the Survival evaluator reinterprets them for this asymmetric objective. The first milestone is a local web app where a human plays either side against the engine.

## Go in 30 Seconds

In regular Go, players place black and white stones to surround empty areas ("territory") and to capture groups with no liberties (adjacent empty points). You usually win by having more total controlled points than your opponent, not by controlling every point on the board.

Survival Go changes that win condition. Black's target is absolute control (all 361 points on a 19x19 board), while White only needs to keep a single point from becoming Black-owned. That makes this project more like bottleneck defense/attack than standard score maximization: Black closes the last weak gaps, White keeps at least one gap alive.

## License

This repository is licensed under the [MIT License](LICENSE). **KataGo** (MIT), **sgfmill**, **React**, **Shudan**, and other dependencies are credited in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). KataGo binaries and neural nets are downloaded separately at setup — they are not shipped in git.

## References

- **Environment variables:** `docs/development/environment.md`
- **AWS deploy (simple — one VM + Docker Compose):** `docs/development/cloud-aws-zero-to-domain-runbook.md`
- **Cloud deployment topology (ECS + ALB + CDN, later):** `docs/development/cloud-aws-ecs-topology.md`
- **Cloud backend container (ECR / KataGo wiring):** `docs/development/cloud-backend-container.md`
- **Cloud frontend static (S3 / API base URL):** `docs/development/cloud-frontend-static.md`
- **Cloud env, sizing, and KataGo timeouts:** `docs/development/cloud-env-and-sizing.md`
- **Cloud deploy automation and smoke checks:** `docs/development/cloud-deploy-automation.md`
- **Local run:** `docs/development/local-run.md`
- **Release checklist:** `docs/development/release-checklist.md`
- **Docker Compose:** `docs/development/docker-compose.md`
- **Shared KataGo engine (queueing, sessions):** `docs/development/shared-katago-engine.md`
- **KataGo (WSL / Linux):** `docs/development/katago-wsl-linux.md`
- Development workflow: `.github/instructions/development.instructions.md`
- Testing workflow: `.github/instructions/testing.instructions.md`
- Architecture: `docs/architecture.md`
- Prompt / command index: `docs/prompt_index.md`
- User flows: `docs/user_flows/`
- Cursor commands: `.cursor/commands/` (`make-specs.md`, `make-todo.md`, `continue-development`, `close-phase`)
