import { afterEach, describe, expect, it } from "vitest";

import {
  getAnalysisProvider,
  getDefaultAnalysisProviderId,
  setAnalysisProviderForTests,
} from "@/lib/analysis/selection";
import { BrowserOnnxProvider } from "@/lib/analysis/providers/BrowserOnnxProvider";
import type { AnalysisProvider } from "@/lib/analysis/types";

describe("analysis provider wiring", () => {
  afterEach(() => {
    setAnalysisProviderForTests(null);
  });

  it("returns BrowserOnnxProvider by default", () => {
    const provider = getAnalysisProvider();
    expect(provider).toBeInstanceOf(BrowserOnnxProvider);
    expect(provider.id).toBe(getDefaultAnalysisProviderId());
    expect(getDefaultAnalysisProviderId()).toBe("browser-onnx");
  });

  it("allows tests to override the active provider", () => {
    const stub: AnalysisProvider = {
      id: "stub",
      analyzePosition: async () => ({
        survivalScore: 0,
        metrics: { unresolved_count: 0, min_black_probability: 0 },
      }),
      getCandidateMoves: async () => [],
      requestEngineMove: async () => ({
        survivalScore: 0,
        metrics: { unresolved_count: 0, min_black_probability: 0 },
        candidates: [],
        resigned: false,
      }),
    };
    setAnalysisProviderForTests(stub);
    expect(getAnalysisProvider()).toBe(stub);
  });
});
