# Project memory

## Scaffold (2026-05-16)

- `backend/app/main.py`: minimal FastAPI app (`survival-go`), CORS for Vite on port 5173.
- `frontend/`: React 19 + TypeScript + Vite 6; proxy `/api` and `/health` to backend :8000.
- Run scripts: `scripts/run_backend.sh`, `scripts/run_frontend.sh` (frontend script runs `npm install` if needed).
- Python deps in `requirements.txt`; use `.venv` at repo root. `tests/conftest.py` adds project root to `sys.path`.
- Unit tests in `tests/unit/test_scaffold.py` verify app import, run scripts, and `package.json` layout.
- Frontend dev-server smoke test skips until `npm install` in `frontend/` (requires Node/npm locally).

## Environment settings (2026-05-16)

- `backend/app/config.py`: `Settings` via pydantic-settings; required file paths `KATAGO_*`; defaults `SURVIVAL_THRESHOLD=0.95`, `KATAGO_TOP_N=8`, `KATAGO_ANALYSIS_TIMEOUT_SECONDS=30`.
- `get_settings()` is cached; `create_app()` calls it so startup fails fast on missing/invalid env.
- `tests/conftest.py` autouse fixture supplies dummy KataGo paths for tests that import the backend.

## Health endpoint (2026-05-16)

- `GET /health` returns `{"status":"ok","service":"survival-go"}` (`HealthResponse` in `backend/app/main.py`).
- `tests/unit/test_health.py`: TestClient unit test plus uvicorn subprocess smoke on port 8765.

## KataGo subprocess client (2026-05-16)

- Added `backend/app/katago/client.py` with `KataGoClient` that starts KataGo in `analysis` mode using configured binary/config/model paths and owns process lifecycle (`start()`/`stop()`).
- Added `tests/unit/test_katago_client.py` to verify subprocess command wiring and termination behavior.
- Verification run: `pytest tests/unit/test_katago_client.py -m unit`, `pytest -m lint`, `mypy .`, and `pytest -m "unit or integration"` all pass.

## KataGo ownership parsing + smoke integration (2026-05-16)

- `backend/app/katago/ownership.py`: maps KataGo `ownership` ([-1, 1]) to internal `p_black` ([0, 1]); validates length `board_size ** 2`.
- `KataGoClient.analyze_empty_board()`: sends analysis JSON on stdin, reads final stdout line (`isDuringSearch: false`), returns `p_black`.
- `tests/unit/test_katago_ownership.py` and extended `test_katago_client.py` cover parsing and mocked analyze flow.
- `tests/integration/test_katago_smoke.py`: runs against real KataGo when `KATAGO_*` env paths are set; skips otherwise. `conftest` autouse dummy env is disabled for `@pytest.mark.integration`.
- Verification: `pytest -m "unit or integration"`, `mypy .`, `pytest -m lint` pass (integration smoke skips without local KataGo).

## Local KataGo install (2026-05-16)

- `scripts/setup_katago.sh`: downloads KataGo v1.16.4 (eigenavx2, AppImage-style build for Ubuntu 24.04) and `kata1-b20c256x2-...bin.gz` into `third_party/katago/`; writes `.env` on first run.
- `third_party/katago/analysis.cfg`: CPU-friendly analysis config (`numAnalysisThreads=1`, `numSearchThreadsPerAnalysisThread=2`).
- `.env.example` documents required `KATAGO_*` paths; `.env` is gitignored.
- Use v1.16.4+ on Ubuntu 24.04 — v1.15.x binaries need `libssl.so.1.1` / `libzip.so.5` not present on noble.
- Smoke test passes when `.env` is present: `pytest tests/integration/test_katago_smoke.py -m integration`.
- Unit tests that assert missing env use `Settings(_env_file=None)` or `chdir(tmp_path)` so a local `.env` does not mask failures.

## KataGo dev docs (2026-05-16)

- `docs/development/katago-wsl-linux.md`: WSL/Linux setup walkthrough (automated script, env vars, verify, troubleshooting).
- Linked from `README.md` References section.

## Board unit tests (2026-05-16)

- `tests/unit/test_board.py`: GTP coordinate parse/format (A–T skipping I), `Board` legality, captures, simple ko, turn progression.
- Added `backend/app/engine/board.py` with `parse_gtp_coordinate`, `format_gtp_coordinate`, immutable `Board` state, turn enforcement, capture handling, suicide checks, and simple ko-point blocking.
- `Board` API now covers `empty`, `from_stones`, `stone_at_coord`, `is_legal_move`, `play`, `IllegalMoveError`, and `InvalidCoordinateError`.
- Verification: `pytest tests/unit/test_board.py -m unit`, `mypy .`, and `pytest -m lint` pass.

## Sgfmill board migration (2026-05-16)

- Added `sgfmill>=1.1.1` to `requirements.txt`; `mypy.ini` ignores missing stubs for `sgfmill.*`.
- Replaced custom `Board` class with thin helpers in `backend/app/engine/board.py`:
  - `parse_gtp_coordinate` / `format_gtp_coordinate` wrap `sgfmill.common` (returns sgfmill `(row, col)`).
  - `setup_board_from_stones` builds a `sgfmill.boards.Board` via `apply_setup`.
  - `stone_at_coord`, `to_sgfmill_color`, `from_sgfmill_color` for API colour mapping (`B`/`W` ↔ `b`/`w`).
- Removed unit tests for legality, captures, ko, and turn progression (delegated to sgfmill).
- `tests/unit/test_board.py` now covers GTP adapter + preset setup only (63 tests).
- Verification: `pytest tests/unit/test_board.py -m unit`, `mypy .`, `pytest -m lint`, `pytest -m "unit or integration"` pass.

## SGF preset loader (2026-05-17)

