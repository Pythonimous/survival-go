# ONNX Cleanup Audit (7.7.4)

> Status: **completed**. The verdicts below were applied in § 7.7.4. The
> retained surface after cleanup is documented in
> [`frontend-structure.md`](./frontend-structure.md) and
> [`browser-inference-design.md`](./browser-inference-design.md).

Scope: `frontend/src/lib/analysis/onnx/{inference,io,runtime,capability,fixtures}/`

Legend:
- `keep`: file remains on the Kaya-backed runtime path.
- `port+delete`: behavior still needed, but should move into the thin adapter/wiring surface before deleting the original file.
- `delete`: dead legacy path; remove with no replacement in this location.

## inference

- `inference/transport.ts` - `keep` (thin backend HTTP transport used by `BrowserOnnxProvider`).
- `inference/transport.test.ts` - `keep` (coverage for retained transport surface).
- `inference/engineMovePayload.ts` - `keep` (numeric-only engine-move payload assembly used by provider transport).
- `inference/engineMove.integration.test.ts` - `port+delete` (assertion intent should move to `BrowserOnnxProvider`/transport tests; currently coupled to legacy `io/candidates`).
- `inference/spike.ts` - `delete` (superseded by Kaya `OnnxEngine` + `AnalysisQueue`).
- `inference/spike.test.ts` - `delete` (covers legacy spike path).
- `inference/spike.modelVariant.test.ts` - `delete` (covers legacy spike/runtime selection flow).
- `inference/spike.integration.test.ts` - `delete` (legacy spike integration).
- `inference/engineMoveLoop.ts` - `delete` (superseded by provider queue + Kaya MCTS flow).
- `inference/engineMoveLoop.test.ts` - `delete` (covers legacy engine-move loop).
- `inference/verbose.ts` - `delete` (legacy spike diagnostics).
- `inference/verbose.test.ts` - `delete` (covers legacy verbose helper).

## io

- `io/contract.ts` - `port+delete` (raw output contract types still needed; move to retained adapter/transport surface).
- `io/contract.test.ts` - `port+delete` (keep only tests for retained raw payload contract in new location).
- `io/candidates.ts` - `delete` (legacy top-policy extraction path replaced by Kaya move suggestions/MCTS).
- `io/candidates.test.ts` - `delete` (covers legacy candidate extraction).
- `io/decode.ts` - `delete` (legacy decode path; Kaya result processing is canonical).
- `io/decode.test.ts` - `delete` (covers legacy decode).
- `io/encoder.ts` - `delete` (legacy featurization path replaced by Kaya featurization).
- `io/encoder.test.ts` - `delete` (covers legacy encoder).
- `io/boardState.ts` - `delete` (legacy encoder support).
- `io/boundary.test.ts` - `delete` (covers legacy runtime/encoder boundary).

## runtime

- `runtime/session.ts` - `delete` (legacy runtime bootstrap superseded by Kaya session layer).
- `runtime/session.test.ts` - `delete` (covers legacy runtime bootstrap).
- `runtime/browserWasm.ts` - `delete` (legacy ORT wasm path config).
- `runtime/browserWasm.test.ts` - `delete` (covers legacy wasm config helper).
- `runtime/nodeWasm.ts` - `delete` (legacy node test/runtime helper).
- `runtime/warmup.ts` - `port+delete` (if UX still needs explicit preload/progress trigger, re-home under adapter/runtime-status surface; then delete legacy module).
- `runtime/constants.ts` - `delete` (legacy shape/head constants for old spike/decode path).

## capability

- `capability/modelVariant.ts` - `port+delete` (model variant selection remains needed but should be re-homed as Kaya adapter/runtime policy surface, not legacy capability package).
- `capability/modelVariant.test.ts` - `port+delete` (move with retained variant policy behavior).
- `capability/probe.ts` - `port+delete` (runtime capability probe still needed for UX/reporting; re-home near Kaya auto-config wiring).
- `capability/probe.test.ts` - `port+delete` (move with retained probe behavior).
- `capability/loadProgress.ts` - `port+delete` (download/init progress tracking still needed by runtime UX).
- `capability/loadProgress.test.ts` - `port+delete` (move with retained progress behavior).
- `capability/runtimeUx.ts` - `port+delete` (user-facing runtime status messaging still needed; re-home under analysis runtime feature or provider-adjacent module).
- `capability/runtimeUx.test.ts` - `port+delete` (move with retained UX mapping behavior).

## fixtures

- `fixtures/engineMove/ownershipProfiles.ts` - `delete` (currently only consumed by legacy fixture loader/tests).
- `fixtures/engineMove/ownershipProfiles.test.ts` - `delete` (covers legacy fixture helper).
- `fixtures/engineMove/loadFixture.ts` - `delete` (consumed only by legacy `engineMove.integration.test.ts` slated for port+delete).
- `fixtures/regression/generators.ts` - `delete` (consumed by legacy `io/*` tests and deprecated fixture shim).
- `fixtures/regression/loadFixture.ts` - `delete` (no active consumer on Kaya path).
- `fixtures/emptyBoard19.ts` - `delete` (legacy spike/contract test fixture shim; no Kaya-path consumer after cleanup).

## Keep/port target after cleanup

Expected retained non-Kaya surface under `frontend/src/lib/analysis/onnx/`:
- `inference/transport.ts` (+ tests),
- `inference/engineMovePayload.ts` (or a same-purpose replacement),
- any explicitly re-homed files needed for runtime selection/progress UX and raw payload typing.

Everything else in the audited scope is legacy and should be removed once moved/re-homed where required.
