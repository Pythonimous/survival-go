import { afterEach, describe, expect, it, vi } from "vitest";

import {
  emitAnalysisInstrumentation,
  instrumentedAnalysisCall,
  resetAnalysisInstrumentationListeners,
  subscribeAnalysisInstrumentation,
} from "@/lib/analysis/instrumentation/bus";

describe("analysis instrumentation", () => {
  afterEach(() => {
    resetAnalysisInstrumentationListeners();
  });

  it("notifies subscribers of fallback events", () => {
    const received: string[] = [];
    subscribeAnalysisInstrumentation((event) => {
      if (event.type === "fallback") {
        received.push(`${event.fromProviderId}->${event.toProviderId}:${event.reason}`);
      }
    });

    emitAnalysisInstrumentation({
      type: "fallback",
      fromProviderId: "browser-onnx",
      toProviderId: "server-katago",
      reason: "webgpu-unavailable",
    });

    expect(received).toEqual(["browser-onnx->server-katago:webgpu-unavailable"]);
  });

  it("records success timing for instrumented calls", async () => {
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(250);

    const events: Array<{ type: string; durationMs?: number }> = [];
    subscribeAnalysisInstrumentation((event) => {
      events.push({
        type: event.type,
        durationMs: "durationMs" in event ? event.durationMs : undefined,
      });
    });

    const value = await instrumentedAnalysisCall({
      providerId: "server-katago",
      operation: "analyzePosition",
      run: async () => "ok",
    });

    expect(value).toBe("ok");
    expect(events).toEqual([
      { type: "request_start", durationMs: undefined },
      { type: "request_success", durationMs: 150 },
    ]);
  });

  it("records failure timing for instrumented calls", async () => {
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(50)
      .mockReturnValueOnce(120);

    const failures: Array<{ reason: string; durationMs: number }> = [];
    subscribeAnalysisInstrumentation((event) => {
      if (event.type === "request_failure") {
        failures.push({ reason: event.reason, durationMs: event.durationMs });
      }
    });

    await expect(
      instrumentedAnalysisCall({
        providerId: "server-katago",
        operation: "requestEngineMove",
        run: async () => {
          throw new Error("engine down");
        },
      }),
    ).rejects.toThrow("engine down");

    expect(failures).toEqual([{ reason: "engine down", durationMs: 70 }]);
  });
});
