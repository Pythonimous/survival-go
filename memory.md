# Project memory

## Favicon, PWA manifest, and live play link (2026-05-20)

- Added cherry-blossom favicon set under `frontend/public/` (`.ico`, 16/32 PNG, Apple touch, Android chrome 192/512) and `site.webmanifest`; wired links in `frontend/index.html`.
- Twemoji CC-BY 4.0 attribution recorded in `docs/development/favicon-attribution.txt` and `THIRD_PARTY_NOTICES.md`.
- README now links to production at https://survival-go.com/.
- Close-phase validation: `pytest -m lint`, `mypy .`, `pytest -m "unit or integration"` (278 passed), `npm --prefix frontend test -- --run` (139 passed), `npm --prefix frontend run build` passed.

## Engine-move rerank without per-candidate ownership (2026-05-20)

- Browser engine-move path now shortlists the top **12** legal moves by root MCTS visit probability (`ENGINE_MOVE_POLICY_CANDIDATE_COUNT`) and posts each child's **policy / winrate / score_lead** from search — no second ONNX pass per candidate for ownership.
- `backend/app/game_service.py` builds `CandidateMove` rows from browser MCTS stats (`_candidate_move_from_browser_stats`); `move_selector` prefers **winrate** when present, else ownership Survival (`_ranking_term`). Root position metrics/winrate/score still come from the single root analyze call; resignation unchanged.
- `EngineMoveResult` and API responses expose optional root `winrate` / `score_lead`; candidate panel lists the post-rerank `top_n` shortlist (blunder filter removed from engine-move finalize — temperature sampling still applies at selection).
- MCTS (`onnx-mcts.ts`) averages child **ownership** across visits (`childOwnershipSum` / `childOwnershipCount`) for nodes that need ownership on the analyze path.
- UI: renamed `survivalDisplay` → `analysisDisplay.ts` — human-perspective win rate/score labels via Kaya `processAnalysis`, candidate table sorted by side-aware winrate then score; `EngineReasoning` / `BoardView` updated. `GameSetup` advanced hints document the new top-12 MCTS → backend rerank flow.
- Added `CONTRIBUTORS.md` (Kirill Nikolaev, Renan Cruz) and README link.
- Close-phase validation: `pytest -m lint`, `mypy .`, `pytest -m "unit or integration"` (278 passed), `npm --prefix frontend test -- --run` (139 passed), `npm --prefix frontend run build` passed.

## Backend ownership mapping supports richer outputs (2026-05-19)

- `backend/app/game_service.py` now interprets `ownership` as direct `p_black` only on richer ONNX paths (when `value` or `miscvalue` is present) and values are already in `[0,1]`; otherwise it keeps legacy raw-ownership conversion `(v + 1) / 2`.
- This preserves existing raw `[-1,1]` behavior for older fixtures while allowing richer payloads to supply probability-scale ownership without double-conversion.
- Added unit regression in `tests/unit/test_game_service.py` (`test_analyze_raw_model_outputs_accepts_probability_ownership_scale`).
- Validation run: `pytest tests/unit/test_game_service.py`, targeted analyze integration in `tests/integration/test_api_lifecycle.py -k analyze_accepts_raw_onnx_outputs_payload`, `mypy .`, and `pytest -m lint` all pass.

## ONNX sync local mode for AWS-free testing (2026-05-18)

- Updated `scripts/sync_onnx_artifacts.sh` so destination can be S3 and/or local.
- New destination env:
  - `ONNX_ARTIFACT_LOCAL_DIR` (local mirror target; works without `aws` CLI)
  - `ONNX_ARTIFACT_BUCKET` remains optional unless S3 upload is desired
- Script now requires at least one destination, and only checks for `aws` when S3 upload is enabled.
- Added unit test `test_sync_script_supports_local_destination_without_aws` in `tests/unit/test_sync_onnx_artifacts_script.py` to verify local copy mode.
- Added local workflow docs in `docs/development/onnx-model-artifacts.md` with a copy-paste command.
- Validation: `pytest tests/unit/test_sync_onnx_artifacts_script.py -m unit`, `mypy .`, and `pytest -m lint` all pass.

## ONNX artifact sync script added (2026-05-18)

- Added `scripts/sync_onnx_artifacts.sh` to automate pulling pinned ONNX artifacts from the manifest upstream (`source.repo_resolve_base_url` + `filename`), verifying each SHA-256, and uploading to `s3://$ONNX_ARTIFACT_BUCKET/$ONNX_ARTIFACT_PREFIX`.
- Script defaults:
  - manifest: `scripts/onnx_artifact_manifest.json` (override with `ONNX_ARTIFACT_MANIFEST`)
  - prefix: `kaya/<manifest.version>` (override with `ONNX_ARTIFACT_PREFIX`)
  - optional `AWS_REGION` and `DRY_RUN=1`
- Added executable-behavior tests in `tests/unit/test_sync_onnx_artifacts_script.py`:
  - happy path proves download + hash verify + S3 upload call and safe rerun
  - failure path proves hash mismatch aborts before upload
- Validation run for this task: `pytest tests/unit/test_sync_onnx_artifacts_script.py -m unit`, `mypy .`, and `pytest -m lint` all pass.

## ONNX ownership range validation relaxed (2026-05-18)

- Real browser ONNX runs can emit finite ownership values outside `[-1, 1]` (example `-2.6357421875`), which caused frontend contract failures in `runOnnxSpikeInference`.
- Frontend now matches backend behavior: `validateOnnxRawOutput()` in `frontend/src/lib/analysis/onnx/io/contract.ts` enforces shape + finiteness only (no hard `[-1, 1]` gate), while `decodeOnnxRawOutput()` continues clamping `(value + 1)/2` into `[0, 1]` for `pBlack`.
- Tests updated: `contract.test.ts` now accepts out-of-range finite ownership; `decode.test.ts` asserts out-of-range ownership clamps to `0`/`1`.

## ONNX Runtime Web WASM for Vite (2026-05-18)

- Original failure: WebGPU needs `ort-wasm-simd-threaded.jsep.wasm`; Vite prebundling rewrote ORT's `import.meta.url`, so the wasm fetch returned HTML → “failed to match magic number”. Putting the file in `/public/` and pointing `wasmPaths` there worked for the `.wasm` but **broke the `.mjs` loader** because Vite refuses `import()` of files in `/public/` ("This file is in /public … should not be imported from source code").
- Dev fix: `vite.config.ts` sets `optimizeDeps.exclude: ["onnxruntime-web"]`, so the package is served straight from `node_modules` and ORT's native `new URL("…wasm", import.meta.url)` / dynamic `import("…mjs")` both resolve correctly.
- Prod path: `frontend/scripts/copy-ort-wasm.mjs` (wired as `postinstall`/`prebuild`) copies `ort-wasm-simd-threaded*.{wasm,mjs}` into `frontend/public/onnx-wasm/` (gitignored). `browserOnnxWasmConfig()` in `runtime/browserWasm.ts` only sets `ort.env.wasm.wasmPaths` when `import.meta.env.DEV` is false; in dev it returns `{}` so ORT keeps using `import.meta.url`. `scripts/run_frontend.sh` still copies if `jsep.wasm` missing.

## Server KataGo purge (2026-05-18)

- Removed `third_party/katago/`, `scripts/setup_katago.sh`, `backend/app/katago/`, and `ServerKataGoProvider`.
- Backend is API-only: `POST /analyze` requires `raw_model_outputs`; `POST /engine-move` requires `browser_engine_move`.
- Settings: `SURVIVAL_THRESHOLD`, `DEFAULT_TOP_N`, `CORS_ALLOW_ORIGINS` (no `KATAGO_*`).
- Backend Docker image is slim Python + uvicorn; ONNX models ship with the frontend static bundle.

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

## Natural difficulty curve v2 (2026-05-17)

- `backend/app/difficulty.py` now includes expanded knobs (`variant_awareness`, `policy_anchor`, `score_anchor`, `temperature`, `blunder_margin`, `global_weight`, `local_weight`) with compatibility mapping from legacy `randomness`.
- `backend/app/katago/client.py` now returns structured candidate metadata via `KataGoMoveInfo` (`move`, `policy`, optional `score_lead`) instead of plain move strings.
- `backend/app/engine/move_selector.py` now implements composite side-aware scoring, blunder filtering (`best - blunder_margin`), and softmax temperature sampling while preserving deterministic `temperature=0` behavior.
- `backend/app/game_service.py` threads candidate metadata into `CandidateMove`, ranks with expanded difficulty config, filters reported candidate list by blunder margin, and selects via temperature sampler.
- Frontend contracts/UI updated:
  - `frontend/src/types/api.ts` `DifficultyConfig` now includes expanded fields.
  - `frontend/src/components/GameSetup.tsx` advanced controls now center on `Variant awareness` and `Variety temperature` (with legacy `randomness` serialized from temperature for backward compatibility).
