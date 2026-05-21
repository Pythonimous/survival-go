# Browser ONNX inference — rollout metrics and operator runbook

This document is for **operators** validating a browser-side ONNX rollout and for **support** when users hit runtime or model-load issues. Inference runs entirely in the visitor’s browser; there is **no server-side KataGo inference fallback** in normal operation. The only automatic degradation is the **smaller ONNX variant** (`uint8`) when the runtime reports the device cannot safely run the default `fp32` artifact.

## In-browser metrics (no telemetry by default)

After the SPA loads, the app registers a **read-only** metrics hook on `window` (client-side counters only; nothing is sent to your servers unless you add that separately).

```js
window.__SURVIVAL_GO_ROLLOUT_METRICS__?.getSnapshot()
```

Returns a JSON-serializable object, including:

| Area | Fields | Meaning |
|------|--------|---------|
| **Requests** | `requests.analyzePosition`, `requests.getCandidateMoves`, `requests.requestEngineMove` | Per-operation `success` / `failure` counts, mean latency of successes (`avgSuccessLatencyMs`), mean latency of failures (`avgFailureLatencyMs`), and `max*` latency peaks. |
| **Overall** | `overall.successRate`, `overall.failureRate` | Ratio across all three operations (`null` until at least one completed request). |
| **Model** | `model.primarySelections`, `model.constrainedFallbackSelections` | Count of `onnx_model_selected` events: primary = default `fp32` path; constrained = automatic `uint8` fallback. |
| **Model** | `model.fallbackRate` | `constrained / (primary + constrained)` for selection events in this tab session (`null` if none). |
| **Model** | `model.loadErrors` | Count of ONNX load pipeline errors surfaced as `load_status` **error** (e.g. fetch failure, session creation failure). |
| **Session** | `startedAtIso` | ISO timestamp when the current counter window started (updates when `reset()` is called). |

### Clearing counters after a deploy check

```js
window.__SURVIVAL_GO_ROLLOUT_METRICS__?.reset()
```

Use this on a **support call** or after your own smoke test so the next snapshot reflects only new traffic from that tab.

### What “healthy” looks like (rules of thumb)

- **`overall.failureRate`**: Should stay near **0** during normal play. Spikes often correlate with backend `/api/games/.../analyze` errors, user network loss, or ONNX runtime faults (see browser console for stack traces).
- **`model.fallbackRate` (across many sessions)**: A **high** fraction of `constrained_runtime_fallback` selections means many clients are on weak hardware or strict browser limits; gameplay should still work, but latency may differ from `fp32` desktops.
- **`model.loadErrors`**: Any sustained increase merits checking **artifact URLs**, **CDN / cache headers**, **CORS**, and **disk quota** for large WASM caches.

These thresholds are **guidance**, not hard SLOs—tune them for your audience and hosting.

## Rollback and mitigation

### Frontend rollback (fastest)

1. Redeploy the **previous known-good** frontend static build (container image tag, S3 object version, or Git revision used in CI).
2. Invalidate CDN caches if you use one, or bump cache-busting query strings so clients pick up the rollback bundle.
3. Ask affected users to **hard refresh** once (`Ctrl+Shift+R` / `Cmd+Shift+R`) if a service worker or aggressive caching layer is in play.

### Backend-only changes

Browser inference does **not** depend on KataGo for analyze/engine-move in the default path. Backend rollback is still useful for **API bugs**, **game state**, or **static hosting** misconfiguration—not for restoring inference on the server.

### When the weaker ONNX variant is selected

Users stay on the shipped app; they automatically get the **`uint8`** model when capability detection says `fp32` is unsafe. Operators do **not** need to toggle a server flag. If quality or latency is unacceptable for that cohort, improve **capability thresholds** or **artifact choice** in a new frontend release (see [browser-inference-design.md](../development/browser-inference-design.md)).

## Troubleshooting checklist

| Symptom | Checks |
|---------|--------|
| Blank board / no engine reply | Browser console for ONNX or `fetch` errors; `model.loadErrors` in snapshot. |
| “Incompatible browser” or blocked start | `AnalysisRuntimeBanner` copy; WebGPU/WASM support; corporate policies blocking WASM threads. |
| High `failureRate` on `analyzePosition` only | Backend `/analyze` mapping errors (raw payload); network tab for 4xx/5xx. |
| Sudden spike after deploy | Compare artifact size and hash; confirm `public/models/*.onnx` paths match nginx static root. |

## Privacy and security

- Snapshots contain **aggregate counts and timings only**—no moves, SGF, or user identifiers.
- Do not paste snapshots into public tickets if your internal policy treats deployment timing as sensitive; they are still anonymous.

## Related docs

- [Local troubleshooting](../development/troubleshooting.md) — developer-focused CORS, fetch, WASM, and timeout fixes.
- [ONNX model artifacts](../development/onnx-model-artifacts.md) — `fp32` / `uint8` / optional `fp16` and default selection policy.
- [Browser inference design](../development/browser-inference-design.md) — architecture and phases.
- [Cloud environment and sizing](../development/cloud-env-and-sizing.md) — capacity expectations.
- [Release checklist](../development/release-checklist.md) — regression gates before rollout.
