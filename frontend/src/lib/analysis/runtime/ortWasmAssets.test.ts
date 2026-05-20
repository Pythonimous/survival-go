import { afterEach, describe, expect, it, vi } from "vitest";

import {
  preloadThreadedOrtWasmPaths,
  revokePreloadedOrtWasmPaths,
  willUseMultiThreadedOrtWasm,
} from "./ortWasmAssets";

describe("ortWasmAssets", () => {
  afterEach(() => {
    revokePreloadedOrtWasmPaths();
    vi.unstubAllGlobals();
  });

  it("detects multi-threaded mode from explicit numThreads", () => {
    expect(willUseMultiThreadedOrtWasm(8, false)).toBe(true);
    expect(willUseMultiThreadedOrtWasm(1, true)).toBe(false);
  });

  it("falls back to crossOriginIsolated when numThreads is unset", () => {
    expect(willUseMultiThreadedOrtWasm(undefined, true)).toBe(true);
    expect(willUseMultiThreadedOrtWasm(undefined, false)).toBe(false);
  });

  it("preloads threaded ORT assets with JavaScript and wasm blob MIME types", async () => {
    const createdBlobs: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      createdBlobs.push(blob);
      return `blob:test-${createdBlobs.length}`;
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;

    const fetchMock = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.endsWith(".jsep.mjs")) {
        return new Response("export {};", {
          status: 200,
          headers: { "Content-Type": "application/octet-stream" },
        });
      }
      if (href.endsWith(".jsep.wasm")) {
        return new Response(new Uint8Array([0x00, 0x61, 0x73, 0x6d]), {
          status: 200,
          headers: { "Content-Type": "application/octet-stream" },
        });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await preloadThreadedOrtWasmPaths();
    expect(createdBlobs).toHaveLength(2);
    expect(createdBlobs[0]?.type).toMatch(/javascript/);
    expect(createdBlobs[1]?.type).toBe("application/wasm");
  });
});