- Validation completed:
  - `./.venv/bin/python -m pytest tests/unit/test_difficulty.py tests/unit/test_katago_client.py tests/unit/test_move_selector.py tests/unit/test_game_service.py -m unit`
  - `npm --prefix frontend test -- src/components/GameSetup.test.tsx src/App.test.tsx --run`
  - `./.venv/bin/python -m mypy .`
  - `./.venv/bin/python -m pytest -m lint`

## Human resign (2026-05-17)

- `InMemoryGameService.apply_human_resign`: sets `status=finished`, `winner=engine_side`; rejects finished games.
- API: `POST /api/games/{game_id}/resign` → `GameStateResponse`.
- Frontend: **Resign** in `BoardView` (confirm dialog); `GameOverDialog` supports `outcome` `human_win` | `human_loss`.

## Survival difficulty model docs (2026-05-17)

- Added concise newcomer-oriented explainer: `docs/development/survival-difficulty-model.md`.
- Covers old selector vs v2 pipeline, composite-score composition, tuning guidance, threshold semantics, and glossary.
- Linked from `README.md` References.
- Marked TODO item complete: "Add docs for Survival scoring semantics and threshold tuning."

## Browser inference phase 7.0 (2026-05-18)

- Added `frontend/src/lib/analysis/`: `AnalysisProvider`, `AnalysisResult`, `PositionInput`, `ServerKataGoProvider` (default), `getAnalysisProvider()`, instrumentation (`instrumentedAnalysisCall`, `subscribeAnalysisInstrumentation`, fallback/load_status events).
- `BoardView` analyze + engine-move now go through the provider; game state fetch/resign/move still call API directly.
- `getCandidateMoves` throws on server provider (reserved for future browser ONNX path).
- Tests: `ServerKataGoProvider.test.ts`, `provider.test.ts`, `instrumentation.test.ts`; all 61 frontend tests pass; `npm run build` clean.

## Browser inference phase 7.1 — ONNX contract fixture (2026-05-18)

- `frontend/src/lib/analysis/onnx/contract.ts`: KataGo ONNX output contract for 19×19 (`policy` `[1,2,362]`, `ownership` `[1,1,19,19]`, ownership ∈ `[-1,1]`, optional `value` length 3).
- `frontend/src/lib/analysis/onnx/fixtures/emptyBoard19.ts`: deterministic empty-board position + `createDeterministicSyntheticOnnxOutput()` for contract tests.
- `contract.test.ts`: shape/range validation (8 tests). Full frontend suite: 69 passed.

## Browser inference phase 7.1 — runtime bootstrap (2026-05-18)

- Added `onnxruntime-web` frontend dependency.
- Added `frontend/src/lib/analysis/onnx/runtime.ts`:
  - `bootstrapOnnxRuntime()` dynamically imports `onnxruntime-web`.
  - Runtime provider selection is WebGPU-first with WASM fallback (`["webgpu","wasm"]` when supported, otherwise `["wasm"]`).
  - `detectWebGpuSupport()` handles browser/non-browser environments safely.
- Added `frontend/src/lib/analysis/onnx/runtime.test.ts` (4 tests) covering provider selection and bootstrap behavior.
- Validation run: `npm --prefix frontend test -- src/lib/analysis/onnx/contract.test.ts src/lib/analysis/onnx/runtime.test.ts` (pass).

## Browser inference phase 7.1 — session/inference plumbing only (2026-05-18)

- `frontend/src/lib/analysis/onnx/runtime.ts` now includes:
  - `createOnnxSessionFromArtifact({ modelArtifactUrl, isWebGpuSupported? })`: fetches ONNX bytes and creates `InferenceSession` with runtime-selected execution providers.
  - `runSinglePositionInference({ session, feeds, outputNames })`: runs one inference and extracts policy/ownership/value tensor data with output guards.
- `frontend/src/lib/analysis/onnx/runtime.test.ts` adds mocked-path coverage (fetch + `onnxruntime-web` fully stubbed; no real `.onnx` in repo).
- **Not done yet:** load a real ONNX artifact and run one position end-to-end in browser (or integration test without mocks). TODO 7.1 item remains unchecked until that is proven.

## Browser inference phase 7.2 — encoder uses side-to-move primitive (2026-05-18)

- `frontend/src/lib/analysis/onnx/encoder.ts`: `encodePositionV7` now uses `input.sideToMove` directly for stone planes, move-history planes, and global features (no recomputed turn from replay).
- `frontend/src/lib/analysis/onnx/boardState.ts`: replay board state now returns only `{ size, cells }`; it no longer mutates/returns `sideToMove`.
- Added regression test in `frontend/src/lib/analysis/onnx/encoder.test.ts` proving last-move history plane and komi sign follow the provided `sideToMove`.
- `TODO.md` item 7.2.1 ("Implement frontend model-input encoder from game state primitives...") marked complete after test pass.
- Validation in this environment: `npm --prefix frontend test -- encoder.test.ts` and `npm --prefix frontend test -- boundary.test.ts` pass; Python gates (`mypy .`, `pytest -m lint`) are blocked by local pyenv shim/missing module setup.

## Browser inference phase 7.2 — raw outputs transported to backend (2026-05-18)

- Added `frontend/src/lib/analysis/onnx/transport.ts` with `postRawOnnxOutputsForAnalysis({ gameId, raw })` that posts `raw_model_outputs` containing only numeric arrays (`policy`, `ownership`, optional `value`) to `POST /api/games/{id}/analyze`.
- `frontend/src/lib/analysis/onnx/spike.ts` now returns `raw` tensors in `OnnxSpikeResult`; `OnnxDebugPanel` now sends those raw outputs to backend after local inference and reports backend survival score.
- Backend `POST /api/games/{id}/analyze` now accepts optional `AnalyzeRequest.raw_model_outputs`; when present, it evaluates via `InMemoryGameService.analyze_raw_model_outputs(...)` instead of querying KataGo.
- `InMemoryGameService.analyze_raw_model_outputs` validates ownership length against board points and converts raw ownership `[-1,1]` to clamped `p_black` `[0,1]` before `evaluate_survival_position`.
- Tests added: `frontend/src/lib/analysis/onnx/transport.test.ts`, `tests/integration/test_api_lifecycle.py::test_analyze_accepts_raw_onnx_outputs_payload`, and `tests/unit/test_game_service.py::test_analyze_raw_model_outputs_uses_backend_interpretation`.

## Browser inference phase 7.2 — backend canonical AnalysisResult mapping (2026-05-18)

- Added backend canonical analysis contract in `backend/app/game_service.py`:
  - New `AnalysisResult` dataclass carries `survival_score`, `metrics`, optional `policy`, `p_black`, `score_lead`, and `winrate`.
  - `analyze_raw_model_outputs(...)` now decodes raw outputs server-side:
    - policy logits -> softmax probabilities over `board_points + 1`,
    - ownership `[-1,1]` -> clamped `p_black` `[0,1]`,
    - optional value logits -> `winrate` (softmax first component),
    - survival metrics still computed via `evaluate_survival_position(...)`.
  - Added raw policy-length validation with explicit `GameServiceError`.
- Extended `POST /api/games/{id}/analyze` response in `backend/app/main.py` with optional `policy`, `p_black`, `score_lead`, and `winrate` fields.
- Updated frontend analysis adapters to preserve backend-derived semantics:
  - `frontend/src/lib/analysis/ServerKataGoProvider.ts`
  - `frontend/src/lib/analysis/onnx/transport.ts`
  - both now map `p_black` -> `pBlack` and pass through optional `policy` / `scoreLead` / `winrate`.
- Validation completed:
  - `./.venv/bin/python -m pytest tests/unit/test_game_service.py::test_analyze_raw_model_outputs_uses_backend_interpretation tests/unit/test_game_service.py::test_analyze_raw_model_outputs_rejects_short_policy_logits tests/integration/test_api_lifecycle.py::test_analyze_accepts_raw_onnx_outputs_payload -m "unit or integration"`
  - `npm --prefix frontend test -- src/lib/analysis/ServerKataGoProvider.test.ts src/lib/analysis/onnx/transport.test.ts --run`
  - `./.venv/bin/python -m mypy .`
  - `./.venv/bin/python -m pytest -m lint`

## Browser inference phase 7.2 — backend parity thresholds in tests (2026-05-18)

- Added `tests/unit/test_game_service.py::test_analyze_raw_model_outputs_enforces_backend_parity_thresholds`.
- The test defines backend-owned parity gates on raw-output interpretation deltas:
  - mean absolute delta <= `1e-12`
  - p95 absolute delta <= `1e-12`
  - max absolute delta <= `1e-12`
