# TODO

## 1. Setup / Environment
- [x] Scaffold `backend/` (FastAPI) and `frontend/` (React + TypeScript + Vite) with basic run scripts.
- [x] Add environment loading/validation for `KATAGO_BINARY_PATH`, `KATAGO_CONFIG_PATH`, `KATAGO_MODEL_PATH`, `SURVIVAL_THRESHOLD`, `KATAGO_TOP_N`, and `KATAGO_ANALYSIS_TIMEOUT_SECONDS`.
- [x] Add `GET /health` endpoint and backend startup smoke test.
- [x] Implement minimal `backend/app/katago/client.py` subprocess boot path with config/model wiring.
- [x] Add KataGo smoke integration test for subprocess startup and ownership response parsing.
- [x] Install and configure local KataGo on WSL/Linux (binary, `analysis` config, compatible model) and set `KATAGO_*` env vars so the smoke integration test passes.
- [x] Add development docs for local WSL/Linux setup and required KataGo files.
- [x] Add CI/local test command aliases for unit, integration, e2e, lint, and type checks.
Done when: backend and frontend start locally, env validation fails fast on missing required paths, local KataGo is installed and configured, and KataGo smoke test plus health check pass.

## 2. Core Backend / API
- [x] Write unit tests for board coordinate parsing (A1-T19 without I), move legality, captures, and turn progression.
- [x] Implement `backend/app/engine/board.py` to satisfy board/rules unit tests (simple ko support acceptable for MVP).
- [x] Migrate board/rules to **sgfmill**: add dependency, replace custom `Board` with sgfmill-backed helpers (GTP coordinate adapter + preset setup only; no wrapper class). Remove unit tests that duplicate sgfmill legality/capture/ko behavior.
- [x] Write unit tests for preset SGF validation (`board_size=19`, `PL` required, setup-only, no moves).
- [x] Implement preset loader and ship 3 preset SGF files (`white-flavoured`, `balanced`, `black-flavoured`).
- [x] Write unit tests for evaluator metrics from ownership probabilities (`unresolved_count`, `min_black_probability`).
- [x] Implement evaluator and move selector side logic (Black minimizes survival score, White maximizes).
- [x] Write integration tests for API lifecycle: create game, fetch game state, apply human move, apply engine move, analyze position.
- [x] Implement endpoints: `GET /api/presets`, `POST /api/games`, `GET /api/games/{game_id}`, `POST /api/games/{game_id}/move`, `POST /api/games/{game_id}/engine-move`, `POST /api/games/{game_id}/analyze`.
Done when: all core API contracts are covered by passing unit/integration tests and backend is source of truth for legality.

## 3. KataGo Integration
- [x] Write unit tests for non-empty position analysis request/response mapping in `backend/app/katago/client.py` (moves + setup stones + ownership parsing).
- [x] Integrate `POST /api/games/{game_id}/analyze` with KataGo ownership output (remove heuristic fallback in production path).
- [x] Integrate `POST /api/games/{game_id}/engine-move` with KataGo candidate workflow and reranking using Survival objective.
- [x] Consume `KATAGO_TOP_N` in engine selection flow and prove it with tests.
- [x] Add integration tests for KataGo-backed analyze/engine-move with timeout/process-failure paths. Use actual live KataGo.
Done when: `analyze` and `engine-move` are driven by KataGo analysis (not heuristic ownership), `KATAGO_TOP_N` is enforced, and passing tests cover happy + failure paths.

## 4. Frontend / UX
- [x] Add `@sabaki/shudan`, import `css/goban.css`, and configure Vite (`preact` / `preact/hooks` → `react` alias) for React 19.
- [x] Write unit tests for GTP ↔ Shudan vertex ↔ `signMap` mapping (A–T without I; row 0 = bottom, matching backend/sgfmill).
- [x] Write component tests for preset selection, side selection, and board click → GTP coordinate behavior (Shudan `onVertexClick`).
- [x] Implement game setup UI (preset picker + human color selection) wired to `POST /api/games`.
- [x] Implement `BoardView` with Shudan: `signMap` from API `stones`, clicks POST human moves, API error feedback; no client-side rules engine.
- [x] Implement game state fetch path via `GET /api/games/{game_id}` (refresh after moves; polling optional).
- [x] Implement controls for human move submission and engine move request.
- [x] Display engine reasoning metrics (`unresolved_count`, `min_black_probability`) and top candidate comparison panel after analysis/engine move (table first; board markers when API returns ranked candidates).
Done when: users can complete UF-1/UF-2 turn flow in UI via Shudan board + API, and see UF-3 metrics update correctly. 

