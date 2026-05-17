# Project memory

## Scaffold (2026-05-16)

- `backend/app/main.py`: minimal FastAPI app (`survival-katago`), CORS for Vite on port 5173.
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

- `GET /health` returns `{"status":"ok","service":"survival-katago"}` (`HealthResponse` in `backend/app/main.py`).
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

## Close phase — backend + KataGo (2026-05-17)

- Sections 1–3 in `TODO.md` complete: scaffold, core API, and KataGo integration (analyze + engine-move with `KATAGO_TOP_N`, live integration tests).
- Next work: section 4 (frontend/UX), then integration hardening (section 5), non-functional (section 6), docs (section 7).
- E2E skipped: no UF flows beyond template; UI not implemented.
- `analysis_logs/` gitignored (KataGo writes logs to repo cwd per `analysis.cfg`).
- Live KataGo integration tests require subprocess access outside the default sandbox; use `.venv/bin/python -m pytest` (system `pytest` shim may be broken on WSL).
- Close-phase verification (all pass):
  - `pytest -m lint`
  - `mypy .`
  - `pytest -m "unit or integration"` (132 passed, 1 skipped; live KataGo tests when `.env` configured)