- It validates clipping/normalization parity from raw ownership `[-1, 1]` to canonical `p_black` `[0, 1]` and also checks unresolved/min-probability metrics remain backend-derived.
- `TODO.md` item 7.2 parity-threshold task is now checked.
- Validation in this environment:
  - `./scripts/run_tests.sh lint` passed
  - `./scripts/run_tests.sh types` passed
  - `./scripts/run_tests.sh unit` still fails due to pre-existing frontend TypeScript build errors in `src/lib/analysis/onnx/encoder.ts` and `src/lib/analysis/onnx/verbose.ts` (unrelated to this backend test change).

## Browser inference phase 7.2 — regression fixtures (2026-05-18)

- Shared JSON fixtures in `tests/fixtures/onnx_regression/` (`empty_board_19_black`, `one_move_white_to_play`, `partial_resolved_ownership`) with position, encoding spot-checks, `rawGenerator`, and backend-owned `expectedAnalysis`.
- Mirrored raw tensor generators in `tests/fixtures/onnx_regression/generators.py` and `frontend/src/lib/analysis/onnx/fixtures/regression/generators.ts` (`deterministic_v1`, `partial_resolved`).
- Frontend `pipeline.regression.test.ts`: TS `encodePositionV7` + contract validation per fixture.
- Backend `tests/unit/test_onnx_regression_fixtures.py`: `analyze_raw_model_outputs` assertions per fixture.
- Integration `tests/integration/test_onnx_regression_pipeline.py`: `POST /analyze` with `raw_model_outputs` end-to-end.
- `emptyBoard19.ts` synthetic outputs now delegate to shared `createDeterministicV1RawOutputs`.
- Section 7.2 complete in `TODO.md`.

## Browser inference phase 7.3 — engine-move tests (2026-05-18)

- Shared fixtures in `tests/fixtures/onnx_engine_move/` (rerank by min black, resignation, top-N shortlist) with compact ownership profiles.
- Backend `tests/integration/test_onnx_engine_move_fixtures.py`: raw ONNX → `analyze_raw_model_outputs` → `rank_candidates_for_side` / `select_candidate_for_side` / resignation checks.
- Frontend `candidates.ts` + `engineMovePayload.ts` (numeric-only extraction/transport) with `candidates.test.ts` and `engineMove.integration.test.ts`.
- Skipped API contract tests in `tests/integration/test_onnx_engine_move_pipeline.py` until `POST /engine-move` accepts `browser_engine_move` payload.
- `TODO.md` 7.3 tests bullet checked; implementation bullets remain open.

## Frontend ONNX build stabilization (2026-05-18)

- Fixed frontend TypeScript/build blockers in ONNX analysis modules:
  - `encoder.ts`: corrected `StoneColor` type import path to `src/types/api`.
  - `verbose.ts`: removed unused `DecodedOnnxOutput` import and fixed KataGo-index -> GTP coordinate conversion to use board-space Y (`A19` for top-left on 19x19, not `A1`).
  - `nodeWasm.ts`: switched Node builtins (`node:module`, `node:path`) to dynamic imports inside `configureNodeOnnxWasm` and made it async.
  - `runtime.ts`: awaited async Node WASM configuration call.
- Added regression test `frontend/src/lib/analysis/onnx/verbose.test.ts` to lock correct top-policy move coordinate formatting.
- Validation:
  - `npm --prefix frontend test -- src/lib/analysis/onnx/encoder.test.ts src/lib/analysis/onnx/runtime.test.ts src/lib/analysis/onnx/verbose.test.ts --run` passed.
  - `npm --prefix frontend run build` passed (warnings remain about browser externalization, but build completes).

## Browser inference phase 7.3 — engine-move implementation (2026-05-18)

- Backend `POST /api/games/{game_id}/engine-move` now accepts optional `browser_engine_move` payload (`position_raw` + per-candidate `raw_model_outputs`) and routes it through `InMemoryGameService.apply_engine_move_from_browser_payload`.
- Added `BrowserEngineMoveCandidate` and browser payload execution path in `backend/app/game_service.py`, reusing existing resignation, ranking, top-N shortlist, blunder filter, and candidate-panel response contract.
- Frontend ONNX local loop added in `frontend/src/lib/analysis/onnx/engineMoveLoop.ts`: root inference → policy extraction → per-candidate child inference → numeric payload assembly.
- Added `BrowserOnnxProvider` (`frontend/src/lib/analysis/BrowserOnnxProvider.ts`) to execute browser ONNX analyze/engine-move transport without semantic scoring in TS.
- API regression fixtures in `tests/integration/test_onnx_engine_move_pipeline.py` are active (unskipped) and now map fixture move slots to legal coordinates for real `/engine-move` requests.
- `tests/integration/test_api_lifecycle.py` kata-go candidate monkeypatch now returns `KataGoMoveInfo` (not raw strings), and difficulty assertion checks key fields instead of exact dict equality.
- Validation on this change set:
  - `.venv/bin/pytest tests/integration/test_onnx_engine_move_pipeline.py tests/integration/test_api_lifecycle.py -q` passed.
  - `npm --prefix frontend test -- --run src/lib/analysis/onnx/engineMoveLoop.test.ts src/lib/analysis/BrowserOnnxProvider.test.ts src/lib/analysis/onnx/transport.test.ts` passed.
  - `.venv/bin/mypy .` passed.
  - `.venv/bin/pytest -m lint -q` passed.

## Browser inference phase 7.4 — parity test cleanup (2026-05-18)

- Default analysis provider now points to `BrowserOnnxProvider` (`frontend/src/lib/analysis/provider.ts`), and provider wiring test expects `browser-onnx`.
- Removed backend parity threshold unit test from `tests/unit/test_game_service.py` (`test_analyze_raw_model_outputs_enforces_backend_parity_thresholds`) and deleted now-redundant percentile helper.
- Removed parity/regression fixture test suites:
  - `frontend/src/lib/analysis/onnx/pipeline.regression.test.ts`
  - `tests/unit/test_onnx_regression_fixtures.py`
  - `tests/integration/test_onnx_regression_pipeline.py`
- Validation after cleanup:
  - `npm --prefix frontend run test -- src/lib/analysis/onnx/contract.test.ts src/lib/analysis/onnx/candidates.test.ts src/lib/analysis/provider.test.ts` passed.
  - `.venv/bin/python -m pytest tests/unit/test_game_service.py -k "analyze_raw_model_outputs or apply_engine_move_uses_katago_candidates_and_survival_rerank"` passed.

## Browser inference phase 7.4 — runtime capability policy (2026-05-18)

- Added `frontend/src/lib/analysis/onnx/capability.ts` with explicit runtime probe/evaluation for:
  - WebGPU availability (`navigator.gpu`)
  - WASM availability (`WebAssembly.instantiate`)
  - Memory viability (`navigator.deviceMemory`, threshold >= 2 GiB when known)
  - Runtime viability (`navigator.hardwareConcurrency`, threshold >= 2 when known)
- Capability evaluator returns structured blockers (`wasm_unavailable`, `low_device_memory`, `low_cpu_concurrency`) plus `supported`/`runtimeViable` booleans.
- `frontend/src/lib/analysis/provider.ts` now exposes `getDefaultAnalysisProviderSelectionPolicy()` with explicit reason:
  - `browser_onnx_primary` when capability is supported
  - `browser_onnx_constrained_runtime` when capability is insufficient
- Added test-only override hook `setOnnxRuntimeCapabilityForTests(...)` to make provider policy deterministic in unit tests.
- Frontend tests added:
  - `frontend/src/lib/analysis/onnx/capability.test.ts`
  - `frontend/src/lib/analysis/provider.test.ts` policy assertions for viable and constrained runtimes.
- Validation:
  - `npm --prefix frontend test -- src/lib/analysis/provider.test.ts src/lib/analysis/onnx/capability.test.ts` passed.
  - Python `mypy` / `pytest -m lint` could not be executed in this shell due missing/broken Python toolchain (`/mnt/c/.../pyenv-win/shims/*` and missing `python3` modules).

## Browser inference phase 7.4 — analysis runtime UX (2026-05-18)

- Added ONNX model load progress reporting via `loadProgress.ts` (`downloading` → `initializing` → `ready`/`error`) with `load_status` instrumentation events.
- `spike.ts` session creation now emits progress phases; `warmup.ts` preloads the selected artifact on app startup (skipped when WASM unavailable).
- Added user-facing copy helpers in `runtimeUx.ts` and `AnalysisRuntimeBanner` on the setup screen (incompatible browser alert, constrained-runtime uint8 fallback notice, download/init progress, ready state).
- `GameSetup` disables **Start game** while the model is loading or when browser inference is blocked.
- Tests: `loadProgress.test.ts`, `runtimeUx.test.ts`, `AnalysisRuntimeBanner.test.tsx`; `App.test.tsx` mocks warmup.
- Validation: frontend targeted vitest slice passed; `npm run build` passed; `pytest -m lint` and `mypy .` passed.

