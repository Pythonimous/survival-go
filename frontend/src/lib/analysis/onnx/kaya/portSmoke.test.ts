import { describe, expect, it } from "vitest";
import { OnnxEngine } from "./onnx-engine";
import { AnalysisQueue } from "./queue";
import { pickConfig } from "./auto-config";

describe("kaya ONNX port", () => {
  it("exports the core engine and queue surfaces", () => {
    expect(typeof OnnxEngine).toBe("function");
    expect(typeof AnalysisQueue).toBe("function");
  });

  it("exposes deterministic auto-config defaults", () => {
    const config = pickConfig({
      isTauri: false,
      hasWebGPU: true,
      hasShaderF16: true,
      threads: 8,
      approxRamMB: 8192,
      hasPyTorchSidecar: false,
    });
    expect(config.modelId).toBe("kata1-b28-latest");
    expect(config.backendChain[0]).toBe("webgpu");
    expect(config.quantization).toBe("fp16");
  });
});