- `backend/app/presets/loader.py`: loads `*.sgf` from `backend/app/presets/sgf/` via sgfmill (`get_setup_and_moves`).
- `PresetDefinition` dataclass holds `board` + metadata; `PresetMetadata` pydantic model for API listing.
- Builtin presets: `balanced` (18 black), `black-flavoured` (68 black edge wall), `white-flavoured` (17 black, 2 AE); all `PL[W]`.
- `tests/unit/test_preset_validation.py`: 15 unit tests for loader validation and builtin stone counts.
- `specification.md` updated: preset source is SGF, not JSON.

## Test command aliases (2026-05-16)

- `./scripts/run_tests.sh`: local aliases for `unit`, `integration`, `e2e`, `lint`, `types`, `fast`, `all`, `full`, `coverage`.
- `Makefile`: `make test-unit`, `test-integration`, `test-e2e`, `test-lint`, `test-types`, `test-fast`, `test-all`, `test-full`, `test-coverage`.
- `.github/workflows/ci.yml`: parallel CI jobs calling the same `run_tests.sh` commands.
- `run_e2e_tests.sh`: exit 0 when no E2E tests are collected (pytest exit code 5).
- `SOURCE_DIR` default in `run_tests.sh` is `backend` (coverage).
- `tests/unit/test_test_runner.py` asserts help text, Makefile targets, and CI workflow jobs.

## Evaluator metrics baseline (2026-05-17)

- Added `tests/unit/test_evaluator.py` covering `unresolved_count` and `min_black_probability` derivation from `p_black`.
- Added `backend/app/engine/evaluator.py` with `SurvivalMetrics` and `calculate_survival_metrics(p_black, threshold)`.
- `unresolved_count` counts points where `p_black < threshold`; threshold boundary is treated as resolved.
- `min_black_probability` reports `min(p_black)`.
- Validation/checks run and passing: `pytest tests/unit/test_evaluator.py -m unit`, `mypy .`, `pytest -m lint`.

## Evaluator + move selector side logic (2026-05-17)

- `backend/app/engine/evaluator.py`: added `SurvivalEvaluation` and `evaluate_survival_position(p_black, threshold)` where baseline `survival_score = unresolved_count`.
- Added `backend/app/engine/move_selector.py` with side-aware selection:
  - `rank_candidates_for_side(..., engine_side="B"|"W")`
  - `choose_engine_move(...)` where Black minimizes survival score and White maximizes it.
- Added/updated unit tests:
  - `tests/unit/test_evaluator.py` now covers survival-score derivation plus empty-input validation for position evaluation.
  - `tests/unit/test_move_selector.py` covers black/white objective direction, ranking order, and empty-candidate validation.
- Validation/checks run and passing:
  - `pytest tests/unit/test_evaluator.py tests/unit/test_move_selector.py -m unit`
  - `mypy .`
  - `pytest -m lint`

## API lifecycle integration tests (2026-05-17)

- Added `tests/integration/test_api_lifecycle.py` with one happy-path lifecycle test covering:
  - `GET /api/presets`
  - `POST /api/games`
  - `GET /api/games/{game_id}`
  - `POST /api/games/{game_id}/move`
  - `POST /api/games/{game_id}/engine-move`
  - `POST /api/games/{game_id}/analyze`
- Test contract currently checks:
  - preset list shape and known preset id (`balanced`)
  - game creation returns a non-empty `game_id`
  - game fetch/move/engine-move responses carry the same `game_id`
  - analyze response includes metrics with `unresolved_count` and `min_black_probability in [0,1]`
- The test chooses a legal move deterministically by scanning the preset board with sgfmill legality checks.
- Local command execution in this session could not run pytest due missing/broken Python tooling (`pyenv` shim path invalid, `python3` lacks `pytest`/`pip`).

## Core API endpoint implementation (2026-05-17)

- Added `backend/app/game_service.py` with `InMemoryGameService` and `GameState` for minimal in-process game lifecycle orchestration:
  - preset listing/lookup via SGF loader
  - create/get game by id
  - human move application with turn validation
  - engine move selection using existing side-aware objective (`choose_engine_move`)
  - analysis response via `evaluate_survival_position`
- Added API contracts in `backend/app/main.py`:
  - `GET /api/presets`
  - `POST /api/games`
  - `GET /api/games/{game_id}`
  - `POST /api/games/{game_id}/move`
  - `POST /api/games/{game_id}/engine-move`
  - `POST /api/games/{game_id}/analyze`
- Main handlers return 400 for validation errors and 404 for unknown game ids; route registration split into small helpers to satisfy flake8 complexity gate.
- Ownership evaluation in this phase uses deterministic board-derived probabilities (`B=1.0`, `W=0.0`, empty=`0.5`) so integration tests run without a live KataGo subprocess.
- Validation/checks run and passing (via `.venv/bin/python -m ...`):
  - `pytest tests/integration/test_api_lifecycle.py -m integration`
  - `pytest -m "unit or integration"`
  - `mypy .`
  - `pytest -m lint`

## KataGo non-empty position analysis mapping (2026-05-17)

- `backend/app/katago/client.py`:
  - `build_analysis_query(...)`: maps setup stones, move list, `initialPlayer`, and `analyzeTurns=[len(moves)]` to KataGo analysis JSON.
  - `analyze_position(...)`: sends query via subprocess and returns `p_black` via `parse_ownership_from_response`.
  - `analyze_empty_board()` now delegates to `analyze_position` with empty setup/moves.
- `tests/unit/test_katago_client.py`: added tests for query mapping (setup+moves, setup-only turn 0) and mocked `analyze_position` ownership parsing.
- Validation/checks run and passing:
  - `pytest tests/unit/test_katago_client.py -m unit`
  - `pytest -m "unit or integration"`
  - `mypy .`
  - `pytest -m lint`

## Analyze endpoint KataGo integration (2026-05-17)