## Browser inference phase 7.4 — weakest ONNX model fallback (2026-05-18)

- Added `frontend/src/lib/analysis/onnx/modelVariant.ts`:
  - `fp32` preferred when `OnnxRuntimeCapability.supported` is true.
  - `uint8` (`/models/kaya.uint8.onnx`) as the single constrained-runtime fallback when preferred viability checks fail.
- Moved runtime capability test override to `capability.ts` (`getActiveOnnxRuntimeCapability`, `setOnnxRuntimeCapabilityForTests`).
- `provider.ts` selection policy now includes `model` (`variant`, `modelArtifactUrl`, `reason`).
- `spike.ts` session creation resolves artifact URL from active capability via `getOnnxModelArtifactSelection()`.
- Tests: `modelVariant.test.ts`, `spike.modelVariant.test.ts`, extended `provider.test.ts`.
- Validation:
  - `npm --prefix frontend test -- src/lib/analysis/onnx/modelVariant.test.ts src/lib/analysis/provider.test.ts src/lib/analysis/onnx/spike.modelVariant.test.ts src/lib/analysis/onnx/spike.test.ts` passed.
  - `.venv/bin/python -m pytest -m lint -q` passed.

## Browser inference phase 7.4 — rollout metrics and operator runbook (2026-05-18)

- New `onnx_model_selected` instrumentation event emitted from `frontend/src/lib/analysis/onnx/spike.ts` after a successful ONNX session load (variant + selection reason from `getOnnxModelArtifactSelection()`).
- `frontend/src/lib/analysis/rolloutMetrics.ts` subscribes to analysis instrumentation and aggregates per-operation success/failure/latency, overall success rate, ONNX primary vs constrained selection counts, fallback rate, and model load errors (`load_status` error).
- `ensureGlobalRolloutMetrics()` runs from `frontend/src/App.tsx` on mount; exposes `window.__SURVIVAL_GO_ROLLOUT_METRICS__` with `getSnapshot()` and `reset()` for operators/support (client-side only; no automatic telemetry).
- Operator doc: `docs/operations/browser-inference-rollout-runbook.md` (rollback, troubleshooting, snapshot field reference). Linked from `docs/development/browser-inference-design.md`.
- `spike.modelVariant.test.ts` updated to stub `fetch` and mock `createOnnxSessionFromBytes` (session path no longer uses `createOnnxSessionFromArtifact` directly).
- Validation: `npm --prefix frontend test -- --run src/lib/analysis/` passed; `npm --prefix frontend run build` passed. Full `npm test` may still fail in environments where BoardView tests hit real ONNX/WASM without a valid model fixture (pre-existing environment coupling).

## Browser inference phase 7.4 — ONNX artifact policy + third-party notices (2026-05-18)

- New `docs/development/onnx-model-artifacts.md`: canonical `fp32` / `uint8` / optional `fp16` table, default vs constrained fallback policy (matches `modelVariant.ts`), deploy path `frontend/public/models/`.
- `docs/development/browser-inference-design.md` updated: model artifact section points to the new doc; stale server-fallback wording trimmed; open question on default variant removed.
- `docs/operations/browser-inference-rollout-runbook.md`: Related docs links to artifact policy doc.
- `THIRD_PARTY_NOTICES.md`: `onnxruntime-web` (MIT) in frontend table; new “Browser ONNX model weights” section crediting Hugging Face `kaya-go/kaya`, GitHub `kaya-go/katago-onnx` (AGPL for converter repo), and KataGo upstream references.
- Doc-only change: no executable code or tests run for this slice.

## ONNX artifacts fetched from Hugging Face by default (2026-05-18)

- `frontend/src/lib/analysis/onnx/capability/modelVariant.ts` now resolves `ONNX_MODEL_ARTIFACT_URLS` at module load from two Vite env vars with HF defaults:
  - `VITE_ONNX_MODEL_BASE_URL` default: `https://huggingface.co/kaya-go/kaya/resolve/main/kata1-b28c512nbt-s12043015936-d5616446734`.
  - `VITE_ONNX_MODEL_FILENAME_PREFIX` default: `kata1-b28c512nbt-s12043015936-d5616446734`.
  - URL = `${base}/${prefix}.<variant>.onnx`. Trailing slash on base is trimmed.
- Confirmed CORS via `curl -H "Origin: https://example.com" -I`: both the `huggingface.co/.../resolve/main/...` 302 and the redirected `cas-bridge.xethub.hf.co` 200 reflect the requesting `Origin`. Final response is `Cache-Control: public, max-age=31536000`, `Accept-Ranges: bytes` (range requests + 1y cache).
- Self-hosted layout still works by overriding both env vars (`/models` + `kaya` to keep the legacy filenames). Picker UI is URL-agnostic.
- Test changes: `modelVariant.test.ts` no longer hardcodes local URLs (regex-matches `\.<variant>\.onnx$` + asserts HF default origin); `spike.modelVariant.test.ts` imports `ONNX_MODEL_ARTIFACT_URLS.uint8` instead of `/models/kaya.uint8.onnx`. `selection.test.ts` already pulls URLs from the module.
- `.gitignore`: added `frontend/public/models/*.onnx` so local mirror copies aren't accidentally committed.
- Docs: `docs/development/onnx-model-artifacts.md` now documents the HF default + override env vars; `frontend/.env.production.example` gained commented-out override examples.

## Model picker on setup screen (2026-05-18)

- New game screen now requires the user to **explicitly pick and load an ONNX model variant** before Start game enables.
- Added `fp16` as a first-class variant alongside `fp32` and `uint8`:
  - `ONNX_MODEL_VARIANTS`, `ONNX_MODEL_ARTIFACT_URLS.fp16 = "/models/kaya.fp16.onnx"` in `frontend/src/lib/analysis/onnx/capability/modelVariant.ts`.
  - Selection policy: `fp32` recommended when `webGpuSupported && supported`; `fp16` when CPU-only but `supported`; `uint8` when constrained. User pick overrides via `setUserSelectedOnnxModelVariant(...)` (selection reason `user_selection`); auto recommendation exposed via `getRecommendedOnnxModelArtifactSelection()` for the "recommended" badge.
- New component `frontend/src/features/analysisRuntime/AnalysisRuntimeModelPicker.tsx`: three buttons with size/role blurb + recommended badge + status feedback (idle/downloading/initializing/ready/error). Hidden when browser is incompatible.
- `frontend/src/lib/analysis/onnx/runtime/warmup.ts`: added `loadOnnxModelVariant(variant)` (sets user override, resets spike session cache, triggers session create). Auto `warmupOnnxModelSession()` retained for back-compat but no longer called from the runtime status hook.
- `useAnalysisRuntimeStatus` no longer auto-warmups; exposes `modelVariants`, `selectedVariant`, `recommendedVariant`, `pickedVariantReady`, `selectModelVariant`. `startDisabled = inferenceBlocked || !pickedVariantReady` (snapshot phase must be `ready` and `snapshot.variant === selectedVariant`).
- `App.tsx` renders the picker on the setup screen between the runtime banner and `GameSetup`.
- Docs updated: `docs/development/onnx-model-artifacts.md` (fp16 first-class, new policy table, picker behavior).
- Validation: `npx vitest run` (136 passed / 1 skipped), `npx tsc --noEmit`, `npm run build`, `pytest -m lint`, `mypy .` all green.

## Frontend source reorganization (2026-05-18)

- Restructured `frontend/src` into `features/{game,analysisRuntime}` and `lib/{api,go,analysis/...}` with ONNX split into `onnx/{runtime,capability,io,inference,fixtures}`.
- Added `@/*` path alias in `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`.
- Renamed `provider.ts` → `selection.ts`; `api.ts` → `lib/api/client.ts`; `capability.ts` → `onnx/capability/probe.ts`; `runtime.ts` → `onnx/runtime/session.ts`.
- `BoardView.test.tsx` mocks `@/lib/analysis/selection` with a server-style provider so UI tests do not load real ONNX.
- Structure reference: `docs/development/frontend-structure.md`.
- Validation: `npm --prefix frontend run build`, `npm --prefix frontend test` (117 passed, 1 integration skipped).

## ONNX artifact manifest pinned in-repo (2026-05-18)

- Added `scripts/onnx_artifact_manifest.json` with canonical filenames, upstream relative paths, byte sizes, and SHA-256 hashes for the production-pinned Kaya trio:
  - `kata1-b28c512nbt-s12043015936-d5616446734.fp32.onnx`
  - `kata1-b28c512nbt-s12043015936-d5616446734.fp16.onnx`
  - `kata1-b28c512nbt-s12043015936-d5616446734.uint8.onnx`
