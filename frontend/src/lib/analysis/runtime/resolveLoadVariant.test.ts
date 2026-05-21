import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AutoPick } from "@/lib/analysis/onnx/kaya/auto-config";
import { ONNX_MODEL_ARTIFACT_URLS } from "@/lib/analysis/runtime/modelVariant";

const probeEnvironmentMock = vi.fn();
const pickConfigMock = vi.fn();

vi.mock("@/lib/analysis/onnx/kaya/auto-config", () => ({
  probeEnvironment: () => probeEnvironmentMock(),
  pickConfig: (probe: unknown) => pickConfigMock(probe),
}));

const { resolveOnnxArtifactVariantForLoad } = await import(
  "@/lib/analysis/runtime/resolveLoadVariant"
);

describe("resolveOnnxArtifactVariantForLoad", () => {
  beforeEach(() => {
    probeEnvironmentMock.mockReset();
    pickConfigMock.mockReset();
    probeEnvironmentMock.mockResolvedValue({ hasWebGPU: true });
  });

  it("keeps manual uint8 as-is", async () => {
    const autoPick: AutoPick = {
      modelId: "kata1-b28-latest",
      quantization: "fp32",
      backendChain: ["wasm"],
      reasoning: "wasm only",
    };
    pickConfigMock.mockReturnValue(autoPick);

    const resolved = await resolveOnnxArtifactVariantForLoad("uint8");

    expect(resolved.effectiveVariant).toBe("uint8");
    expect(resolved.upgradedFrom).toBeNull();
  });

  it("resolves auto mode to kaya-recommended variant", async () => {
    const autoPick: AutoPick = {
      modelId: "kata1-b28-latest",
      quantization: "fp16",
      backendChain: ["webgpu", "wasm"],
      reasoning: "webgpu",
    };
    pickConfigMock.mockReturnValue(autoPick);

    const resolved = await resolveOnnxArtifactVariantForLoad(null);

    expect(resolved.effectiveVariant).toBe("fp16");
    expect(resolved.upgradedFrom).toBeNull();
    expect(ONNX_MODEL_ARTIFACT_URLS[resolved.effectiveVariant]).toContain(".fp16.onnx");
  });
});