- `backend/app/game_service.py`:
  - `InMemoryGameService` now accepts a `katago_client` dependency and uses it in `analyze_game(...)`.
  - Removed analyze-path heuristic fallback; `analyze_game` now builds a full-board `initialStones` payload and calls `KataGoClient.analyze_position(...)`.
  - Added `KataGoAnalyzer` protocol and `_board_as_initial_stones(...)` helper for deterministic board-to-query mapping.
  - KataGo analyze failures are wrapped as `GameServiceError("failed to analyze game with KataGo")`.
- `backend/app/main.py` now wires a real `KataGoClient(settings)` into `InMemoryGameService` at app startup.
- Added `tests/unit/test_game_service.py`:
  - verifies `analyze_game` computes Survival metrics from KataGo ownership output.
  - verifies analyze errors are surfaced (no fallback path).
- Updated `tests/integration/test_api_lifecycle.py`:
  - stubs `KataGoClient.analyze_position` in fixture and asserts deterministic analyze metrics (`unresolved_count=1`, `min_black_probability=0.4`) to prove endpoint uses KataGo data path.
- Validation/checks run and passing:
  - `pytest tests/unit/test_game_service.py tests/integration/test_api_lifecycle.py`
  - `mypy .`
  - `pytest -m lint`

## Engine move KataGo candidate workflow (2026-05-17)

- `backend/app/game_service.py`:
  - `apply_engine_move(...)` now uses KataGo candidate generation and per-candidate KataGo ownership evaluation before Survival reranking.
  - Added `KataGoAnalyzer.get_candidate_moves(...)` protocol requirement.
  - Added focused helpers (`_fetch_engine_candidate_moves`, `_is_legal_candidate_move`, `_evaluate_engine_candidate`) to keep complexity under lint threshold.
  - Engine move failures are surfaced as `GameServiceError` with candidate-fetch/evaluation specific messages.
- `backend/app/katago/client.py`:
  - Added `get_candidate_moves(...)` to call analysis API and extract `moveInfos` in order.
  - Added `parse_candidate_moves_from_response(...)` with validation (`moveInfos` required) and filtering (drops pass/invalid entries).
- Tests:
  - `tests/unit/test_game_service.py`: new test proving engine move path consumes KataGo candidates and reranks via Survival objective (Black minimizes score).
  - `tests/unit/test_katago_client.py`: added tests for candidate parsing and missing-`moveInfos` error handling.
  - `tests/integration/test_api_lifecycle.py`: fixture now stubs both `analyze_position` and `get_candidate_moves` so lifecycle test exercises KataGo-backed engine-move path.
- Validation/checks run and passing:
  - `pytest tests/unit/test_game_service.py tests/unit/test_katago_client.py tests/integration/test_api_lifecycle.py -m "unit or integration"`
  - `pytest -m lint`
  - `mypy .`

## KATAGO_TOP_N enforcement (2026-05-17)

- `backend/app/game_service.py`:
  - `InMemoryGameService` now accepts `katago_top_n` (default `8`) with validation (`>= 1`).
  - Engine candidate list from `get_candidate_moves(...)` is truncated to top N before legality filtering and reranking.
- `backend/app/main.py` now wires `settings.katago_top_n` into `InMemoryGameService` so env config is consumed by production startup.
- `tests/unit/test_game_service.py`:
  - added `test_apply_engine_move_enforces_katago_top_n_candidate_limit` proving only top-N candidates are evaluated and selected.
- Validation/checks run and passing:
  - `pytest tests/unit/test_game_service.py -q`
  - `pytest -m lint -q`
  - `mypy .`

## KataGo live API integration tests (2026-05-17)

- `tests/integration/conftest.py`: shared `katago_settings` fixture (loads `.env` via pydantic `Settings()`), `live_katago_env`, and helpers for live game setup.
- `tests/integration/test_katago_game_api.py`:
  - live API happy paths for `POST /analyze` and `POST /engine-move` against real KataGo.
  - API timeout surfacing via patched `KataGoClient._read_final_response` after live subprocess startup.
  - process-exit failures for analyze/engine-move at service layer with killed live subprocess (prevents auto-restart).
- `tests/unit/test_katago_client.py`: `test_read_final_response_raises_when_analysis_deadline_expires` for monotonic deadline logic.
- Section 3 in `TODO.md` marked complete.
- Validation/checks run and passing:
  - `pytest tests/integration/test_katago_game_api.py tests/integration/test_katago_smoke.py -m integration`
  - `pytest -m "unit or integration"`, `mypy .`, `pytest -m lint`

## Frontend Shudan setup (2026-05-17)

- Added `@sabaki/shudan` to `frontend/package.json`; `npm install` produces `frontend/package-lock.json`.
- `frontend/src/main.tsx` imports `@sabaki/shudan/css/goban.css`.
- Vite aliases `preact` → `frontend/src/shims/preact/` (directory with `index.ts` + `hooks.ts` re-exporting React APIs). Required because Vite cannot alias `preact/hooks` directly to `react` (missing `./hooks` export).
- `frontend/src/lib/shudan.tsx`: React 19–compatible `Goban` wrapper (`Sign`, `SignMap`, `Vertex` types).
- `frontend/src/components/GobanBoard.tsx`: renders empty 19×19 board in `App.tsx`.
- `tests/unit/test_frontend_shudan.py`: package/vite/component checks plus `npm run build` (auto-runs `npm install` if `node_modules` missing; fails if `npm` unavailable — no skip).
- Validation: `pytest tests/unit/test_frontend_shudan.py -m unit`, `npm run build` in `frontend/`, full `pytest -m "unit or integration"`, `mypy .`, `pytest -m lint`.

## Frontend GTP ↔ Shudan coordinates (2026-05-17)