- Hash/source data is anchored to `https://huggingface.co/api/models/kaya-go/kaya?blobs=true`.
- Updated `docs/development/onnx-model-artifacts.md` with a "Pinned verification manifest" section pointing to the checked-in manifest.

## ONNX spike: learned input tensor types (2026-05-18)

- `runOnnxSpikeInference` can retry once when ORT rejects feeds (metadata says e.g. `uint8` but runtime expects `float`). Engine-move runs **root + topN child** inferences; without caching, that retry cost multiplied by every candidate dominated perceived latency.
- Fix: `frontend/src/lib/analysis/onnx/inference/spike.ts` keeps a `WeakMap` from `InferenceSession` → `{ bin, global }` types that last succeeded; subsequent calls skip the failing first `run`. `resetOnnxSpikeSessionCache()` still drops the cached session promise; new sessions get fresh map entries automatically.
- Test: `spike.test.ts` — "remembers corrected tensor type across repeated inferences on the same session".

## ONNX runtime: wasm-first EP order (2026-05-18)

- Debug NDJSON (`debug-c63872`) showed **~40s per `InferenceSession.run`** with `primaryExecutionProvider` webgpu-first, `encodeMs`/`decodeMs` ~0–1ms, `postEngineMoveMs` ~25ms, and **one engine move ≈ 367s** = root + `top_n` child inferences (Easy `top_n=8` → 9× ~40s). Smaller **quantized** ONNX files still pay a full forward pass; artifact URL may say `.uint8.onnx` while feeds use float after dequant path.
- Default EP order when WebGPU is available is now **`["wasm","webgpu"]`** (was `["webgpu","wasm"]`) in `frontend/src/lib/analysis/onnx/runtime/session.ts`, plus `graphOptimizationLevel: "all"` on `InferenceSession.create`. Override with `VITE_ONNX_EXECUTION_PROVIDERS` (comma list: `wasm`, `webgpu`, `wasm,webgpu`, `webgpu,wasm`); invalid tokens fall back to default in dev with a console warning.
- Doc touch: `docs/development/local-run.md` pass-criteria row for ONNX / WSL tuning.

## ONNX debug logging cleanup + hypothesis checklist (2026-05-19)

- Added shared debug logger helper `frontend/src/lib/analysis/debug/postDebugLog.ts` to avoid duplicated ad-hoc `fetch(...)` blocks and to keep endpoint/session wiring centralized.
- Migrated runtime instrumentation calls in:
  - `frontend/src/lib/analysis/onnx/runtime/session.ts`
  - `frontend/src/lib/analysis/onnx/inference/spike.ts`
  - `frontend/src/lib/analysis/onnx/inference/engineMoveLoop.ts`
  - `frontend/src/lib/analysis/providers/BrowserOnnxProvider.ts`
- Updated ingest endpoint in helper to current debug server `http://127.0.0.1:7362/...` for session `c63872`.
- Added verification checklist `docs/development/onnx-debug-hypotheses.md` with H1-H5 hypotheses and per-hypothesis log acceptance criteria.

## ONNX runtime hardening pass (historical, 2026-05-19)

- `frontend/src/lib/analysis/onnx/runtime/session.ts` now probes WebGPU with `navigator.gpu.requestAdapter()` (instead of only checking `navigator.gpu` existence), then selects execution providers from that result plus `VITE_ONNX_PREFER_WEBGPU`.
- Runtime import is bundle-aware: `onnxruntime-web/all` is loaded when WebGPU is in the selected provider list; otherwise bootstrap uses `onnxruntime-web`.
- Browser WASM env config is centralized in `frontend/src/lib/analysis/onnx/runtime/browserWasm.ts` with explicit fields:
  - `wasmPaths` (`/ort-wasm-dist/` in dev, `/onnx-wasm/` in prod, both base-aware),
  - `simd` from `VITE_ONNX_WASM_SIMD` (default `true`),
  - `proxy` from `VITE_ONNX_WASM_PROXY` (default `false`),
  - optional `numThreads` from `VITE_ONNX_NUM_THREADS`.
- Added unit coverage for adapter probing + bundle choice in `session.test.ts` and explicit wasm env overrides in `browserWasm.test.ts`.
- `docs/development/local-run.md` documented the then-current clean implementation approach and runtime safety switch documentation for WebGPU/WASM mitigation flags. This was superseded by the later AGPL/Kaya adoption decision below.

## License switch to AGPL for Kaya port (2026-05-19)

- Survival Go is now documented as AGPL-3.0-or-later because the project is adopting Kaya's AGPL-3.0 `packages/ai-engine` ONNX stack rather than preserving the earlier MIT-compatible independent implementation approach.
- `LICENSE` keeps Survival Go's copyright/licensing notice above the verbatim GNU AGPL v3 text; the AGPL license text itself is not modified.
- Kaya attribution is pinned to upstream commit `8fafeac0fedde020c447d931c0b1afdf283edf2a`, with planned port paths recorded in `THIRD_PARTY_NOTICES.md`.

## Kaya ONNX subtree initial port (2026-05-19)

- Added `frontend/src/lib/analysis/onnx/kaya/` and ported Kaya `packages/ai-engine/src` modules: `onnx-types.ts`, `onnx-utils.ts`, `onnx-featurization.ts`, `onnx-session.ts`, `onnx-gpu.ts`, `onnx-mcts.ts`, `onnx-engine.ts`, `queue.ts`, `auto-config.ts`.
- Included required supporting files from the same upstream commit (`base-engine.ts`, `types.ts`) so the ported module graph compiles without pulling additional package-level dependencies.
- Replaced `@kaya/goboard` imports with a vendored local adapter under `frontend/src/lib/analysis/onnx/kaya/goboard/` (ported from Kaya `packages/goboard/src`).
- Added `frontend/src/lib/analysis/onnx/kaya/portSmoke.test.ts` to ensure the new subtree resolves and exports core surfaces (`OnnxEngine`, `AnalysisQueue`, `pickConfig`).

## Kaya port source attribution headers (2026-05-19)

- Added top-of-file SPDX `AGPL-3.0-or-later` headers to every ported Kaya source file under `frontend/src/lib/analysis/onnx/kaya/`, including the supporting `goboard/` adapter and ported `analysis-utils.test.ts`.
- Each header names `kaya-go/kaya`, the upstream path, and pinned commit `8fafeac0fedde020c447d931c0b1afdf283edf2a`.
- Expanded `THIRD_PARTY_NOTICES.md` so the attribution inventory includes the supporting `base-engine.ts`, `types.ts`, `analysis-utils.ts`, ported utility test, and local `goboard/` adapter files.

## Kaya commit SHA pinned in artifacts doc (2026-05-19)

- Updated `docs/development/onnx-model-artifacts.md` with an explicit 7.7 source pin section.
- Canonical upstream reference is now documented as `kaya-go/kaya@8fafeac0fedde020c447d931c0b1afdf283edf2a` for future port sync/audit work.
- Marked corresponding task complete in `TODO.md` (`7.7.1` first unchecked item).

## Kaya ai-engine tests ported (2026-05-19)

- Reviewed upstream `packages/ai-engine/tests/*.test.ts` at commit `8fafeac0fedde020c447d931c0b1afdf283edf2a`.
- Ported the applicable pure utility suite into `frontend/src/lib/analysis/onnx/kaya/analysis-utils.test.ts` and added the matching attributed `analysis-utils.ts` helper.
- Did not port upstream `analyze.test.ts`: it exercises Kaya SGF/gametree packages (`@kaya/sgf`, `@kaya/gametree`) that are outside the ONNX subtree adopted by Survival Go.
- Cleaned dead private leftovers in `onnx-engine.ts` (`boardSize`, `runSingleInference`, `processResults`) so the ported subtree compiles under the repo's `noUnusedLocals` TypeScript gate.
- Validation: `npm --prefix frontend test -- src/lib/analysis/onnx/kaya` and `npm --prefix frontend run build` passed. Build still prints existing Vite/ORT warnings about browser-externalized Node modules, `eval` in `onnxruntime-web`, and large chunks.
- Python gates were attempted but blocked by the local WSL Python setup: `mypy`, `pytest`, and `python` resolve to missing `/mnt/c/Users/Kirill/.pyenv/pyenv-win/shims/*`; `python3` exists but does not have `mypy` or `pytest` installed.

## Browser provider now uses Kaya engine path (2026-05-19)

- Replaced `BrowserOnnxProvider` inference wiring so `analyzePosition` and `requestEngineMove` run through Kaya `OnnxEngine` (`analyze` for root, `analyzeBatch` for candidate leaves) instead of `inference/spike.ts` and `inference/engineMoveLoop.ts`.
- Kept `BrowserOnnxProvider` as the only app-facing adapter: it now maps `PositionInput` -> Kaya `signMap/history` inputs and converts Kaya analysis outputs into backend transport payloads (`raw_model_outputs` and browser engine-move candidates).
- Added a shared frontend `OnnxEngine` singleton in the provider module using the existing artifact-selection policy for `modelUrl`.
- Updated provider unit tests (`BrowserOnnxProvider.test.ts`) to assert the new engine calls and payload posting behavior.
- Validation: `npm --prefix frontend run test -- src/lib/analysis/providers/BrowserOnnxProvider.test.ts` passed.

