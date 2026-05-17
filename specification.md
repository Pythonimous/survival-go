# Project Specification

- Project: survival-katago

## Overview

- Build a local-first web app for a Go training variant focused on total board ownership.
- Audience: Go players practicing life-and-death style survival/invasion scenarios without a live partner.
- Core objective:
  - Black wins by achieving predicted ownership/control of all 361 points on a 19x19 board.
  - White wins by preserving at least one point from full Black ownership.
- Use KataGo as a local analysis engine; do not train a new model in MVP.

## Scope

- 19x19-only gameplay from predefined presets (no empty-board opening).
- Human vs engine mode where user can play either color.
- FastAPI backend to manage game state, legality checks, engine requests, and evaluation.
- React + TypeScript frontend to render board, accept moves, and display Survival metrics.
- Survival evaluator that reranks KataGo candidate moves with custom objective.

## Out-of-scope

- Model training/fine-tuning, custom neural nets, or custom MCTS from scratch.
- Multiplayer, accounts, persistence, ranking, or cloud deployment.
- Board sizes other than 19x19.
- Full SGF database management or advanced review tooling.
- Full superko implementation if it blocks MVP (simple ko is acceptable first).

## User scenarios

- **UF-1: Survive as White**
  - User selects a preset and chooses White.
  - User plays moves to keep at least one region unresolved/non-Black-owned.
  - Engine (Black) responds by minimizing unresolved ownership points.
- **UF-2: Kill as Black**
  - User selects a preset and chooses Black.
  - User attempts to force total board ownership.
  - Engine (White) responds by maximizing unresolved ownership points.
- **UF-3: Inspect engine reasoning**
  - After each engine move, user sees key metrics (`unresolved_count`, `min_black_probability`) and top candidate comparisons.
- **UF-4: Start and resume local sessions**
  - User can create a game from preset, play turn-by-turn, and query current game state via API.

## API / Modules

- **Backend stack:** FastAPI, Pydantic, Python 3.11+.
- **Frontend stack:** React, TypeScript, Vite.
- **Core modules:**
  - `backend/app/katago/client.py`: subprocess integration, request/response parsing, ownership extraction.
  - `backend/app/engine/evaluator.py`: converts ownership probabilities to Survival metrics and score.
  - `backend/app/engine/board.py`: board state, captures, move legality, turn progression.
  - `backend/app/engine/move_selector.py`: reranks candidate moves according to side objective.
  - `backend/app/presets/loader.py`: validates and loads preset SGF files.
- **Primary API endpoints (MVP):**
  - `GET /health` -> service status.
  - `GET /api/presets` -> list available preset metadata.
  - `POST /api/games` -> create game from preset and chosen human color.
  - `GET /api/games/{game_id}` -> fetch current game state.
  - `POST /api/games/{game_id}/move` -> apply human move.
  - `POST /api/games/{game_id}/engine-move` -> request and apply engine move.
  - `POST /api/games/{game_id}/analyze` -> evaluate current position without move.
- **Key contracts:**
  - Internal ownership format: `p_black: list[float]` length 361, values in `[0.0, 1.0]`.
  - Baseline Survival score: `survival_score = unresolved_count` where unresolved means `p_black < threshold`.
  - Engine selection:
    - Engine Black chooses candidate with lowest `survival_score`.
    - Engine White chooses candidate with highest `survival_score`.

## Data / Config

- **Data sources:**
  - Local KataGo binary.
  - Local KataGo model file.
  - Local KataGo analysis config.
  - Project preset SGF files under `backend/app/presets/sgf/` (3 initial presets: white-flavoured, balanced, black-flavoured).
- **Preset SGF constraints:**
  - `SZ` must be `19`.
  - Root node must include `PL` (`b` or `w`) for the player to move.
  - Setup via `AB`/`AW`/`AE` only; no moves in the game tree.
  - Setup position must be legal (sgfmill validation).
- **Runtime config (env):**
  - `KATAGO_BINARY_PATH`, `KATAGO_CONFIG_PATH`, `KATAGO_MODEL_PATH`
  - `SURVIVAL_THRESHOLD` (default target `0.95`)
  - `KATAGO_TOP_N` (default target `8`)
  - `KATAGO_ANALYSIS_TIMEOUT_SECONDS`
- **Operational constraints:**
  - Local-first development in WSL/Linux environment.
  - Backend is source of truth for rule validation.
  - UI may prefilter obvious invalid clicks but cannot enforce final legality.

## Testing strategy

- **Unit tests**
  - Coordinate conversion, preset validation, board legality/captures, ownership conversion, evaluator metrics, move selector side logic.
- **Integration tests**
  - API lifecycle (create game, human move, engine move, analysis).
  - KataGo smoke integration (subprocess startup + ownership response parsing).
- **E2E tests**
  - Preset selection, side selection, playable board interactions, engine response, metric updates.
- **Execution gates**
  - Run targeted `pytest` slices for changed areas first.
  - Run `mypy .` and resolve all type errors.
  - Run `pytest -m lint` (or `flake8`) for lint gate.

## Risks / Constraints

- KataGo subprocess/analysis wiring may fail due to path/config/model mismatch.
- Ownership sign interpretation must be validated with known positions before relying on evaluator output.
- Candidate reranking may be slower if each candidate requires a separate analysis call.
- Normal-Go policy priors may miss Survival-specific tactical lines; expose diagnostics for iteration.

## Assumptions

- KataGo is available locally and can be launched from backend environment.
- MVP users accept local-only setup and no account/persistence features.
- Three curated presets are sufficient to validate gameplay value.
- `unresolved_count` is enough as the first optimization target; richer scoring can wait.

## Open questions

- Exact preset positions and difficulty calibration criteria.
- Formal game termination rules (pass handling, draw/no-result treatment in this variant).
- Minimum rule scope for ko/superko in MVP vs post-MVP.
- Whether engine move generation should evaluate only top-N KataGo candidates or include broader legal probing in later versions.