- `frontend/src/lib/coordinates.ts`: GTP parse/format (A–T without I, row 0 = bottom), sgfmill ↔ Shudan vertex (`[x, y]`, y 0 at top), `signMapFromStones` for API `{move, color}` stones.
- `frontend/scripts/coordinate_cli.ts`: JSON CLI invoked by pytest via `npx tsx`.
- `tests/unit/test_frontend_coordinates.py`: 55 tests cross-checking backend `parse_gtp_coordinate` / `format_gtp_coordinate` and live TS exports.
- `frontend/package.json`: added `tsx` devDependency for coordinate CLI in tests.
- `GobanBoard.tsx` uses `emptySignMap` from `coordinates.ts`.
- Validation: `pytest tests/unit/test_frontend_coordinates.py -m unit`, `npm run build`, `pytest -m lint`, `python -m mypy .`, `pytest -m unit` pass.

## Close phase — backend + KataGo (2026-05-17)

- Sections 1–3 in `TODO.md` complete: scaffold, core API, and KataGo integration (analyze + engine-move with `KATAGO_TOP_N`, live integration tests).
- Section 4 in progress: component tests for preset/side/board click done; next: game setup UI wired to API.

## Frontend component tests (2026-05-17)

- Vitest + Testing Library + jsdom in `frontend/` (`npm test`, `vitest.config.ts` with preact alias).
- `frontend/src/components/GameSetup.tsx`: preset radios, human side (B/W); any color allowed. Preset `PL[W]` honored at create; `BoardView` auto `engine-move` when human is Black on empty board.
- `frontend/src/components/GobanBoard.tsx`: `onGtpClick` converts Shudan `onVertexClick` vertices via `vertexToGtp`.
- `frontend/src/types/api.ts`: shared `PresetMetadata`, `CreateGamePayload`, `StoneColor`.
- Vitest: `GameSetup.test.tsx` (6), `GobanBoard.test.tsx` (2, mocks Shudan).
- `tests/unit/test_frontend_components.py`: pytest invokes `npm test` plus source checks.
- Validation: `npm test`, `pytest tests/unit/test_frontend_components.py -m unit`, `pytest -m lint`, `python -m mypy .`, `npm run build`.
- E2E skipped: no UF flows beyond template; UI not implemented.
- `analysis_logs/` gitignored (KataGo writes logs to repo cwd per `analysis.cfg`).
- Live KataGo integration tests require subprocess access outside the default sandbox; use `.venv/bin/python -m pytest` (system `pytest` shim may be broken on WSL).
- Close-phase verification (all pass):
  - `pytest -m lint`
  - `mypy .`
  - `pytest -m "unit or integration"` (132 passed, 1 skipped; live KataGo tests when `.env` configured)

## Frontend game setup API wiring (2026-05-17)

- `frontend/src/App.tsx` now owns setup flow state: fetches presets from `GET /api/presets`, renders `GameSetup`, posts `CreateGamePayload` to `POST /api/games`, and surfaces load/create errors.
- `frontend/src/App.test.tsx` added (2 tests): verifies startup preset fetch and submit payload for game creation.
- `TODO.md` section 4 item "Implement game setup UI ... wired to `POST /api/games`" marked complete.
- Validation run locally:
  - `cd frontend && npm test -- App.test.tsx` (fails first, then passes after implementation)
  - `cd frontend && npm test` (all frontend tests pass: 10/10)
  - `ReadLints` clean for `frontend/src/App.tsx` and `frontend/src/App.test.tsx`
- Environment blockers on this machine:
  - `pytest -m lint` fails due to broken shim path (`/mnt/c/Users/Kirill/.pyenv/pyenv-win/shims/pytest`)
  - `mypy .` fails due to broken shim path (`/mnt/c/Users/Kirill/.pyenv/pyenv-win/shims/mypy`)

## Frontend BoardView move wiring (2026-05-17)

- Added `frontend/src/components/BoardView.tsx`:
  - Fetches `GET /api/games/{game_id}` on mount.
  - Builds Shudan `signMap` from API `stones` via `signMapFromStones`.
  - Sends human clicks as `POST /api/games/{game_id}/move` and updates board state from API response.
  - Shows API error feedback (`detail` when present) with `role="alert"`.
- `frontend/src/types/api.ts` now includes shared `GameState`, `MoveResponse`, and `ApiStone` types.
- `frontend/src/App.tsx` now renders `BoardView` after successful game creation instead of an always-empty board.
- Tests:
  - New `frontend/src/components/BoardView.test.tsx` (3 tests): load state/signMap, click-to-move POST payload, and move error feedback.
  - Updated `frontend/src/App.test.tsx` for the additional game-state fetch after create.
- Validation run:
  - `cd frontend && npm test -- BoardView.test.tsx App.test.tsx` (pass)
  - Python gates remain blocked by environment shims (`pytest`/`mypy` on pyenv-win path); no repo code fix applied here.

## Frontend game-state refresh after moves (2026-05-17)

- `frontend/src/components/BoardView.tsx` now uses a shared `loadGameState()` fetch helper for `GET /api/games/{game_id}` on mount and after successful `POST /api/games/{game_id}/move`.
- Move submission no longer trusts the move POST payload as the final UI state; it refreshes from the backend source-of-truth game state.
- `frontend/src/components/BoardView.test.tsx` updated to assert post-move fetch refresh (`3rd` call is `GET /api/games/game-1`).
- `TODO.md` section 4 item "Implement game state fetch path via `GET /api/games/{game_id}` (refresh after moves; polling optional)." marked complete.
- Validation run:
  - `npm --prefix frontend test -- BoardView.test.tsx --run` (pass)
  - `npm --prefix frontend test -- App.test.tsx BoardView.test.tsx --run` (pass)
  - `.venv/bin/python -m mypy .` (pass)
  - `.venv/bin/python -m pytest -m lint` (pass)

## Frontend move controls + engine move request (2026-05-17)

