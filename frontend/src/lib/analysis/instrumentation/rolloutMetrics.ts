import type { AnalysisInstrumentationEvent, AnalysisOperation } from "@/lib/analysis/instrumentation/bus";
import { subscribeAnalysisInstrumentation } from "@/lib/analysis/instrumentation/bus";

const OPERATIONS: readonly AnalysisOperation[] = [
  "analyzePosition",
  "getCandidateMoves",
  "requestEngineMove",
];

type OperationRolloutStats = {
  success: number;
  failure: number;
  successDurationSumMs: number;
  failureDurationSumMs: number;
  maxSuccessDurationMs: number;
  maxFailureDurationMs: number;
};

export type OperationRolloutSnapshot = {
  success: number;
  failure: number;
  avgSuccessLatencyMs: number | null;
  avgFailureLatencyMs: number | null;
  maxSuccessLatencyMs: number;
  maxFailureLatencyMs: number;
};

export type RolloutMetricsSnapshot = {
  startedAtIso: string;
  requests: Record<AnalysisOperation, OperationRolloutSnapshot>;
  overall: {
    success: number;
    failure: number;
    successRate: number | null;
    failureRate: number | null;
  };
  model: {
    primarySelections: number;
    constrainedFallbackSelections: number;
    /** constrained / (primary + constrained), null if no selection events yet */
    fallbackRate: number | null;
    loadErrors: number;
  };
};

function emptyOpStats(): OperationRolloutStats {
  return {
    success: 0,
    failure: 0,
    successDurationSumMs: 0,
    failureDurationSumMs: 0,
    maxSuccessDurationMs: 0,
    maxFailureDurationMs: 0,
  };
}

function finalizeOpStats(stats: OperationRolloutStats): OperationRolloutSnapshot {
  return {
    success: stats.success,
    failure: stats.failure,
    avgSuccessLatencyMs: stats.success > 0 ? stats.successDurationSumMs / stats.success : null,
    avgFailureLatencyMs: stats.failure > 0 ? stats.failureDurationSumMs / stats.failure : null,
    maxSuccessLatencyMs: stats.maxSuccessDurationMs,
    maxFailureLatencyMs: stats.maxFailureDurationMs,
  };
}

function handleRolloutEvent(
  event: AnalysisInstrumentationEvent,
  state: {
    startedAtIso: string;
    perOp: Record<AnalysisOperation, OperationRolloutStats>;
    primarySelections: number;
    constrainedFallbackSelections: number;
    loadErrors: number;
  },
): void {
  if (event.type === "request_success") {
    const bucket = state.perOp[event.operation];
    bucket.success += 1;
    bucket.successDurationSumMs += event.durationMs;
    bucket.maxSuccessDurationMs = Math.max(bucket.maxSuccessDurationMs, event.durationMs);
    return;
  }

  if (event.type === "request_failure") {
    const bucket = state.perOp[event.operation];
    bucket.failure += 1;
    bucket.failureDurationSumMs += event.durationMs;
    bucket.maxFailureDurationMs = Math.max(bucket.maxFailureDurationMs, event.durationMs);
    return;
  }

  if (event.type === "onnx_model_selected") {
    if (event.selectionReason === "primary") {
      state.primarySelections += 1;
    } else if (event.selectionReason === "constrained_runtime_fallback") {
      state.constrainedFallbackSelections += 1;
    }
    return;
  }

  if (event.type === "load_status" && event.status === "error") {
    state.loadErrors += 1;
  }
}

function buildSnapshot(state: {
  startedAtIso: string;
  perOp: Record<AnalysisOperation, OperationRolloutStats>;
  primarySelections: number;
  constrainedFallbackSelections: number;
  loadErrors: number;
}): RolloutMetricsSnapshot {
  const requests = {} as Record<AnalysisOperation, OperationRolloutSnapshot>;
  let success = 0;
  let failure = 0;
  for (const op of OPERATIONS) {
    const s = state.perOp[op];
    requests[op] = finalizeOpStats(s);
    success += s.success;
    failure += s.failure;
  }
  const total = success + failure;
  const modelSelections = state.primarySelections + state.constrainedFallbackSelections;
  return {
    startedAtIso: state.startedAtIso,
    requests,
    overall: {
      success,
      failure,
      successRate: total > 0 ? success / total : null,
      failureRate: total > 0 ? failure / total : null,
    },
    model: {
      primarySelections: state.primarySelections,
      constrainedFallbackSelections: state.constrainedFallbackSelections,
      fallbackRate:
        modelSelections > 0 ? state.constrainedFallbackSelections / modelSelections : null,
      loadErrors: state.loadErrors,
    },
  };
}

export type RolloutMetricsCollector = {
  getSnapshot: () => RolloutMetricsSnapshot;
  reset: () => void;
  dispose: () => void;
};

export function createRolloutMetricsCollector(): RolloutMetricsCollector {
  const state = {
    startedAtIso: new Date().toISOString(),
    perOp: {
      analyzePosition: emptyOpStats(),
      getCandidateMoves: emptyOpStats(),
      requestEngineMove: emptyOpStats(),
    } satisfies Record<AnalysisOperation, OperationRolloutStats>,
    primarySelections: 0,
    constrainedFallbackSelections: 0,
    loadErrors: 0,
  };

  const listener = (event: AnalysisInstrumentationEvent): void => {
    handleRolloutEvent(event, state);
  };

  const unsubscribe = subscribeAnalysisInstrumentation(listener);

  return {
    getSnapshot: () => buildSnapshot(state),
    reset: () => {
      state.startedAtIso = new Date().toISOString();
      for (const op of OPERATIONS) {
        state.perOp[op] = emptyOpStats();
      }
      state.primarySelections = 0;
      state.constrainedFallbackSelections = 0;
      state.loadErrors = 0;
    },
    dispose: () => {
      unsubscribe();
    },
  };
}

let globalCollector: RolloutMetricsCollector | null = null;

export type GlobalRolloutMetricsApi = {
  getSnapshot: () => RolloutMetricsSnapshot;
  reset: () => void;
};

declare global {
  interface Window {
    __SURVIVAL_GO_ROLLOUT_METRICS__?: GlobalRolloutMetricsApi;
  }
}

/**
 * Starts a process-wide metrics collector (idempotent) and exposes
 * `window.__SURVIVAL_GO_ROLLOUT_METRICS__` for operator / support debugging.
 */
export function ensureGlobalRolloutMetrics(): void {
  if (globalCollector !== null) {
    return;
  }
  globalCollector = createRolloutMetricsCollector();
  if (typeof window !== "undefined") {
    window.__SURVIVAL_GO_ROLLOUT_METRICS__ = {
      getSnapshot: () => globalCollector!.getSnapshot(),
      reset: () => globalCollector!.reset(),
    };
  }
}

export function resetGlobalRolloutMetricsForTests(): void {
  globalCollector?.dispose();
  globalCollector = null;
  if (typeof window !== "undefined") {
    delete window.__SURVIVAL_GO_ROLLOUT_METRICS__;
  }
}
