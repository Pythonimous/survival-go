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

## 7. Browser inference migration (KataGo ONNX in frontend)
Goal: move inference from server subprocess to browser ONNX runtime and finish phase 7 with **no server inference fallback** in normal operation.

### 7.0. Foundations (provider abstraction + instrumentation)
- [x] Write/update frontend tests for provider abstraction behavior (`ServerKataGoProvider` default path) before implementation changes.
- [x] Introduce a shared `AnalysisProvider` interface + `AnalysisResult` contract consumed by UI/game logic.
- [x] Add provider wiring so existing flow still uses server inference by default (no user-visible behavior change).
- [x] Add instrumentation hooks for provider timing, load status, and fallback reasons.
Done when: frontend behavior remains unchanged with server provider, and tests verify provider abstraction without regressions.

### 7.1. ONNX runtime spike
- [x] Write deterministic test fixture for one known position and expected output contract checks (shape/range assertions).
- [x] Add `onnxruntime-web` bootstrap with WebGPU-first and WASM fallback runtime selection.
- [x] Load one ONNX artifact in-browser and execute a deterministic single-position inference.
- [x] Decode core output heads (policy + ownership, and optional value heads if present) and expose a debug visualization path.
Done when: deterministic local inference succeeds in supported browsers and output validation checks pass.

### 7.2. Analyze path boundary (backend-owned semantics)
**Hard boundary for this phase:** TypeScript does only position encoding + raw numeric I/O. Python owns all semantic interpretation and decision logic.

- [x] Write/update tests proving frontend scope is limited to deterministic **model-input tensor** encoding and raw output transport (no threshold/semantic assertions in TS).
- [x] Implement frontend model-input encoder from game state primitives (board size, setup stones, move history, side to move) strictly to satisfy ONNX input contract.
- [x] After browser inference, send **raw model outputs** (arrays/scalars only; serialization only, no semantic transforms) to backend Python for interpretation.
      Keep frontend output handling numeric-only; do **not** compute `AnalysisResult`, survival metrics, thresholds, move quality, or parity decisions in TypeScript.
- [x] Implement/extend backend Python mapping from raw model numbers to canonical `AnalysisResult` and all derived fields (`policy`, `pBlack`, optional score/winrate, survival metrics).
- [x] Define and enforce parity thresholds (mean/percentile deltas) in backend Python tests only; TypeScript must not compare thresholds.
- [x] Add regression fixtures validating fixed positions through backend-owned analysis pipeline (TS encode -> backend analyze -> backend assertions).
Done when: frontend only (1) encodes ONNX model inputs and (2) transports raw model outputs; backend Python performs all wrangling/thresholding/parity checks/analysis semantics.

### 7.3. Engine-move local path (semantic compatibility)
- [x] Write/update integration tests for browser-based candidate extraction + reranking flow aligned to current survival objective behavior.
- [x] Implement local candidate extraction and per-candidate evaluation loop in browser inference path.
- [x] Reuse difficulty controls (`top_n`, temperature/randomness, variant awareness) with equivalent semantics.
- [x] Preserve resignation logic and candidate-panel contract expected by current UI.
Done when: engine-move flow works end-to-end without server inference in supported browsers and UI contract remains stable.

### 7.4. Rollout, fallback, and operations
- [x] Remove current server default Katago-based inference fallback; browser path must be primary and only default runtime.  Clean up redundant tests, including parity tests.
- [x] Add runtime capability detection (WebGPU/WASM support, memory/runtime viability) and provider selection policy.
- [x] Allow a single limited fallback path: automatically select the weakest available ONNX model variant when frontend device/runtime capability is insufficient for user-side model execution.
- [x] Add UX states for model download/init progress, incompatible browser, and fallback reason.
- [x] Capture rollout metrics (success rate, latency, fallback rate) and document operator runbook for rollback/fallback.
- [x] Document ONNX artifact variants (`fp32`, `fp16`, optional `uint8`) and select default artifact policy. 
- [x] Add credit to Kaya ONNX dependencies in THIRD PARTY NOTICES.
Done when: controlled rollout is measurable, **server inference fallback is removed**, only the weakest-ONNX frontend fallback remains for unsupported devices, and operators have clear troubleshooting/rollback guidance.