- `frontend/src/components/BoardView.tsx` now includes explicit controls:
  - board clicks set a pending move (input value), they no longer auto-submit.
  - `Submit move` posts `POST /api/games/{game_id}/move` with `{ move }`, then refreshes state via `GET /api/games/{game_id}`.
  - `Engine move` posts `POST /api/games/{game_id}/engine-move`, then refreshes state via `GET /api/games/{game_id}`.
- `frontend/src/components/BoardView.test.tsx` updated:
  - human move path now asserts submit-button flow after selecting a board vertex.
  - added engine move control test covering `/engine-move` POST and state refresh.
  - updated move-error test to submit through new controls.
- `TODO.md` section 4 item "Implement controls for human move submission and engine move request." marked complete.
- Validation run:
  - `npm --prefix frontend test -- BoardView.test.tsx App.test.tsx --run` (pass)
  - `.venv/bin/python -m pytest tests/unit/test_frontend_components.py -m unit` (pass)
  - `.venv/bin/python -m mypy .` (pass)
  - `.venv/bin/python -m pytest -m lint` (pass)
  - `ReadLints` clean for updated frontend files.

## Frontend engine reasoning metrics (2026-05-17)

- Backend `POST /api/games/{game_id}/engine-move` now returns `EngineMoveResponse` with `survival_score`, `metrics`, and ranked `candidates` (move, survival_score, min_black_probability).
- `CandidateMove` extended with `min_black_probability`; `InMemoryGameService.apply_engine_move` returns `EngineMoveResult`.
- Frontend:
  - `frontend/src/components/EngineReasoning.tsx`: metrics panel + candidate comparison table (selected row highlighted).
  - `BoardView`: `Analyze position` button (`POST /analyze`) and reasoning panel after analyze/engine move.
  - Types in `frontend/src/types/api.ts`: `SurvivalMetrics`, `CandidateSummary`, `AnalyzeResponse`, `EngineMoveResponse`.
- Tests: `EngineReasoning.test.tsx` (2), `BoardView.test.tsx` (+2 analyze/engine reasoning), `test_api_lifecycle.py` asserts engine-move payload shape.
- `TODO.md` section 4 complete (UF-3 metrics + candidate table in UI).
- Validation: `npm test` (18/18), `pytest tests/unit/test_frontend_components.py -m unit`, `pytest tests/integration/test_api_lifecycle.py -m integration`, `mypy .`, `pytest -m lint` pass; live KataGo integration tests require local `.env` + subprocess outside sandbox.

## Frontend auto-play on board click (2026-05-17)

- `BoardView`: board click on human turn chains `POST /move` then `POST /engine-move` and refreshes state; `onGtpClick` omitted when not human turn or turn in progress.
- Removed manual Submit move / Engine move controls; kept Analyze position.
- `BoardView.test.tsx`: auto-play flow, engine-turn ignore, error on failed human move.
- `TODO.md` section 4.1 first item complete.

## Local run documentation (2026-05-17)

- `docs/development/local-run.md`: end-to-end local run guide (venv, KataGo, two-terminal start, UF-1–UF-3 validation checklist, API curl smoke, troubleshooting).
- `README.md` Quick Start points at local-run doc; References section links it.
- `tests/unit/test_local_run_docs.py`: asserts doc/README cover required scripts, ports, and paths.
- `TODO.md` section 5 first item complete.

## Engine resignation on Survival thresholds (2026-05-17)

- `backend/app/engine/resignation.py`: `should_engine_resign` — Black engine resigns when `min_black_probability < 0.01`; White when `> 0.99`.
- `InMemoryGameService.apply_engine_move`: analyzes current position before candidate search; on resign sets `status=finished`, `winner=human_side`, skips stone play; `EngineMoveResult.resigned=True`, `move=""`.
- API: `GameStateResponse` adds `status`, `winner`; `EngineMoveResponse` adds `resigned`.
- Frontend `BoardView`: shows resignation banner, disables board when `status === "finished"`.
- Tests: `test_engine_resignation.py`, game service resign/reject-finished cases, `test_api_lifecycle` integration for white opening resign.
- `TODO.md` section 4.1 resignation item complete.

## Difficulty presets + advanced tuning (2026-05-17)

- Backend `backend/app/difficulty.py` now owns difficulty schema and built-in presets (`easy`, `normal`, `hard`, `impossible`), exposed by `GET /api/difficulty-presets`.
- API contract:
  - `POST /api/games` accepts optional `difficulty`.
  - Game state responses include `difficulty`.
- `InMemoryGameService` stores `GameState.difficulty` per session and uses it for all KataGo calls:
  - `max_visits` for analyze + candidate evaluation,
  - `top_n` for candidate truncation,
  - `randomness` for probabilistic non-top move selection from ranked shortlist.
- Randomness policy: with probability `randomness`, skip rank #1 and uniformly choose from ranks `2..top_n`; otherwise choose rank #1.
- Frontend:
  - `GameSetup` now loads/uses backend difficulty presets, includes Advanced panel (`max visits`, `top candidates`, `randomness`) and think-time disclaimer.
  - `BoardView` forwards the current game difficulty in `Try again`.
  - `App` fetches both `/api/presets` and `/api/difficulty-presets`.
- Tests added/updated:
  - Backend unit: `tests/unit/test_difficulty.py` and expanded `tests/unit/test_game_service.py`.
  - Backend integration: `tests/integration/test_api_lifecycle.py` for create-game difficulty + difficulty presets endpoint.
  - Frontend: `App.test.tsx`, `GameSetup.test.tsx`, `BoardView.test.tsx` for payload and try-again propagation.
- Validation passed: targeted backend tests, targeted frontend Vitest suite, `mypy .`, and `pytest -m lint`.
- Follow-up: candidate truncation now happens after full candidate evaluation/ranking (min black probability first, then survival score tie-break), so `top_n` limits only the final ranked shortlist used for selection/response.

## Turn indicator and last-move marker (2026-05-17)

