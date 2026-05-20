import { afterEach, describe, expect, it } from "vitest";

import {
  emitAnalysisInstrumentation,
  resetAnalysisInstrumentationListeners,
} from "@/lib/analysis/instrumentation/bus";
import {
  createRolloutMetricsCollector,
  resetGlobalRolloutMetricsForTests,
} from "./rolloutMetrics";

describe("rollout metrics collector", () => {
  afterEach(() => {
    resetGlobalRolloutMetricsForTests();
    resetAnalysisInstrumentationListeners();
  });

  it("aggregates request success, failure, and latency per operation", () => {
    const { getSnapshot, dispose } = createRolloutMetricsCollector();

    emitAnalysisInstrumentation({
      type: "request_success",
      providerId: "browser-onnx",
      operation: "analyzePosition",
      durationMs: 100,
    });
    emitAnalysisInstrumentation({
      type: "request_success",
      providerId: "browser-onnx",
      operation: "analyzePosition",
      durationMs: 200,
    });
    emitAnalysisInstrumentation({
      type: "request_failure",
      providerId: "browser-onnx",
      operation: "requestEngineMove",
      durationMs: 50,
      reason: "network",
    });

    const snap = getSnapshot();
    expect(snap.requests.analyzePosition).toMatchObject({
      success: 2,
      failure: 0,
      avgSuccessLatencyMs: 150,
      maxSuccessLatencyMs: 200,
    });
    expect(snap.requests.requestEngineMove).toMatchObject({
      success: 0,
      failure: 1,
      avgFailureLatencyMs: 50,
      maxFailureLatencyMs: 50,
    });
    expect(snap.overall.successRate).toBeCloseTo(2 / 3, 5);
    expect(snap.overall.failureRate).toBeCloseTo(1 / 3, 5);

    dispose();
  });

  it("counts primary vs constrained ONNX model selection", () => {
    const { getSnapshot, dispose } = createRolloutMetricsCollector();

    emitAnalysisInstrumentation({
      type: "onnx_model_selected",
      providerId: "browser-onnx",
      variant: "fp32",
      selectionReason: "primary",
    });
    emitAnalysisInstrumentation({
      type: "onnx_model_selected",
      providerId: "browser-onnx",
      variant: "uint8",
      selectionReason: "constrained_runtime_fallback",
    });

    const snap = getSnapshot();
    expect(snap.model.primarySelections).toBe(1);
    expect(snap.model.constrainedFallbackSelections).toBe(1);
    expect(snap.model.fallbackRate).toBeCloseTo(0.5, 5);

    dispose();
  });

  it("counts model load errors from load_status", () => {
    const { getSnapshot, dispose } = createRolloutMetricsCollector();

    emitAnalysisInstrumentation({
      type: "load_status",
      providerId: "browser-onnx",
      status: "error",
      detail: "oom",
    });

    expect(getSnapshot().model.loadErrors).toBe(1);

    dispose();
  });

  it("reset clears counters but keeps subscription", () => {
    const { getSnapshot, reset, dispose } = createRolloutMetricsCollector();

    emitAnalysisInstrumentation({
      type: "request_success",
      providerId: "browser-onnx",
      operation: "getCandidateMoves",
      durationMs: 10,
    });
    reset();
    expect(getSnapshot().requests.getCandidateMoves.success).toBe(0);

    emitAnalysisInstrumentation({
      type: "request_success",
      providerId: "browser-onnx",
      operation: "getCandidateMoves",
      durationMs: 20,
    });
    expect(getSnapshot().requests.getCandidateMoves.success).toBe(1);

    dispose();
  });
});
