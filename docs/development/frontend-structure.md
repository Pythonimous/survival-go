# Frontend source layout

The Vite app under `frontend/src` is organized by **feature UI** and **domain libraries**. Imports use the `@/*` alias (maps to `src/*`) configured in `tsconfig.json`, `vite.config.ts`, and `vitest.config.ts`.

## Top level

| Path | Role |
|------|------|
| `App.tsx`, `main.tsx` | App shell and entry |
| `features/` | User-facing screens grouped by product area |
| `lib/` | Shared, testable domain logic (no React UI) |
| `types/` | API DTOs shared with the backend contract |
| `shims/` | Build-time shims (e.g. Preact compatibility) |
| `test/` | Vitest setup |

## Features

| Path | Contents |
|------|----------|
| `features/game/` | Board, setup, goban, engine reasoning, dialogs |
| `features/analysisRuntime/` | Runtime banner, model picker, `useAnalysisRuntimeStatus` |

## Libraries

| Path | Contents |
|------|----------|
| `lib/api/` | `client.ts` (`apiUrl`), `errors.ts` |
| `lib/go/` | Coordinates, Shudan wrapper, survival display helpers |
| `lib/analysis/` | Analysis provider seam, types, selection policy |
| `lib/analysis/providers/` | `BrowserOnnxProvider` (the only app-facing adapter) |
| `lib/analysis/instrumentation/` | Event bus, rollout metrics |
| `lib/analysis/runtime/` | Runtime capability probe, model variant policy, load progress, runtime UX copy, model loader |
| `lib/analysis/onnx/kaya/` | Ported Kaya `ai-engine` ONNX stack (AGPL-3.0; see file headers) — `OnnxEngine`, `AnalysisQueue`, MCTS, featurization, session, auto-config, and the local `goboard` adapter |
| `lib/analysis/onnx/inference/` | Thin numeric adapter: `transport.ts` (HTTP boundary), `engineMovePayload.ts` (numeric-only payload assembly), `rawOutputs.ts` (`OnnxRawInferenceOutput` type) |

## Dependency direction

```
features → lib/analysis (selection, providers)
lib/analysis/providers → lib/analysis/onnx/kaya (OnnxEngine + AnalysisQueue) + lib/analysis/runtime
lib/analysis/runtime/modelLoader → lib/analysis/providers (engine reset hook)
lib/analysis/onnx/inference (adapter) → lib/api (transport)
```

`BrowserOnnxProvider` is the only inference / raw-output generation entry point on the browser side. It maps `PositionInput` ↔ Kaya inputs, drives `OnnxEngine.analyze` / `analyzeBatch` through the shared `AnalysisQueue`, and posts numeric raw outputs to the backend via `inference/transport.ts`.

## Public analysis API

`lib/analysis/index.ts` re-exports the main symbols used by the app (`getAnalysisProvider`, instrumentation, rollout metrics). Prefer `@/lib/analysis/...` imports in new code.