## Browser provider now routes through AnalysisQueue (2026-05-19)

- `frontend/src/lib/analysis/providers/BrowserOnnxProvider.ts` now creates/uses a shared `AnalysisQueue` singleton (bound to the shared `OnnxEngine`) and no longer calls engine methods directly from the provider.
- `analyzePosition` submits a `live` queue request; `requestEngineMove` submits a root `batch` request and candidate child `batch` requests via `submitBatch`, so both provider entry points run through queue priority/preemption/cache semantics.
- Added `buildQueueRequest(...)` helper to keep `PositionInput -> AnalysisRequest` mapping centralized (sign map, move history, `nextToPlay`, `komi`, visit count, priority).
- Updated `BrowserOnnxProvider.test.ts` to assert queue submission contracts (`submitQueueRequest` and `submitQueueBatch`) and kept payload-posting assertions intact.
- Validation: `npm --prefix frontend run test -- src/lib/analysis/providers/BrowserOnnxProvider.test.ts` passed.
- Python gates remain blocked in this WSL environment: `mypy`/`pytest` shims point to missing Windows `pyenv-win` paths, and `python3 -m mypy` fails because `mypy` is not installed.

## Browser provider bootstrap now uses Kaya auto-config (2026-05-19)

- `frontend/src/lib/analysis/providers/BrowserOnnxProvider.ts` shared engine creation now uses Kaya `probeEnvironment()` + `pickConfig(...)` to derive runtime execution-provider order and quantization-aligned model selection.
- Added `buildKayaEngineBootstrapSelection(...)` helper to map Kaya `AutoPick` to Survival Go artifact URLs and `OnnxEngine` `executionProviders`; unsupported non-web backends (`native-*`, `pytorch`) collapse to a safe `["wasm"]` fallback in browser builds.
- Explicit user model-variant overrides are still honored via `getUserSelectedOnnxModelVariant()`; otherwise selection follows Kaya quantization (`fp32`/`fp16`/`uint8`).
- Added unit tests in `BrowserOnnxProvider.test.ts` covering default auto-pick mapping, user override precedence, and no-web-backend fallback behavior.
- Validation: `cd frontend && npm run test -- BrowserOnnxProvider.test.ts` passed.

## Kaya artifact output contract confirmed (2026-05-19)

- Loaded the pinned Kaya `uint8` artifact from Hugging Face with `onnxruntime-web` and confirmed `session.outputNames` includes Kaya's required heads: `policy`, `value`, `miscvalue`, and `ownership`.
- Observed additional exported heads: `moremiscvalue`, `scoring`, `futurepos`, `seki`, `scorebelief`, and numeric debug/internal outputs.
- Added `frontend/src/lib/analysis/onnx/kaya/outputContract.ts` plus focused tests so session creation fails early if a deployed artifact omits a required Kaya output name.
- Validation: `npm --prefix frontend run test -- src/lib/analysis/onnx/kaya/outputContract.test.ts` and `npm --prefix frontend run build` passed; `mypy .` / `pytest -m lint` remain blocked by missing WSL Python shims/modules.

## ONNX fixtures include Kaya heads (2026-05-19)

- Mirrored frontend/backend deterministic ONNX fixtures now include Kaya-compatible `value` (3) and `miscvalue` (10) heads.
- Engine-move ownership profile fixtures now emit probability-scale `p_black` ownership values when paired with richer Kaya heads; this matches backend interpretation for payloads carrying `value`/`miscvalue`.
- Updated backend fixture consumers and deploy analyze smoke payloads to forward/include `miscvalue`.
- Validation: `./.venv/bin/python -m pytest tests/unit/test_onnx_fixture_generators.py`, affected ONNX engine-move/API integration tests, and focused frontend ONNX provider/transport/contract fixture tests passed.

## Objective-first legal-move pool (2026-05-19)