## 7.5. Remove server KataGo stack (post-migration purge)
- [x] Delete `third_party/katago/`, `scripts/setup_katago.sh`, and `backend/app/katago/` subprocess client.
- [x] Require browser ONNX payloads for `POST /analyze` and `POST /engine-move`; remove empty-body server inference paths.
- [x] Slim backend Docker image and env (`SURVIVAL_THRESHOLD`, `DEFAULT_TOP_N`, `CORS_ALLOW_ORIGINS` only).
- [x] Remove `ServerKataGoProvider` and server-only KataGo test suites.
- [x] Update docs/runbooks for ONNX-only architecture.
Done when: no server-side KataGo runtime or packaging remains; tests and docs reflect browser-only inference.

## 7.6. Self-hosted ONNX artifact pipeline (prod hardening)
Current default fetches ONNX weights from `huggingface.co/kaya-go/kaya`. That removes hosting burden in dev but leaves prod gameplay gated on a third-party repo we don't control (deletion / rename / privacy-flip / rate-limit / outage risk). Goal: keep HF as upstream source but serve from a project-owned bucket/CDN by default in production.

- [x] Pick a primary artifact origin (e.g. S3 + CloudFront under a versioned prefix like `s3://survival-go-models/kaya/v0.2.2/`) and document the choice alongside the existing cloud topology doc.
- [x] Record canonical filenames + SHA-256 hashes for each of the three Kaya variants (`fp32`, `fp16`, `uint8`) and check the manifest into the repo for verification.
- [x] Add a sync script (e.g. `scripts/sync_onnx_artifacts.sh`) that downloads the pinned upstream files from Hugging Face, verifies hashes against the manifest, and uploads to the project bucket under the versioned prefix; safe to re-run.

Done when: an internal sync script + pinned, hash-verified manifest exist so we can mirror Kaya's published ONNX artifacts on demand. Prod CDN cutover, release-time smoke checks, and promote/rollback docs are deferred — revisit once the Kaya engine port (§ 7.7) lands and we know which artifact set we're actually shipping.

