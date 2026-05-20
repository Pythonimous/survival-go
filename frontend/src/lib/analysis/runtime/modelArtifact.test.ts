import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchOnnxModelArtifact } from "./modelArtifact";

describe("fetchOnnxModelArtifact", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns array buffer on success", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(bytes, { status: 200 })),
    );

    const buffer = await fetchOnnxModelArtifact("https://example.com/model.onnx");
    expect(new Uint8Array(buffer)).toEqual(bytes);
  });

  it("throws on failed response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404, statusText: "Not Found" })),
    );

    await expect(fetchOnnxModelArtifact("https://example.com/missing.onnx")).rejects.toThrow(
      /Failed to download ONNX model/,
    );
  });
});