- Backend `GameState.last_move` tracks the most recent played coordinate; exposed on `GET /api/games/{id}` and move responses.
- Frontend `BoardView`: status line (`Black to play` / `White to play` / `Game over`) plus Shudan `markerMap` point on `last_move`.
- Helpers in `frontend/src/lib/coordinates.ts`: `markerMapFromLastMove`, `formatToPlayLabel`, `formatTurnStatusLabel` (human “to play” vs engine “is thinking…” using `human_side` and `isTurnInProgress`).
- `TODO.md` section 4.1 turn/marker item complete; turn-status copy item complete (2026-05-17).

## Frontend layout overhaul for gameplay focus (2026-05-17)

- `App` now has two distinct foreground modes:
  - setup mode (`gameId === null`) shows title + `GameSetup` card only.
  - playing mode hides setup controls entirely and shows only the board stage.
- `BoardView` now renders a split `play-surface`:
  - `Board area` for turn indicator + goban (largest region).
  - right `Analysis panel` for Analyze/New Game controls and engine reasoning.
- `EngineReasoning` candidate table now includes a numbered rank column (`#`) so right-panel candidate moves are visibly ordered.
- CSS in `frontend/src/index.css` updated for board-dominant layout, setup-card foreground styling, and responsive collapse to one column on narrow viewports.
- `TODO.md` section 4.1 layout item marked complete.
- Validation passed:
  - `npm --prefix frontend test -- src/App.test.tsx src/components/BoardView.test.tsx --run`
  - `.venv/bin/python -m pytest tests/unit/test_frontend_components.py -m unit`
  - `.venv/bin/python -m mypy .`
  - `.venv/bin/python -m pytest -m lint`
  - `ReadLints` clean for touched frontend files.
- Follow-up UI fix after visual review:
  - removed forced width stretching on `.board-area .shudan-goban` that caused rectangular board texture with empty wood area.
  - increased `GobanBoard` default `vertexSize` from `24` to `30` so the square board stays visually dominant.
  - added `GobanBoard` unit test asserting default `vertexSize=30`.
  - validation: `npm --prefix frontend test -- src/components/GobanBoard.test.tsx src/components/BoardView.test.tsx src/App.test.tsx --run`, `ReadLints` clean.

## Shared KataGo client serialization (2026-05-17)

- `KataGoClient` now holds `threading.Lock` and wraps `_send_query` so concurrent analyze/candidate calls cannot interleave on stdin/stdout.
- Unit tests in `tests/unit/test_katago_client.py`:
  - `test_concurrent_send_query_serializes_stdin_access` — 4-thread pool; peak concurrent writes ≤ 1.
  - `test_concurrent_send_query_matches_response_by_query_id` — stray stdout lines for other ids are skipped per caller.
- `TODO.md` section 4.2 first two items complete; next: refactor `InMemoryGameService` to one shared analyzer.

## InMemoryGameService shared analyzer lifecycle (2026-05-17)

- `backend/app/game_service.py` now keeps a single optional `_katago_client` for the whole service (no per-game `_katago_clients` map).
- Shared client init is lazy via `_ensure_katago_client()` and occurs on game creation when `katago_client_factory` is configured.
- `delete_game()` now removes only in-memory game state; it does not stop KataGo.
- `shutdown()` stops the shared client once (if present) and clears game state.
- KataGo calls in analyze/engine paths now use the shared `_katago_for_game()` accessor.
- Unit tests updated in `tests/unit/test_game_katago_lifecycle.py`:
  - two games share one factory-created client,
  - delete does not call `stop()`,
  - shutdown calls `stop()` exactly once.
- Validation run:
  - `./.venv/bin/python -m pytest tests/unit/test_game_katago_lifecycle.py -q`
  - `./.venv/bin/python -m pytest tests/unit/test_game_service.py -q`
  - `./.venv/bin/python -m pytest tests/unit/test_app_lifecycle.py -q`
  - `./.venv/bin/python -m mypy .`
  - `./.venv/bin/python -m pytest -m lint -q`
- Full `./.venv/bin/python -m pytest -m "unit or integration" -q` currently fails outside this task scope:
  - live KataGo integration tests (`tests/integration/test_katago_game_api.py`, `tests/integration/test_katago_smoke.py`) in this environment,
  - frontend build contract errors in `src/components/BoardView.test.tsx` (`last_move` fixture typing).

## Shared KataGo multi-game integration tests (2026-05-17)

- `tests/integration/test_shared_katago_games.py`:
  - `test_two_games_analyze_without_crosstalk` — two presets (`white-flavoured`, `black-flavoured`); analyze returns correct `game_id`; board stone counts unchanged.
  - `test_two_games_engine_move_without_crosstalk` — sequential engine moves; each game gains exactly one stone; presets stay distinct.
  - `test_concurrent_analyze_and_engine_move_two_games` — `ThreadPoolExecutor(4)` runs analyze + engine-move on both games; responses bound to correct `game_id`; final boards consistent.
- Live KataGo subprocess tests require non-sandbox execution (subprocess blocked in default sandbox).
- Validation: `pytest tests/integration/test_shared_katago_games.py -m integration`, `flake8`, `mypy .`, `pytest -m lint`.

## KataGo Docker analysis config (2026-05-17)

- `third_party/katago/analysis.docker.cfg`: container-oriented override (`numAnalysisThreads=1`, `numSearchThreadsPerAnalysisThread=4`, smaller `nnCacheSizePowerOfTwo` / `nnMaxBatchSize`); header documents `KATAGO_ANALYSIS_TIMEOUT_SECONDS` for queued load.
- `docs/development/katago-docker.md`: thread/timeout sizing, queue behavior, logDir, verify commands; linked from `katago-wsl-linux.md` and `.env.example`.
- `tests/unit/test_katago_analysis_configs.py`: asserts local + docker cfg files and key settings.
- Validation: `pytest tests/unit/test_katago_analysis_configs.py -m unit`, `mypy .`, `pytest -m lint`.

