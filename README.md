# survival-katago

Local-first web prototype for a Go training variant built around **total board ownership**. Black aims to own every point on the board; White aims to keep at least one point from full Black control. The app wraps [KataGo](https://github.com/lightvector/KataGo) in analysis mode, extracts ownership estimates, and reranks moves with a custom Survival Go evaluator—no new neural network in the first version.

**Audience:** Go players who want to practice killing and living with invasions when they do not have a practice partner.

## Quick Start

1. Set up the Python environment and install dependencies (see scaffold scripts under `scripts/`).
2. Run `.cursor/commands/make-specs.md` to produce `specification.md` from your product goals.
3. Run `.cursor/commands/make-todo.md` to turn the spec into a phase-ordered `TODO.md`.
4. Implement milestones with the development loop in `.github/instructions/development.instructions.md`; run `./scripts/run_tests.sh` (or `flake8`, `mypy`, `pytest`) before closing a phase.

> Default package path is `src`. Export `SOURCE_DIR=your_module` and update `src/` if you pick a different name.

**E2E test configuration** (when the web UI exists):

- Set `E2E_SERVER_COMMAND` to customize server startup (default: uvicorn).
- Set `E2E_SERVER_DISABLED=true` for non-web steps or when tests manage their own server.

## Scaffold Overview

This repo started from a lightweight Python agent template. It includes:

- **Testing:** `./scripts/run_tests.sh` (or `make test-*`) for unit, integration, e2e, lint, and type checks; see `tests/README.md`. CI: `.github/workflows/ci.yml`.
- **Linting & types:** `flake8` (including `max-complexity=10`) and `mypy` via `pytest -m lint` and project config.
- **Architecture:** Layered layout and boundaries described in `docs/architecture.md` (thin handlers, focused services).
- **User flows:** Journey templates under `docs/user_flows/`; log new flows in `docs/user_flows/index.md`.

## Core Idea

```text
Black wins if Black can eventually own/control 100% of the board (all 361 points on 19×19).
White wins if White can prevent Black from achieving 100% board ownership.
```

KataGo supplies normal-Go understanding and ownership predictions; the Survival evaluator reinterpretes them for this asymmetric objective. The first milestone is a local web app where a human plays either side against the engine.

## References

- **KataGo (WSL / Linux):** `docs/development/katago-wsl-linux.md`
- Development workflow: `.github/instructions/development.instructions.md`
- Testing workflow: `.github/instructions/testing.instructions.md`
- Architecture: `docs/architecture.md`
- Prompt / command index: `docs/prompt_index.md`
- User flows: `docs/user_flows/`
- Cursor commands: `.cursor/commands/` (`make-specs.md`, `make-todo.md`, `continue-development`, `close-phase`)