## 7.7. Adopt Kaya ONNX engine (license switch + verbatim port)
Decision: stop reimplementing browser ONNX inference from scratch. Adopt [`kaya-go/kaya`](https://github.com/kaya-go/kaya)'s `packages/ai-engine` ONNX stack (batched inference, PUCT MCTS with batched leaf evaluator + virtual loss, request queue with preemption, GPU buffer reuse, FP16/FP32 handling, miscvalue head). Relicense Survival Go to **AGPL-3.0** to match Kaya's terms and credit Kaya/KataGo properly. AGPL does **not** block third parties (e.g. GoMagic) from iframing our hosted app; they are not running modified copies, so AGPL imposes no obligation on the embedder.

### 7.7.0. License switch (MIT → AGPL-3.0)
- [x] Replace top-level `LICENSE` with a project copyright/license notice plus the full verbatim AGPL-3.0 text.
- [x] Update `README.md` license badge/section to AGPL-3.0 and explain the rationale (we incorporate Kaya AGPL code).
- [x] Update `THIRD_PARTY_NOTICES.md`: move project license note to AGPL-3.0; add a Kaya section citing [`kaya-go/kaya`](https://github.com/kaya-go/kaya) and its AGPL-3.0 license, listing each ported file (`onnx-session.ts`, `onnx-engine.ts`, `onnx-mcts.ts`, `onnx-utils.ts`, `onnx-gpu.ts`, `onnx-featurization.ts`, `onnx-types.ts`, `queue.ts`, `auto-config.ts`) with upstream commit/path.
- [x] Audit any prior "clean-room" wording in docs (e.g. `docs/development/local-run.md` "license-safe hardening" note) and remove/replace with honest "ported from Kaya under AGPL-3.0 with attribution" framing.

### 7.7.1. Port Kaya ai-engine ONNX modules
- [x] Add a new frontend subtree (e.g. `frontend/src/lib/analysis/onnx/kaya/`) and port the following files **as-is** from `packages/ai-engine/src/`, adjusting only imports/paths and the `@kaya/goboard` dep (replace with a minimal local board adapter or vendor the needed subset under attribution):
      `onnx-types.ts`, `onnx-utils.ts`, `onnx-featurization.ts`, `onnx-session.ts`, `onnx-gpu.ts`, `onnx-mcts.ts`, `onnx-engine.ts`, `queue.ts`, `auto-config.ts`.
- [x] Pin the upstream commit SHA used for the port in `docs/development/onnx-model-artifacts.md` (so future syncs are explicit).
- [x] Run Kaya's own unit tests (`packages/ai-engine/tests/*.test.ts`) against the ported code where applicable; port the relevant ones and keep them passing.
- [x] Replace the current bespoke single-position path (`frontend/src/lib/analysis/onnx/inference/spike.ts` and `engineMoveLoop.ts`) with `OnnxEngine.analyze` / `OnnxEngine.analyzeBatch` calls behind the existing `AnalysisProvider` interface. `BrowserOnnxProvider` stays as the **only** app-facing adapter — it converts `PositionInput` ↔ Kaya inputs and Kaya results ↔ `AnalysisResult` / `EngineMoveResult`, and posts to the backend via the existing HTTP transport. It must not become a second inference abstraction or a runtime switch between old and new raw-output generators; by end of 7.7 the Kaya `OnnxEngine` is the single inference / raw-output generation path in the browser.
- [x] Wire the `AnalysisQueue` (priority lanes, preemption, shared cache) into `BrowserOnnxProvider` so `analyzePosition` and `requestEngineMove` go through it.
- [x] Replace our `selectOnnxExecutionProviders` / `bootstrapOnnxRuntime` with Kaya's `pickConfig` + Kaya's session setup. Keep a Survival-Go-specific shim only if Kaya's config genuinely can't express something we need (and document why in the file header); the default verdict is delete to avoid drift.
- [x] Add a top-of-file header to every ported file: SPDX `AGPL-3.0-or-later`, "Ported from kaya-go/kaya (AGPL-3.0)" with upstream path + commit SHA pinned.
Done when: ported modules build, pass their unit tests, every ported file carries an SPDX + upstream attribution header, prior clean-room language is gone, and `BrowserOnnxProvider` runs analyze + engine-move through `OnnxEngine` + `AnalysisQueue` (single positions and batched leaves) with no remaining call into `spike.ts` / `engineMoveLoop.ts`.

### 7.7.2. Output contract reconciliation
Kaya's `processBatchResults` consumes a 4-head model output (`policy`, `value`, `miscvalue`, `ownership`), while our current contract (`frontend/src/lib/analysis/onnx/io/contract.ts`) only validates `policy` + `ownership` (+ optional `value`).
- [x] Confirm the deployed Kaya ONNX artifact actually exposes the `miscvalue` output (inspect with `onnx.checker` or `onnxruntime-web` `outputNames`); if not, switch to a Kaya artifact that does.
- [x] Extend `OnnxRawInferenceOutput` (and backend mapping) to accept `value` + `miscvalue` and use Kaya's softmax/score-lead math; delete our home-grown decoder paths that this replaces.
- [x] Update backend `AnalysisResult` mapping so survival metrics are computed from the new richer outputs (no behavior regression on existing fixture positions).
- [x] Update fixtures (`createDeterministicSyntheticOnnxOutput` and friends) to include the new outputs.
Done when: browser inference returns Kaya-shape outputs; backend produces the same `AnalysisResult` shape; regression fixtures still pass.

### 7.7.3. MCTS + difficulty plumbing
- [x] Map our difficulty presets (`top_n`, temperature, variant awareness, resignation thresholds) onto `runMCTS`'s `numVisits`, `maxMctsBatch`, `includeMove`, and abort signal so existing UF flows remain stable.
- [x] Ensure resignation logic (B prob < 1% / W prob > 99%) is preserved on top of Kaya's `winRate`/`scoreLead` outputs (in backend Python, per the 7.2 boundary).
- [x] Add an integration test that runs at least one engine move through `OnnxEngine` end-to-end with `numVisits > 1` and asserts the candidate panel stays populated.
Done when: every difficulty preset behaves equivalently to today's behavior (no UX regression), and engine moves use real MCTS instead of the root + top-N sequential loop.

### 7.7.4. Cleanup + docs (ONNX-only sweep)
By the end of 7.7, Kaya `OnnxEngine` + `AnalysisQueue` is the **only** browser inference / raw-output generation path. Everything under `frontend/src/lib/analysis/onnx/` that is **not** part of `kaya/` (or a thin adapter wiring Kaya into `BrowserOnnxProvider` + the HTTP transport to the backend) must be deleted. "Keep just in case" is not a valid verdict — if a legacy file isn't on a Kaya code path, it goes.
- [x] Audit every file under `frontend/src/lib/analysis/onnx/{inference,io,runtime,capability,fixtures}/` and tag each as either: (a) on the Kaya path → keep, (b) behavior needs to move into the Kaya wiring → port + delete original, or (c) dead → delete. Default verdict is delete. (See `docs/development/onnx-cleanup-audit.md`.)
- [x] Delete the legacy core paths and their paired tests: `inference/spike*.ts`, `inference/engineMoveLoop*.ts`, `inference/verbose.ts`, `runtime/{session,browserWasm,nodeWasm,warmup,constants}.ts`, `capability/*` (modelVariant, probe, runtimeUx, loadProgress), `io/{decode,encoder,boundary,contract,candidates,boardState}.ts`. Any exception requires an inline justification in the commit.
- [x] Retain only the minimum non-Kaya surface needed to talk to the backend: `BrowserOnnxProvider`, `inference/transport.ts` (or its replacement), `inference/engineMovePayload.ts` if still consumed, and any fixtures still used by remaining tests. Anything else is gone.
- [x] Update `docs/development/browser-inference-design.md` to describe the new architecture (Kaya OnnxEngine + AnalysisQueue + MCTS) and link to upstream sources.
- [x] Update `memory.md` with a short "decision log" entry: why we switched, what we ported, what license we adopted.
- [x] Update or retire `docs/development/onnx-debug-hypotheses.md` so it reflects the new code paths (delete it if it only described legacy hypotheses).
- [x] Note for downstream integrators (e.g. GoMagic): AGPL only obligates parties who *run modified copies as a service*; iframing the hosted app is fine and unaffected.
Done when: `frontend/src/lib/analysis/onnx/` contains `kaya/` plus only the thin adapter/transport layer named above (no `spike*`, `engineMoveLoop*`, `decode*`, `encoder*`, legacy `runtime/*`, or legacy `capability/*` files remain); a repo-wide grep for `runOnnxSpikeInference` / `buildBrowserEngineMovePayloadFromLocalInference` / `bootstrapOnnxRuntime` / `selectOnnxExecutionProviders` returns no hits; docs describe the adopted stack honestly; and license/integration guidance is clear for third-party embedders.

## 8. Integration Tests
- [ ] Add backend integration test fixture for deterministic test game setup from presets.
- [ ] Add error-path integration tests for invalid move, missing game ID, and engine timeout handling.
- [ ] Add integration test verifying ownership array contract (`p_black` length 361, values in `[0,1]`).
Done when: integration suite validates happy path plus critical failure handling for API and KataGo boundary.

## 9. Non-functional (logging, config, error handling)
- [x] Implement natural difficulty curve v2 (composite scoring, blunder margin, temperature sampling, variant awareness controls) across backend + frontend.
- [ ] Add structured backend logging for game lifecycle events, engine requests, and failures.
- [ ] Add typed error model and consistent API error responses across endpoints.
- [ ] Add timeout/retry boundaries around KataGo requests with actionable error messages.
- [ ] Add startup checks that report invalid KataGo binary/config/model paths clearly.
Done when: operational failures are observable, actionable, and do not crash the service unexpectedly.

## 10. Polish and Docs
- [ ] Document API endpoints and request/response examples in `README.md`.
- [x] Add docs for Survival scoring semantics and threshold tuning.
- [ ] Create/update user flow docs for UF-1 to UF-4 and ensure index is updated.
- [ ] Add troubleshooting section for common local setup issues (path mismatch, model/config mismatch, timeout).
Done when: a new local user can install, run, play a scenario, and debug setup issues using docs only.