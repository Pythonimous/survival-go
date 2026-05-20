import type { OnnxModelSelectionReason, OnnxModelVariant } from "@/lib/analysis/runtime/modelVariant";

export type AnalysisOperation = "analyzePosition" | "getCandidateMoves" | "requestEngineMove";

export type AnalysisInstrumentationEvent =
  | {
      type: "request_start";
      providerId: string;
      operation: AnalysisOperation;
    }
  | {
      type: "request_success";
      providerId: string;
      operation: AnalysisOperation;
      durationMs: number;
    }
  | {
      type: "request_failure";
      providerId: string;
      operation: AnalysisOperation;
      durationMs: number;
      reason: string;
    }
  | {
      type: "fallback";
      fromProviderId: string;
      toProviderId: string;
      reason: string;
    }
  | {
      type: "load_status";
      providerId: string;
      status: "idle" | "loading" | "ready" | "error";
      detail?: string;
    }
  | {
      type: "onnx_model_selected";
      providerId: string;
      variant: OnnxModelVariant;
      selectionReason: OnnxModelSelectionReason;
    }
  | {
      type: "engine_move_phase";
      providerId: string;
      rootPhaseMs: number;
      childPhaseMs: number;
      childBatchSize: number;
      childBatchChunks: number;
      childExecutionMode: "sequential" | "batched-multivisit";
      childInferenceCallCount: number;
      backendRoundtripMs: number;
      legalMoveCount: number;
      policyShortlistCount: number;
      topN: number;
    };

type InstrumentationListener = (event: AnalysisInstrumentationEvent) => void;

const listeners = new Set<InstrumentationListener>();

export function subscribeAnalysisInstrumentation(
  listener: InstrumentationListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitAnalysisInstrumentation(event: AnalysisInstrumentationEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}

export function resetAnalysisInstrumentationListeners(): void {
  listeners.clear();
}

export async function instrumentedAnalysisCall<T>(options: {
  providerId: string;
  operation: AnalysisOperation;
  run: () => Promise<T>;
}): Promise<T> {
  const { providerId, operation, run } = options;
  emitAnalysisInstrumentation({ type: "request_start", providerId, operation });
  const startedAt = performance.now();
  try {
    const result = await run();
    const durationMs = performance.now() - startedAt;
    emitAnalysisInstrumentation({
      type: "request_success",
      providerId,
      operation,
      durationMs,
    });
    return result;
  } catch (error) {
    const durationMs = performance.now() - startedAt;
    const reason = error instanceof Error ? error.message : "unknown error";
    emitAnalysisInstrumentation({
      type: "request_failure",
      providerId,
      operation,
      durationMs,
      reason,
    });
    throw error;
  }
}
