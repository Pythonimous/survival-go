# Browser Inference Design (KataGo ONNX in Frontend)

## Purpose

Survival Go runs inference entirely in the user's browser. The frontend hosts the **ported Kaya `ai-engine` ONNX stack** (`OnnxEngine` + `AnalysisQueue` + PUCT MCTS) and the Python backend owns rules enforcement, game state, and all Survival semantics (resignation thresholds, candidate reranking, metrics). This document records the architecture as currently shipping; the historical migration plan is preserved at the end as context.

## Current architecture

### Components

- **`OnnxEngine`** (`frontend/src/lib/analysis/onnx/kaya/onnx-engine.ts`) — ported from Kaya. Wraps a single `onnxruntime-web` session, drives batched inference, handles GPU buffer reuse and FP16/FP32 type alignment, exposes `analyze(...)` (single position) and `analyzeBatch(...)` (preferred for MCTS leaves and candidate sweeps).
- **`AnalysisQueue`** (`frontend/src/lib/analysis/onnx/kaya/queue.ts`) — ported from Kaya. Provides priority lanes (`live` vs `batch`), preemption, and a shared cache keyed by position + visit budget so identical requests are de-duplicated. The provider routes both `analyzePosition` and `requestEngineMove` through the queue.
- **PUCT MCTS** (`frontend/src/lib/analysis/onnx/kaya/onnx-mcts.ts`) — ported from Kaya. Drives the engine-move search with batched leaf evaluation and virtual loss. Difficulty presets map to `numVisits`, `maxMctsBatch`, and `includeMove` (forced moves).
- **`BrowserOnnxProvider`** (`frontend/src/lib/analysis/providers/BrowserOnnxProvider.ts`) — the only app-facing inference adapter. Implements `AnalysisProvider` from `lib/analysis/types`. Maps `PositionInput` ↔ Kaya `signMap` / `history`, derives `OnnxRawInferenceOutput` from Kaya results, and posts numeric payloads to the backend over HTTP. Internally owns the shared `OnnxEngine` + `AnalysisQueue` singletons.
- **Runtime policy / UX** (`frontend/src/lib/analysis/runtime/`) — capability probe (`probe.ts`), model-variant policy (`modelVariant.ts`), download/init progress reporting (`loadProgress.ts`), user-facing copy (`runtimeUx.ts`), and the on-demand model loader (`modelLoader.ts`) that drives engine init when the user picks a variant.
- **Transport** (`frontend/src/lib/analysis/onnx/inference/`) — `transport.ts` posts raw model outputs to `POST /api/games/:id/analyze` and engine-move payloads to `POST /api/games/:id/engine-move`. `engineMovePayload.ts` assembles the numeric-only candidate transport shape. `rawOutputs.ts` defines `OnnxRawInferenceOutput`.

### Inference flow

1. User picks a model variant on the setup screen. `loadOnnxModelVariant(variant)`:
   - Sets the user override in `modelVariant.ts`.
   - Tears down the previous shared `OnnxEngine` (if any) via `resetSharedOnnxEngine()`.
   - Emits `downloading` → `initializing` → `ready` (or `error`) progress events.
   - Triggers engine init through `getSharedOnnxEngine()`, which calls Kaya `pickConfig(...)` against the runtime probe and instantiates `OnnxEngine` with the resolved artifact URL + execution-provider chain.
2. `BoardView` calls `getAnalysisProvider()` and then `analyzePosition(...)` / `requestEngineMove(...)`.
3. The provider builds an `AnalysisRequest` (sign map, history, visit budget, priority) and submits it through `AnalysisQueue`.
4. `OnnxEngine` runs `analyze` (single) or `analyzeBatch` / `runMCTS` (engine move) and returns Kaya `AnalysisResult` (move suggestions, ownership, win rate, score lead).
5. The provider serializes the Kaya result into `OnnxRawInferenceOutput` (policy + ownership + value + miscvalue, numeric arrays only) and POSTs it to Python.
6. Python computes Survival metrics, resignation, and candidate selection from the raw heads and returns the canonical `AnalysisResult` / `EngineMoveResult` shape consumed by the UI.

### Boundary contract (hard rule)

TypeScript is intentionally numeric-only across the HTTP boundary. The frontend never computes Survival metrics, thresholds, or move-quality decisions; those live in Python (`backend/app/game_service.py`). The retained adapter surface (`transport.ts`, `engineMovePayload.ts`, `rawOutputs.ts`) explicitly enforces this by transporting raw heads as plain `number[]`.

### Runtime selection

`pickConfig(probeEnvironment())` (Kaya auto-config) drives execution-provider order:

- WebGPU + WASM when WebGPU is usable; quantization defaults track the chosen backend.
- WASM-only when WebGPU is unavailable.
- Survival Go honours an explicit user variant override (`fp32` / `fp16` / `uint8`) via `getUserSelectedOnnxModelVariant()`.

The setup screen surfaces all three variants in `AnalysisRuntimeModelPicker` and disables Start until the chosen variant reports `ready`. There is **no server inference fallback** — incompatible browsers see the "Incompatible browser" banner and cannot start a game.

