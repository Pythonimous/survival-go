import { describe, expect, it } from "vitest";

import { willUseMultiThreadedOrtWasm } from "./ortWasmAssets";

describe("ortWasmAssets", () => {
  it("detects multi-threaded mode from explicit numThreads", () => {
    expect(willUseMultiThreadedOrtWasm(8, false)).toBe(true);
    expect(willUseMultiThreadedOrtWasm(1, true)).toBe(false);
  });

  it("falls back to crossOriginIsolated when numThreads is unset", () => {
    expect(willUseMultiThreadedOrtWasm(undefined, true)).toBe(true);
    expect(willUseMultiThreadedOrtWasm(undefined, false)).toBe(false);
  });
});