- Restores pre-Kaya server semantics ([survival-go](https://github.com/Pythonimous/survival-go) `main`): evaluate **every legal move** for the engine side, Survival-rerank the full set, then apply `top_n` only for final selection/display.
- `GET /api/games/{id}` now includes `legal_moves` for `next_to_move` (sgfmill). `BrowserOnnxProvider` batch-evaluates each at `numVisits=1` with policy priors from the root ONNX policy head (`policyLogits`).
- Emits `engine_move_phase` instrumentation (`legalMoveCount` vs `topN`).

## Kaya MCTS difficulty plumbing (2026-05-19)

- `BrowserOnnxProvider.requestEngineMove` maps game difficulty into Kaya search requests: `max_visits` -> `numVisits`, `maxMctsBatch` bounded to 8 for interactive abort/progress cadence.
- Candidate child analyses use the same `max_visits` as root (cloud parity with per-candidate KataGo analysis depth).
- `AnalysisQueue` now forwards `maxMctsBatch`, `includeMove`, and abort signals through both single and batch engine calls; forced-move requests are separated in the queue cache key so they cannot reuse non-forced results. `OnnxEngine` respects an explicit `maxMctsBatch` option when invoking `runMCTS`.
- Validation: `npm --prefix frontend test -- --run src/lib/analysis/providers/BrowserOnnxProvider.test.ts src/lib/analysis/onnx/kaya/queue.test.ts`, `npm --prefix frontend run build`, `./.venv/bin/python -m mypy .`, and `./.venv/bin/python -m pytest -m lint` passed.

## Kaya ownership scale preserves resignation thresholds (2026-05-19)

- Backend raw ownership decoding now treats browser/Kaya ownership as model-scale `[-1, 1]` and converts it to Black probability in Python before computing Survival metrics and resignation thresholds.
- Added a regression test for a neutral Kaya root (`ownership = 0.0`, plus `winRate`/`scoreLead` heads) so Black does not falsely resign before candidate reranking.
- Updated deterministic engine-move fixture generators to keep fixture inputs expressed as `p_black` profiles while emitting Kaya raw ownership tensors for backend transport.
- Validation: `./.venv/bin/python -m pytest tests/unit/test_game_service.py tests/unit/test_onnx_fixture_generators.py`, related backend integration slices, and `npm --prefix frontend test -- --run src/lib/analysis/onnx/fixtures/engineMove/ownershipProfiles.test.ts` passed.

## Kaya multi-visit child batching (2026-05-19)

- Root cause of 5x+ engine-move latency vs cloud KataGo: `OnnxEngine.analyzeBatch` fell back to sequential `analyze()` whenever any request had `numVisits > 1`, so `BrowserOnnxProvider` child `submitBatch` did not batch MCTS across legal moves.
- Added `runBatchedMCTS` in `frontend/src/lib/analysis/onnx/kaya/onnx-mcts.ts` to synchronize MCTS iterations across multiple positions and submit one combined leaf batch per iteration to ONNX.
- `OnnxEngine.analyzeBatch` now routes multi-visit batches through `runBatchedMCTS` instead of per-position serialization; `runMCTS` delegates to the batched path for a single search.
- `engine_move_phase` instrumentation now includes `childPhaseMs`, `childExecutionMode` (`sequential` | `batched-multivisit`), and `childInferenceCallCount` (ORT `session.run` count during child phase).
- Follow-up fix: cross-tree batched MCTS must chunk leaf batches to `maxInferenceBatch`; otherwise WebGPU hits `GPUDevice.createBuffer: Allocation failed` when legal-move count × `maxMctsBatch` exceeds model/GPU buffer capacity. `runFeaturizedBatchInference` + chunked `runBatchInference` enforce the cap.
- Child MCTS pool is now policy-shortlisted to `ceil(1.5 × top_n)` legal moves by root prior before child search; backend Survival rerank + `top_n` display/selection apply to that shortlist only (`shortlistMovesByRootPolicy` in `BrowserOnnxProvider`).
- Validation: `npm --prefix frontend test -- --run` on queue/MCTS/provider slices, `npm --prefix frontend run build`, `./.venv/bin/python -m mypy .`, `./.venv/bin/python -m pytest -m lint`.

## Kaya engine-move integration coverage (2026-05-19)

- Added `frontend/src/lib/analysis/providers/BrowserOnnxProvider.integration.test.ts` to exercise an engine move through real `BrowserOnnxProvider` + `AnalysisQueue` + `OnnxEngine` with a mocked ORT session and `max_visits = 4`.
- The test asserts the queued root request uses `numVisits > 1`, the mocked ONNX session is invoked, the browser engine-move payload keeps three candidates, and the returned candidate panel data remains populated.
- Validation: `npm --prefix frontend test -- --run src/lib/analysis/providers/BrowserOnnxProvider.integration.test.ts`, the related provider/queue Vitest slice, `./.venv/bin/python -m mypy .`, `./.venv/bin/python -m pytest -m lint`, and `./.venv/bin/python -m pytest -m "unit or integration"` passed.

## ONNX legacy subtree audit completed (2026-05-19)

- Completed the first `7.7.4` cleanup task by auditing every file in `frontend/src/lib/analysis/onnx/{inference,io,runtime,capability,fixtures}/`.
- Recorded explicit `keep` / `port+delete` / `delete` verdicts per file in `docs/development/onnx-cleanup-audit.md`.
- Marked the corresponding TODO checkbox done and linked the audit document from `TODO.md` for traceability before bulk deletions begin.

## ONNX cleanup sweep — decision log (2026-05-19)

- Why we switched: phases 7.0–7.3 carried a bespoke single-position spike runner (`spike.ts`) and a sequential root + top-N engine-move loop (`engineMoveLoop.ts`). Phase 7.7 adopted Kaya's `OnnxEngine` + `AnalysisQueue` + PUCT MCTS as the single browser inference path. § 7.7.4 deletes the legacy parallel stack so there is only **one** raw-output generator on the browser side.
- What we ported: every file under `frontend/src/lib/analysis/onnx/kaya/` (engine, queue, MCTS, featurization, session, GPU utils, auto-config, output-contract guard, analysis-utils tests) is verbatim from `kaya-go/kaya` at commit `8fafeac0fedde020c447d931c0b1afdf283edf2a`, with SPDX `AGPL-3.0-or-later` headers naming the upstream path. The local `goboard/` adapter under that subtree is also AGPL-attributed.
- What we kept outside `kaya/`: only the thin numeric adapter — `BrowserOnnxProvider.ts` (the single app-facing inference entry point), `onnx/inference/transport.ts` (backend HTTP), `onnx/inference/engineMovePayload.ts` (numeric-only candidate payload), `onnx/inference/rawOutputs.ts` (`OnnxRawInferenceOutput` type).
- What we re-homed: `capability/{probe,modelVariant,loadProgress,runtimeUx}` + `runtime/warmup` moved out of `onnx/` and into `frontend/src/lib/analysis/runtime/{probe,modelVariant,loadProgress,runtimeUx,modelLoader}.ts`. The runtime-policy / UX / loader concerns are no longer mixed with the inference subtree. `runtime/modelLoader.ts` replaces `warmup.ts` by driving Kaya engine reset/init (via new `resetSharedOnnxEngine` / `getSharedOnnxEngine` exports on `BrowserOnnxProvider`) and emits the same `downloading` → `initializing` → `ready` events the picker UX depends on.
- What we deleted: all `inference/spike*`, `inference/engineMoveLoop*`, `inference/verbose*`, `runtime/{session,browserWasm,nodeWasm,warmup,constants}`, `capability/*` originals, `io/{decode,encoder,boundary,contract,candidates,boardState}` and their tests; legacy fixtures `fixtures/{emptyBoard19, regression/*, engineMove/*}`; the `OnnxDebugPanel` and its `BoardView` mount; and `frontend/scripts/run_onnx_spike.ts` + its `npm run onnx-spike*` scripts. `docs/development/onnx-debug-hypotheses.md` was retired (legacy-only). `transport.test.ts` now builds its own minimal raw-output instead of importing the deleted fixture helper.
- License adopted: AGPL-3.0-or-later (already in place from § 7.7.0). Embedder note for downstream integrators (e.g. GoMagic): AGPL obligates parties who *run a modified copy as a service*; iframing the hosted Survival Go app is unaffected — no source-disclosure obligation falls on the embedder.
- Verification: repo-wide grep for `runOnnxSpikeInference|buildBrowserEngineMovePayloadFromLocalInference|bootstrapOnnxRuntime|selectOnnxExecutionProviders` returns no hits.
- Validation: `npm --prefix frontend test -- --run` (25 files / 133 tests passing) and `npm --prefix frontend run build` passed. Python gates (`./.venv/bin/python -m mypy .`, `./.venv/bin/python -m pytest -m lint`) green; no executable Python code changed in this sweep.

## Runtime policy now defers to Kaya defaults (2026-05-19)

- Removed Survival-Go-specific runtime viability heuristics (device-memory / CPU-concurrency thresholds) from `frontend/src/lib/analysis/runtime/probe.ts`; runtime support is now only gated by WebAssembly availability.
- Updated `frontend/src/lib/analysis/runtime/modelVariant.ts` primary recommendation to match Kaya browser auto-config behavior: default to `fp32` (including WASM/no-WebGPU), reserve `uint8` only for unsupported runtimes (`wasm_unavailable`) or explicit user pick.
- This eliminates the previous policy drift where app runtime recommendation could prefer `fp16` on WASM while Kaya auto-pick uses `fp32`.
- Validation: `npm --prefix frontend test -- --run src/lib/analysis/runtime/probe.test.ts src/lib/analysis/runtime/modelVariant.test.ts src/lib/analysis/selection.test.ts src/lib/analysis/runtime/runtimeUx.test.ts src/features/analysisRuntime/AnalysisRuntimeBanner.test.tsx src/lib/analysis/providers/BrowserOnnxProvider.test.ts`, `./.venv/bin/python -m mypy .`, and `./.venv/bin/python -m pytest -m lint` passed.

## Runtime legacy policy surface removed (2026-05-19)

- Deleted legacy runtime-policy modules `frontend/src/lib/analysis/runtime/probe.ts` and `frontend/src/lib/analysis/runtime/runtimeUx.ts` (plus their tests). These files were carrying app-specific policy glue separate from Kaya.
- Simplified provider wiring in `frontend/src/lib/analysis/selection.ts` to provider identity/override only; removed `getDefaultAnalysisProviderSelectionPolicy` and test-only runtime-capability override exports.
- `frontend/src/features/analysisRuntime/useAnalysisRuntimeStatus.ts` now derives recommendation/policy copy directly from Kaya `probeEnvironment()` + `pickConfig()` and no longer depends on the removed runtime probe/ux layers.
- `frontend/src/lib/analysis/runtime/modelLoader.ts` no longer pre-gates model load on local runtime heuristics; loader now attempts initialization and surfaces real load errors via existing progress/error events.
- `frontend/src/lib/analysis/runtime/modelVariant.ts` now keeps only artifact URL resolution + user selection state, plus `getKayaRecommendedOnnxModelVariant()` for Kaya-derived recommendation.
- Validation: `npm --prefix frontend test -- --run src/lib/analysis/selection.test.ts src/lib/analysis/runtime/modelVariant.test.ts src/features/analysisRuntime/AnalysisRuntimeBanner.test.tsx src/features/analysisRuntime/AnalysisRuntimeModelPicker.test.tsx src/App.test.tsx src/lib/analysis/providers/BrowserOnnxProvider.test.ts`, `./.venv/bin/python -m mypy .`, and `./.venv/bin/python -m pytest -m lint` passed.

## Close-phase: ONNX EP order, difficulty tuning, AWS docs (2026-05-20)

- **ONNX execution providers:** `normalizeOnnxExecutionProviders()` orders `["wasm","webgpu"]` when both are present; removed WebGPU-only bootstrap retry in `getSharedOnnxEngine()`. Fixes ORT console errors (`no CPU kernel` for constant-fold MatMul, unassigned nodes). Defaults updated in `onnx-session.ts` / `onnx-types.ts`.
- **Difficulty presets:** Lowered `max_visits` (Easy 4, Normal 6, Hard 16, Impossible 38) and adjusted `top_n` (Easy 16, Normal 8, Hard 4, Impossible 2) for faster browser MCTS; unit test `test_difficulty_presets_scale_search_budget_and_top_n` locks values.
- **UI:** Removed granular `turnProgressDetail` status strings from `BoardView` (keeps turn-status label only).
- **AWS docs:** Refreshed `cloud-aws-zero-to-domain-runbook.md` for API-only backend + browser ONNX; deleted redundant `cloud-aws-ecs-full-runbook.md`; heavy-path pointers now go to `cloud-aws-ecs-topology.md`.
- Validation: `pytest -m lint`, `mypy .`, `pytest -m "unit or integration"` (279 passed), `npm --prefix frontend test -- --run` (141 passed).

## Close-phase: §8 integration tests (2026-05-21)

- Centralized integration fixtures in `tests/integration/conftest.py`: shared `api_client`, `PRESET_IDS`, `create_game_from_preset`, `PresetGameSetup`, ONNX payload helpers (`raw_model_outputs`, `browser_engine_move_body`).
- Added `test_preset_game_setup.py` (parametrized preset initial state), `test_api_errors.py` (illegal move, missing game, wrong turn, invalid ONNX payloads, no legal engine candidates), `test_ownership_contract.py` (`p_black` length 361, values in `[0,1]`).
- Refactored `test_api_lifecycle.py` to use shared conftest helpers; removed `pytest_plugins` hack from `test_onnx_engine_move_pipeline.py`.
- Validation: `pytest tests/integration/ -m integration` (39 passed), `flake8` on touched files, `mypy .`.

## Structured backend logging (2026-05-21)

- Added `backend/app/logging.py`: JSON lines via `StructuredJsonFormatter`, `log_game_event()`, `configure_logging()` (stdout, `LOG_LEVEL` from settings).
- `InMemoryGameService` emits events: `game.created`, `game.deleted`, `game.shutdown`, `game.human_move`, `game.human_resign`, `game.analyze`, `game.engine_move.request`, `game.engine_move.completed`, `game.not_found`, `game.operation_failed`.
- `_play_move` wraps `InvalidCoordinateError` as `GameServiceError` so malformed coordinates log consistently.
- Unit coverage: `tests/unit/test_structured_logging.py`.

## Typed API errors (2026-05-21)

- Added `backend/app/errors.py` (`ErrorCode`, `ApiErrorDetail`) and `backend/app/exception_handlers.py` for consistent JSON: `{"detail": {"code": "...", "message": "..."}}`.
- `GameServiceError` / `GameNotFoundError` carry stable `code`; routes no longer wrap try/except — handlers map domain errors to 400/404.
- Pydantic request validation returns `validation_error` (422). Frontend `readApiFailure` reads structured `detail.message`; `readApiErrorCode` exported for optional UI branching.
- Tests: `tests/unit/test_typed_api_errors.py`, updated `tests/integration/test_api_errors.py`, `frontend/src/lib/api/errors.test.ts`.
- Retired §9 KataGo timeout/startup TODOs (server stack removed in §7.5); replaced with ONNX-only items: API fetch timeouts + backend preset/readiness checks.

## API fetch timeouts + typed client errors (2026-05-21)

- `frontend/src/lib/api/clientErrors.ts`: `ApiClientError` hierarchy (`request_timeout`, `network_error`, `http_error`); UI reads `.message` via existing `Error` handling in `BoardView`.
- `frontend/src/lib/api/fetchWithTimeout.ts`: `fetchWithTimeout` with `AbortController`, default `90_000` ms (`VITE_API_REQUEST_TIMEOUT_MS` override).
- `readApiFailure` now throws `ApiHttpError` with `status` + backend `apiCode` when present.
- `transport.ts` uses timed fetch for `POST .../analyze` and `POST .../engine-move` only.
- Tests: `clientErrors.test.ts`, `fetchWithTimeout.test.ts`, extended `errors.test.ts` + `transport.test.ts`.

## Backend readiness checks (2026-05-21)

- `backend/app/readiness.py`: `run_readiness_checks()` validates `Settings` and loads the preset SGF bundle via `list_presets()`.
- `GET /health` returns `ready`, per-check `checks` (`settings`, `preset_bundle`), and HTTP **503** with `status: unhealthy` when not ready.
- `create_app(presets_dir=...)` test hook; deploy smoke asserts `ready` and both checks are `ok`.
- Tests: `tests/unit/test_readiness.py`, extended `test_health.py` + `test_deploy_smoke.py`.

## Agent state guide baseline (2026-05-21)

- Added top-level `AGENTS.md` as the project-state guide for agentic development: mission, stack, architecture boundaries, workflow, test commands, high-value docs, and current open TODO focus.
- Updated `.cursor/rules/development.mdc` to require reading `AGENTS.md` at task start and updating it when project state/workflow/priorities change.
- Updated `.cursor/commands/continue-development.md` and `.cursor/commands/close-phase.md` so command-driven loops explicitly consume/maintain `AGENTS.md`.
- Marked TODO item "Create AGENTS.md..." complete in `TODO.md`.
- Scope was docs/guidance only (no executable code changes), so no test-first or runtime test gates were required.

## API reference doc (2026-05-21)

- Added `docs/api-reference.md`: full HTTP API (all routes, request/response JSON examples, tensor shapes, errors, session flow). Source of truth pointers to `backend/app/main.py` and `backend/app/errors.py`.
- README stays high-level: one bullet under Scaffold Overview + References link; detailed examples moved out of README.
- Marked TODO §10 "Document API endpoints..." complete; next polish item is Survival scoring / komi docs.

## Survival scoring + komi docs (2026-05-21)

- Expanded `docs/development/survival-difficulty-model.md`: ownership → `p_black` pipeline, `survival_score` = `unresolved_count`, `SURVIVAL_THRESHOLD` tuning vs resign thresholds, extreme komi `345.5` rationale, analyze vs engine-move paths (MCTS winrate rerank vs root ownership metrics).
- Follow-up pass: reframed doc around **ownership-heavy** (original metrics/rerank/future desktop) vs **komi-heavy** (current browser engine-move), with comparison table, historical browser path, and future hybrid note.
- Implementation-correctness follow-up: documented that `EngineReasoning` currently renders winrate/score only (position + candidates); ownership metrics (`survival_score`, `unresolved_count`, `min_black_probability`) remain in API/provider payloads but are not shown in the panel.
- Fixed `docs/api-reference.md` examples and `survival_score` semantics (was incorrectly documented as `round(min_black × 100)`).
- Clarified `SURVIVAL_THRESHOLD` in `docs/development/environment.md`.
- Marked TODO §10 komi/scoring doc item complete.

## User flow docs UF-1–UF-4 (2026-05-21)

- Added `docs/user_flows/UF-1-survive-as-white.md` through `UF-4-start-resume-local-session.md` and refreshed `docs/user_flows/index.md` (status `ready`, dated 2026-05-21).
- UF-3 documents current UI (win rate / score / candidate table) and notes API ownership metrics not shown in `EngineReasoning`.
- UF-4 clarifies in-memory sessions: `GET` refresh + `DELETE` on new game; no persistence across server restart.
- Marked TODO §10 user-flow item complete; next polish: troubleshooting section, doc audit.

## Local troubleshooting guide (2026-05-21)

- Added `docs/development/troubleshooting.md`: quick health/preset checks; API reachability and `VITE_API_BASE_URL`; CORS (`CORS_ALLOW_ORIGINS`); preset bundle readiness; ONNX HF/CDN/self-host fetch; WebGPU/WASM/COI and variant fallback; `VITE_API_REQUEST_TIMEOUT_MS` after local inference.
- Linked from `local-run.md`, `README.md`, `environment.md`, `release-checklist.md`, `onnx-model-artifacts.md`, rollout runbook.
- Marked TODO §10 troubleshooting item complete; remaining §10: doc audit/trim.

## Doc audit + stale-link cleanup (2026-05-21)

- Completed TODO §10 doc audit item by updating docs that referenced removed paths.
- Replaced stale `.github/prompts/*.prompt.md` references with the current `.cursor/commands/*.md` catalog in `docs/prompt_index.md`.
- Updated README workflow references away from missing `.github/instructions/*` files to current `AGENTS.md` + Cursor rules/commands.
- Updated `.cursor/README.md` so it no longer claims `.github/` prompt/instruction mirrors are still present.
- Marked TODO §10 "Audit existing documents..." complete and updated `AGENTS.md` current focus to the next open backlog item (cache busting for static assets/CDN).

## Close-phase: §8–§10 integration, ops hardening, polish (2026-05-21)

- **§8 Integration tests:** Shared fixtures in `tests/integration/conftest.py`; added `test_preset_game_setup.py`, `test_api_errors.py`, `test_ownership_contract.py`; refactored lifecycle/onnx pipeline tests to use helpers.
- **§9 Non-functional:** Structured JSON logging (`backend/app/logging.py`); typed API errors (`errors.py`, `exception_handlers.py`) with frontend `readApiFailure` / `ApiClientError`; `fetchWithTimeout` + `VITE_API_REQUEST_TIMEOUT_MS` on analyze/engine-move transport; readiness checks on `GET /health` (`readiness.py`, 503 when preset bundle or settings fail).
- **§10 Polish and docs:** `AGENTS.md` project-state guide; `docs/api-reference.md`; expanded `survival-difficulty-model.md` (ownership-heavy vs komi-heavy); UF-1–UF-4 user flows; `docs/development/troubleshooting.md`; doc audit (stale `.github` prompt links → `.cursor/commands`, README workflow pointers).
- **Fix during close-phase:** `transport.test.ts` engine-move fixture used `number[]` (not `Float32Array`) so `tsc` build gate passes.
- **Validation:** `pytest -m lint`, `mypy .`, `pytest -m "unit or integration"` (330 passed), `npm --prefix frontend test -- --run` (162 passed), frontend `npm run build` via shudan unit gate.
- **Next focus (§11):** cache busting for static assets on frontend deploy/CDN.
