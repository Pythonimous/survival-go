import { afterEach, describe, expect, it, vi } from "vitest";

const { pickConfigMock, probeEnvironmentMock } = vi.hoisted(() => ({
  pickConfigMock: vi.fn(),
  probeEnvironmentMock: vi.fn(),
}));

vi.mock("@/lib/analysis/onnx/kaya/auto-config", () => ({
  pickConfig: pickConfigMock,
  probeEnvironment: probeEnvironmentMock,
}));

import {
  ONNX_MODEL_ARTIFACT_URLS,
  ONNX_MODEL_VARIANTS,
  clearUserSelectedOnnxModelVariant,
  getKayaRecommendedOnnxModelVariant,
  setUserSelectedOnnxModelVariant,
  getUserSelectedOnnxModelVariant,
} from "./modelVariant";

describe("ONNX model artifact selection", () => {
  afterEach(() => {
    clearUserSelectedOnnxModelVariant();
    pickConfigMock.mockReset();
    probeEnvironmentMock.mockReset();
  });

  it("lists all three shipped variants (fp32, fp16, uint8)", () => {
    expect(ONNX_MODEL_VARIANTS).toEqual(["fp32", "fp16", "uint8"]);
    for (const variant of ONNX_MODEL_VARIANTS) {
      expect(ONNX_MODEL_ARTIFACT_URLS[variant]).toMatch(
        new RegExp(`\\.${variant}\\.onnx$`),
      );
    }
  });

  it("points URLs at the Hugging Face kaya-go/kaya repo by default", () => {
    for (const variant of ONNX_MODEL_VARIANTS) {
      expect(ONNX_MODEL_ARTIFACT_URLS[variant]).toMatch(
        /^https:\/\/huggingface\.co\/kaya-go\/kaya\/resolve\/main\/kata1-b28c512nbt-s12043015936-d5616446734\//,
      );
    }
  });

  it("stores and clears explicit user-selected model variant", () => {
    setUserSelectedOnnxModelVariant("uint8");
    expect(getUserSelectedOnnxModelVariant()).toBe("uint8");

    setUserSelectedOnnxModelVariant("fp16");
    expect(getUserSelectedOnnxModelVariant()).toBe("fp16");
    clearUserSelectedOnnxModelVariant();
    expect(getUserSelectedOnnxModelVariant()).toBeNull();
  });

  it("derives recommended variant from Kaya auto-config quantization", async () => {
    probeEnvironmentMock.mockResolvedValue({
      isTauri: false,
      hasWebGPU: true,
      hasShaderF16: true,
      threads: 8,
      approxRamMB: 8192,
      hasPyTorchSidecar: false,
    });
    pickConfigMock.mockReturnValue({
      modelId: "kata1-b28-latest",
      quantization: "fp16",
      backendChain: ["webgpu", "wasm"],
      reasoning: "webgpu + f16",
    });

    await expect(getKayaRecommendedOnnxModelVariant()).resolves.toBe("fp16");
    expect(probeEnvironmentMock).toHaveBeenCalledTimes(1);
    expect(pickConfigMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to fp32 if Kaya probing/config selection fails", async () => {
    probeEnvironmentMock.mockRejectedValue(new Error("probe failed"));

    await expect(getKayaRecommendedOnnxModelVariant()).resolves.toBe("fp32");
  });
});
