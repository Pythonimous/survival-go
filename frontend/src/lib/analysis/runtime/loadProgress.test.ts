import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resetAnalysisInstrumentationListeners,
  subscribeAnalysisInstrumentation,
} from "@/lib/analysis/instrumentation/bus";
import {
  getOnnxModelLoadSnapshot,
  reportOnnxModelDownloadStarted,
  reportOnnxModelError,
  reportOnnxModelInitializing,
  reportOnnxModelReady,
  resetOnnxModelLoadSnapshotForTests,
} from "./loadProgress";

describe("ONNX model load progress", () => {
  afterEach(() => {
    resetOnnxModelLoadSnapshotForTests();
    resetAnalysisInstrumentationListeners();
  });

  it("emits load_status instrumentation while progressing through phases", () => {
    const events: Array<{ status: string; detail?: string }> = [];
    subscribeAnalysisInstrumentation((event) => {
      if (event.type === "load_status") {
        events.push({ status: event.status, detail: event.detail });
      }
    });

    reportOnnxModelDownloadStarted("/models/kaya.fp32.onnx", "fp32");
    reportOnnxModelInitializing("/models/kaya.fp32.onnx", "fp32");
    reportOnnxModelReady("/models/kaya.fp32.onnx", "fp32");

    expect(events).toEqual([
      { status: "loading", detail: "downloading" },
      { status: "loading", detail: "initializing" },
      { status: "ready", detail: undefined },
    ]);
    expect(getOnnxModelLoadSnapshot()).toEqual({
      phase: "ready",
      variant: "fp32",
      modelArtifactUrl: "/models/kaya.fp32.onnx",
    });
  });

  it("records error state and emits load_status error", () => {
    const errors: string[] = [];
    subscribeAnalysisInstrumentation((event) => {
      if (event.type === "load_status" && event.status === "error") {
        errors.push(event.detail ?? "");
      }
    });

    reportOnnxModelError("/models/kaya.fp32.onnx", "fp32", new Error("network down"));

    expect(errors).toEqual(["network down"]);
    expect(getOnnxModelLoadSnapshot().phase).toBe("error");
  });

  it("does not emit duplicate ready events when ready is reported twice", () => {
    const readyCount = vi.fn();
    subscribeAnalysisInstrumentation((event) => {
      if (event.type === "load_status" && event.status === "ready") {
        readyCount();
      }
    });

    reportOnnxModelReady("/models/kaya.fp32.onnx", "fp32");
    reportOnnxModelReady("/models/kaya.fp32.onnx", "fp32");

    expect(readyCount).toHaveBeenCalledTimes(1);
  });
});