## Shared KataGo engine documentation (2026-05-17)

- `docs/development/shared-katago-engine.md`: canonical doc for one subprocess, request queueing + `KATAGO_ANALYSIS_TIMEOUT_SECONDS`, one model in RAM (`delete_game` vs `shutdown`), idle games after tab close vs New game `DELETE`.
- Linked from `local-run.md`, `katago-wsl-linux.md`, `katago-docker.md`, `README.md`.
- `tests/unit/test_shared_katago_docs.py`: unit gate on doc presence and cross-links.
- `TODO.md` section 4.2 complete.
- Validation: `pytest tests/unit/test_shared_katago_docs.py -m unit`, `mypy .`, `pytest -m lint`.

## Docker Compose local packaging (2026-05-17)

- `docker-compose.yml`: `backend` (FastAPI + KataGo via `docker/backend/Dockerfile`, healthcheck) + `frontend` (nginx on host `8080`, proxies `/api` and `/health`).
- `docker/backend/Dockerfile`: runs `scripts/setup_katago.sh` at build into `/opt/katago`; uses `analysis.docker.cfg`; `KATAGO_ANALYSIS_TIMEOUT_SECONDS=45`.
- `docker/frontend/Dockerfile` + `nginx.conf`: Vite production build, SPA fallback, API proxy to `backend:8000`.
- `.dockerignore`, `.env.docker.example`, `docs/development/docker-compose.md`; linked from `local-run.md`, `README.md`, `katago-docker.md`.
- `tests/unit/test_docker_packaging.py`: compose/Dockerfile/nginx/doc contract tests.
- `TODO.md` section 5 first item complete.
- Validation: `pytest tests/unit/test_docker_packaging.py tests/unit/test_local_run_docs.py -m unit`, `mypy .`, `pytest -m lint`.

## Environment templates and production-safe defaults (2026-05-17)

- `docs/development/environment.md`: canonical env var reference (required/optional, local vs Docker profiles, timeout/queue guidance, production-safe practices, Compose overrides).
- `.env.example` / `.env.docker.example`: all six backend vars with documented defaults (`30` vs `45` timeout).
- Linked from `local-run.md`, `docker-compose.md`, `katago-docker.md`, `README.md`.
- `tests/unit/test_env_docs.py`: contract tests for doc + templates + cross-links; `test_docker_packaging` requires `environment.md` in docker-compose doc.
- `TODO.md` section 5 second item complete.
- Validation: `pytest tests/unit/test_env_docs.py tests/unit/test_docker_packaging.py -m unit`, `mypy .`, `pytest -m lint`.

## Release checklist (2026-05-17)

- `docs/development/release-checklist.md`: pre-tag/pre-deploy gate — `run_tests.sh full` / `release`, step-by-step lint/types/unit/integration/e2e, manual smoke, optional Docker, troubleshooting.
- `scripts/run_tests.sh`: `release` alias (same as `full`); `Makefile` `test-release`.
- Linked from `README.md`, `local-run.md`, `tests/README.md`.
- `tests/unit/test_release_checklist.py`: doc contract + README/local-run links + `release` command in runner.
- `TODO.md` section 5 complete (local run & packaging).
- Validation: `pytest tests/unit/test_release_checklist.py tests/unit/test_test_runner.py -m unit`, `pytest -m lint`.

## Cloud deployment topology (AWS ECS MVP) (2026-05-17)

- Added `docs/development/cloud-aws-ecs-topology.md` defining section 6 MVP topology:
  - AWS + ECS backend with a single service/task and shared in-process KataGo.
  - Frontend hosting recommendation: `S3 + CloudFront`.
  - Namecheap domain integration options (keep DNS vs Route 53 delegation).
  - Secrets strategy: AWS Secrets Manager for sensitive values.
  - Manual deploy flow and post-deploy smoke checks (`GET /health`, `/api/presets`, quick gameplay path).
- Linked topology doc from `README.md` References section.
- Added `tests/unit/test_cloud_topology_docs.py` to gate doc presence/content and README link.
- `TODO.md` section 6 first item marked complete.

## Cloud backend container image (2026-05-17)

- `docs/development/cloud-backend-container.md`: deployable backend image (`docker/backend/Dockerfile`), fixed in-image `KATAGO_*` paths, `build_backend_image.sh`, ECR push flow, ECS env snippet, HEALTHCHECK.
- `scripts/build_backend_image.sh`: `docker build -f docker/backend/Dockerfile`; optional `ECR_REGISTRY` auto-tag.
- `docker/backend/Dockerfile`: added `HEALTHCHECK` on `GET /health` for ECS/standalone runs.
- Linked from `cloud-aws-ecs-topology.md`, `environment.md` (Cloud deploy profile), `README.md`.
- `tests/unit/test_cloud_backend_container.py`: doc/script/Dockerfile/topology/README/env contract tests.
- `TODO.md` section 6 second item complete; next: production frontend build/publish path.
- Validation: `pytest tests/unit/test_cloud_backend_container.py tests/unit/test_cloud_topology_docs.py tests/unit/test_docker_packaging.py -m unit`, `mypy .`, `pytest -m lint`.

## Cloud frontend static build and publish (2026-05-17)

