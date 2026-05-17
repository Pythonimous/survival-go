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
- [ ] Write component tests for preset selection, side selection, and board coordinate interaction behavior.
- [ ] Implement game setup UI (preset picker + human color selection) wired to `POST /api/games`.
- [ ] Implement 19x19 board renderer with clickable intersections and invalid-move feedback from API.
- [ ] Implement game state polling/fetch path via `GET /api/games/{game_id}`.
- [ ] Implement controls for human move submission and engine move request.
- [ ] Display engine reasoning metrics (`unresolved_count`, `min_black_probability`) and top candidate comparison panel after analysis/engine move.
Done when: users can complete UF-1/UF-2 turn flow in UI and see UF-3 metrics update correctly.

## 5. Integration Tests
- [ ] Add backend integration test fixture for deterministic test game setup from presets.
- [ ] Add error-path integration tests for invalid move, missing game ID, and engine timeout handling.
- [ ] Add integration test verifying ownership array contract (`p_black` length 361, values in `[0,1]`).
Done when: integration suite validates happy path plus critical failure handling for API and KataGo boundary.

## 6. Non-functional (logging, config, error handling)
- [ ] Add structured backend logging for game lifecycle events, engine requests, and failures.
- [ ] Add typed error model and consistent API error responses across endpoints.
- [ ] Add timeout/retry boundaries around KataGo requests with actionable error messages.
- [ ] Add startup checks that report invalid KataGo binary/config/model paths clearly.
Done when: operational failures are observable, actionable, and do not crash the service unexpectedly.

## 7. Polish and Docs
- [ ] Document API endpoints and request/response examples in `README.md`.
- [ ] Add docs for Survival scoring semantics and threshold tuning.
- [ ] Create/update user flow docs for UF-1 to UF-4 and ensure index is updated.
- [ ] Add troubleshooting section for common local setup issues (path mismatch, model/config mismatch, timeout).
Done when: a new local user can install, run, play a scenario, and debug setup issues using docs only.

## 8. Deployment (if in scope)
- [ ] Add optional local packaging/run instructions (no cloud requirement for MVP).
- [ ] Add environment template and production-safe defaults documentation for local packaging.
- [ ] Add release checklist for regression tests, lint, type checks, and e2e pass.
Done when: project can be packaged/run reproducibly in a fresh local environment without changing code.