## 4.1. UX tweaks
- [x] Make user move occur when clicking the board and make engine move automatically as a response, instead of having to press buttons for each.
- [x] Allow user to choose sides on each preset, instead of being always forced to play White.
- [x] When AI is playing as B and probability for one of the points is below 1%, AI resigns. Same for W, if min B ownership is above 99%, AI resigns.
- [x] Add AI difficulty presets for Easy, Normal, Hard and Impossible, based on AI revisit times + random candidate pick
- [x] Add a marker on each new move (like a w/b dot on a b/w newly played stone), or some other indicator as for who is the next to move. Even a simple 'black to play', 'white to play', etc, will take away some confusion.
- [x] Board is the biggest part of the page. AI candidate moves with numbers - on the right. New game, difficulty presets, settings, etc. - all in the foreground, to be removed once the game starts, and brought back only when setting up a new game.
- [x] When playing B: "Black to play" vs "White is thinking...", and vice versa.

## 4.2. Shared KataGo engine (multi-user / deploy)
Interim per-game engines + `DELETE` cleanup fixed RAM leaks locally; this phase switches to **one** analysis subprocess for all games (better for Docker / a few concurrent testers).

- [x] Write unit tests for a shared `KataGoClient`: concurrent `_send_query` calls are serialized (no stdin/stdout interleaving); responses still matched by `query_id`.
- [x] Implement shared client access (e.g. singleton + `threading.Lock` or asyncio lock) in `backend/app/katago/client.py`.
- [x] Refactor `InMemoryGameService` to use one shared analyzer instead of `katago_client_factory` per game; remove per-game `_katago_clients` lifecycle.
- [x] Change `delete_game` to drop in-memory game state only (do **not** stop KataGo); keep `shutdown()` stopping the single engine on app exit.
- [x] Add integration tests: two games can analyze/engine-move through the same client without cross-talk.
- [x] Add Docker-oriented `analysis.cfg` notes or overrides (`numAnalysisThreads`, timeouts) for light concurrent load.
- [x] Document expected behavior: requests queue under load, one model footprint, tab-close without "New game" still leaves idle games in memory until `DELETE` or server restart.
Done when: several simultaneous games share one KataGo process safely, RAM stays ~one model load, and tests cover serialized concurrent API use.

## 5. Local run & packaging
- [x] Add instructions for a local run, to validate first app version works as intended.
- [x] Add optional local packaging/run instructions (Docker Compose or equivalent; no cloud required).
- [x] Add environment template and production-safe defaults documentation for local packaging.
- [x] Add release checklist for regression tests, lint, type checks, and e2e pass.
Done when: project can be packaged and run reproducibly in a fresh local environment without changing code.

## 6. Cloud deployment
- [x] Define deployment topology (API + KataGo process layout, frontend static hosting, secrets strategy).
- [x] Add container image(s) for backend with documented KataGo binary/config/model wiring for deploy environments.
- [x] Add production frontend build and publish path (static assets + API base URL configuration).
- [x] Document required cloud env vars, resource sizing, and timeout limits for KataGo analysis workloads.
- [x] Add deploy automation with post-deploy smoke checks (`GET /health`, optional analyze smoke).
- [x] Add runbook for AWS setup, zero to having the website w/custom domain up and ready.
Done when: a documented cloud path can deploy backend, frontend, and KataGo dependencies and pass smoke checks in a non-local environment.

## 7. Integration Tests
- [ ] Add backend integration test fixture for deterministic test game setup from presets.
- [ ] Add error-path integration tests for invalid move, missing game ID, and engine timeout handling.
- [ ] Add integration test verifying ownership array contract (`p_black` length 361, values in `[0,1]`).
Done when: integration suite validates happy path plus critical failure handling for API and KataGo boundary.

## 8. Non-functional (logging, config, error handling)
- [ ] Add structured backend logging for game lifecycle events, engine requests, and failures.
- [ ] Add typed error model and consistent API error responses across endpoints.
- [ ] Add timeout/retry boundaries around KataGo requests with actionable error messages.
- [ ] Add startup checks that report invalid KataGo binary/config/model paths clearly.
Done when: operational failures are observable, actionable, and do not crash the service unexpectedly.

## 9. Polish and Docs
- [ ] Document API endpoints and request/response examples in `README.md`.
- [ ] Add docs for Survival scoring semantics and threshold tuning.
- [ ] Create/update user flow docs for UF-1 to UF-4 and ensure index is updated.
- [ ] Add troubleshooting section for common local setup issues (path mismatch, model/config mismatch, timeout).
Done when: a new local user can install, run, play a scenario, and debug setup issues using docs only.