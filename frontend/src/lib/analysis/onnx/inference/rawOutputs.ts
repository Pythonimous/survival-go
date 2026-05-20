/**
 * Raw model-output transport shape sent from the browser to the backend.
 *
 * The frontend is intentionally numeric-only: it forwards the four ONNX heads
 * the Kaya engine produces (`policy`, `ownership`, plus optional `value` /
 * `miscvalue`) to Python, which performs all semantic interpretation
 * (Survival score, resignation thresholds, candidate reranking, etc.).
 *
 * No validation lives here on purpose — Kaya owns the in-engine output
 * contract (see `frontend/src/lib/analysis/onnx/kaya/outputContract.ts`),
 * and the backend re-validates shapes on the receiving side.
 */
export type OnnxRawInferenceOutput = {
  policy: ArrayLike<number>;
  ownership: ArrayLike<number>;
  value?: ArrayLike<number>;
  miscvalue?: ArrayLike<number>;
};