## Model artifacts

See **[onnx-model-artifacts.md](./onnx-model-artifacts.md)** for the variant table, default URLs, hash-pinned manifest, and self-host options. Summary:

- **`fp32`** — default when WebGPU is viable.
- **`fp16`** — balanced CPU-only default.
- **`uint8`** — constrained-runtime fallback / smallest download. **Not used with WebGPU** (bootstrap upgrades to `fp16`/`fp32` per auto-pick — uint8 on WebGPU is orders of magnitude slower in practice).

## License + attribution

The ported Kaya files under `frontend/src/lib/analysis/onnx/kaya/` are AGPL-3.0-or-later, attributed to `kaya-go/kaya` with the pinned upstream commit listed in `onnx-model-artifacts.md`. Every ported file carries an SPDX header naming the upstream path + commit. See [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md).

### Note for downstream integrators (e.g. iframe embedders)

AGPL-3.0 only obligates parties that **run a modified copy as a service**. Embedding the hosted Survival Go app via an iframe (e.g. GoMagic) is unaffected — the embedder is not distributing or running a modified copy and incurs no source-disclosure obligation from this code.

## Decision flow compatibility

Engine move behaviour is preserved through the boundary:

1. Backend evaluates the position for resignation thresholds (`min p_black` < 1% for Black, > 99% for White).
2. Frontend runs PUCT MCTS via `OnnxEngine`/`runMCTS` to produce move suggestions + leaf evaluations.
3. Frontend loads **`legal_moves`** for `next_to_move` from the backend (sgfmill-authoritative). It runs root MCTS at `max_visits` for position ownership and policy priors, **shortlists** legal moves to the top `ceil(1.5 × top_n)` by root policy prior, then runs only that pool through child MCTS at `max_visits`. Policy priors from the root head are attached per candidate; the payload is POSTed to Python.
4. Backend reranks the incoming shortlist by the Survival objective, then applies difficulty controls (`top_n`, `randomness`, `temperature`, `blunder_margin`, `variant_awareness`) for final move selection and the display shortlist (top **N** after ranking, not the full legal set).
5. UI consumes the resulting `EngineMoveResult` and renders the candidate panel.

`BrowserOnnxProvider` emits `engine_move_phase` instrumentation (root ms, child phase ms, child batch size/chunks, child execution mode, child ONNX inference call count, backend roundtrip ms, `legalMoveCount` vs `topN`) for latency tuning and regression guards.

Multi-visit child evaluation uses `runBatchedMCTS` in **groups of up to four** candidate trees (`CROSS_TREE_MCTS_CHUNK`), submitted as separate queue batches so the UI can breathe between groups. Leaf evaluator calls are chunked to `maxInferenceBatch` (default **8** on WebGPU when the model has dynamic batch). Full `max_visits` per candidate is preserved for ownership averaging. WebGPU **graph capture is not used** for KataGo ONNX (ORT rejects it: not all nodes partition to `JsExecutionProvider`).

## Rollout metrics (operator)

- In-browser counters and latency summaries are exposed as `window.__SURVIVAL_GO_ROLLOUT_METRICS__` (see [operations runbook](../operations/browser-inference-rollout-runbook.md)).
- Use **`getSnapshot()`** during canary traffic or support calls; use **`reset()`** to start a fresh window after a deploy.
- **Fallback rate** refers to automatic selection of the weaker shipped ONNX variant (`uint8`), not a server inference fallback.

## Testing and validation

- Unit tests:
  - Provider contract (`BrowserOnnxProvider.test.ts`) and queue routing.
  - Kaya ports: featurization, session output contract, queue, analysis utils, MCTS smoke (`kaya/*.test.ts`).
  - Runtime policy: capability probe, model variant selection, load-progress events, UX copy (`runtime/*.test.ts`).
- Integration tests:
  - `BrowserOnnxProvider.integration.test.ts` runs `requestEngineMove` end-to-end through `OnnxEngine` MCTS with a mocked ORT session.
  - Backend Python owns the regression fixtures that prove raw-heads → `AnalysisResult` mapping (see `tests/`).
- Build/typecheck via `npm --prefix frontend run build`; quality gates via `mypy .` and `pytest -m lint`.

## Risks and mitigations

- **Browser performance variance** — mitigated by capability probe + automatic `uint8` fallback variant + Kaya `AnalysisQueue` preemption.
- **Large model download** — mitigated by quantized variants and explicit download/init/ready UX states.
- **Vendor/runtime instability** — provider abstraction + pinned `onnxruntime-web` + pinned Kaya upstream commit.

## Historical migration context

Earlier phases (§ 7.0 – 7.3 in `TODO.md`) introduced a bespoke single-position runner (`spike.ts`) and a sequential root + top-N engine-move loop. Both were superseded by the Kaya port in § 7.7 and were deleted in § 7.7.4. The current document describes the adopted architecture; historical migration notes live in `memory.md`.