- `frontend/src/lib/api.ts`: `apiUrl()` prefixes paths with `VITE_API_BASE_URL` when set (cloud split-domain); same-origin relative paths when unset (dev proxy, Docker nginx).
- `frontend/.env.production.example`, `scripts/build_frontend.sh`, `scripts/publish_frontend_s3.sh` (S3 sync + optional CloudFront invalidation).
- `docs/development/cloud-frontend-static.md`: build/publish flow, CORS, smoke checks; linked from topology, backend container doc, `environment.md`, `README.md`.
- `backend/app/config.py`: `CORS_ALLOW_ORIGINS` (comma-separated, `NoDecode`); defaults include Vite `5173` and Compose nginx `8080`.
- All frontend `fetch` calls use `apiUrl()`.
- `tests/unit/test_cloud_frontend_static.py`, `frontend/src/lib/api.test.ts`, extended `test_config.py`.
- `TODO.md` section 6 third item complete; next: document cloud env vars, resource sizing, and KataGo timeouts.
- Validation: `pytest tests/unit/test_cloud_frontend_static.py tests/unit/test_config.py -m unit`, `npm --prefix frontend test -- src/lib/api.test.ts`, `mypy .`, `pytest -m lint`.

## Cloud env, sizing, and KataGo timeouts (2026-05-17)

- `docs/development/cloud-env-and-sizing.md`: canonical ECS/Fargate env table (all `KATAGO_*`, `CORS_ALLOW_ORIGINS`, `VITE_API_BASE_URL` at build), CPU/RAM starting points, timeout-by-load table, tuning order, ALB vs app timeouts, example ECS JSON.
- Linked from topology (sizing section shortened), `cloud-backend-container.md`, `environment.md` cloud profile, `README.md`.
- `TODO.md` section 6 fourth item complete; next: deploy automation with post-deploy smoke checks.

## Cloud deploy automation and smoke (2026-05-17)

- `backend/app/deploy/smoke.py`: `run_deploy_smoke_checks` — `GET /health`, `GET /api/presets`, optional `POST /api/games` + `POST .../analyze`.
- `scripts/smoke_deploy.py`: CLI (`API_BASE_URL`, `--with-analyze`, `--timeout` / `SMOKE_TIMEOUT_SECONDS`).
- `scripts/deploy_cloud.sh`: orchestrates backend build (+ optional ECR push), frontend build/publish (`S3_BUCKET`), smoke; skip via `SKIP_BACKEND` / `SKIP_FRONTEND` / `SKIP_SMOKE`; `SMOKE_WITH_ANALYZE=1`.
- `docs/development/cloud-deploy-automation.md`: usage, env table, two-step ECS rollout pattern.
- Linked from topology, cloud-env-and-sizing, `README.md`.
- `tests/unit/test_deploy_smoke.py`: smoke helpers, CLI, script/doc contracts.
- `TODO.md` section 6 fifth item complete; next: AWS setup runbook (zero to custom domain).
- Validation: `pytest tests/unit/test_deploy_smoke.py -m unit`, `mypy .`, `pytest -m lint`.
- Validation: doc review only (no doc tests per `.cursor/rules/development.mdc`).

## AWS zero-to-domain runbook (2026-05-17)

- Added `docs/development/cloud-aws-zero-to-domain-runbook.md` with day-zero AWS setup from account bootstrap through ECR/ECS/ALB/S3/CloudFront/ACM/Namecheap DNS and smoke verification.
- Linked runbook from `docs/development/cloud-aws-ecs-topology.md` and `README.md`.
- Marked `TODO.md` section 6 final item complete (cloud deployment section now fully checked).
- Expanded the runbook with detailed least-privilege IAM guidance: distinct principals (deployer, execution role, task role), concrete AWS action families, `iam:PassRole` scoping, and starter policy skeletons.
- Rewrote runbook again as a single full walkthrough: no assumed AWS CLI login, Console navigation paths for IAM user + ECS roles, deployer policy JSON, VPC/ALB/ECS/S3/CloudFront/ACM/Namecheap in order, checkpoints, troubleshooting appendix, printable checklist.
- User feedback: ECS/ALB/CloudWatch overkill for current stage. **Default runbook** is now one EC2 + `docker compose` + Caddy (`docker-compose.prod.yml` binds localhost). Heavy path moved to `cloud-aws-ecs-full-runbook.md`; topology doc points to simple path first.
- Validation: doc review only (documentation task; no new doc tests).

## Policy: no documentation tests (2026-05-17)

- `.cursor/rules/development.mdc` and `testing.mdc` forbid new pytest that grep markdown/README/docs. Legacy `test_*_docs.py` files remain until explicitly removed; do not extend them.

## Phase close: UX, shared KataGo, packaging, cloud MVP (2026-05-17)

**Delivered (sections 4.1–6 partial in `TODO.md`):**

- **UX (4.1):** click-to-move + auto engine reply; per-preset side choice; AI resignation thresholds; difficulty presets (Easy–Impossible); turn/status banner; board-first layout with setup overlay; `last_move` marker on board.
- **Shared KataGo (4.2):** singleton client with serialized `_send_query`; `InMemoryGameService` uses one analyzer; `delete_game` drops state only; `shutdown()` stops engine on app exit; `test_shared_katago_games.py`; `shared-katago-engine.md`, `analysis.docker.cfg`.
- **Local run & packaging (5):** `local-run.md`, Docker Compose (`docker-compose.yml`, `docker/`), `environment.md`, `release-checklist.md`, `run_tests.sh` `release` alias.
- **Cloud MVP (6, 5/6 items):** ECS topology, backend image (`docker/backend/Dockerfile`, `build_backend_image.sh`), frontend static publish (`apiUrl()`, `build_frontend.sh`, `publish_frontend_s3.sh`, `CORS_ALLOW_ORIGINS`), env/sizing doc, deploy automation (`deploy_cloud.sh`, `smoke_deploy.py`, `backend/app/deploy/smoke.py`).

**Outstanding:** sections 7–9 (`TODO.md`: integration fixtures, logging/errors, polish docs).

**Close-phase validation:** `pytest -m lint`, `mypy .`, `pytest -m "unit or integration"` — 291 passed. No `@pytest.mark.e2e` tests in tree yet.

**Close-phase fixes:** `cloud-aws-ecs-topology.md` smoke section mentions `GET /health`; `BoardView.test.tsx` `activeGame()` helper defaults `last_move` without TS2783 duplicate-key error.
