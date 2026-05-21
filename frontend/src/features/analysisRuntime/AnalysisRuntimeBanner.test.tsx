import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import AnalysisRuntimeBanner from "./AnalysisRuntimeBanner";
import type { AnalysisRuntimeStatus } from "@/features/analysisRuntime/useAnalysisRuntimeStatus";
import {
  reportOnnxModelDownloadStarted,
  resetOnnxModelLoadSnapshotForTests,
} from "@/lib/analysis/runtime/loadProgress";
import type { OnnxModelLoadSnapshot } from "@/lib/analysis/runtime/loadProgress";

function statusFor(
  overrides: Partial<AnalysisRuntimeStatus> = {},
  loadSnapshot: OnnxModelLoadSnapshot = {
    phase: "idle",
    variant: null,
    modelArtifactUrl: null,
  },
): AnalysisRuntimeStatus {
  return {
    policy: {
      providerId: "browser-onnx",
      reason: "browser_onnx_primary",
      model: {
        variant: "fp32",
        modelArtifactUrl: "/models/kaya.fp32.onnx",
        reason: "primary",
      },
      note: "kaya",
    },
    capability: {
      compatible: true,
      severity: "ok",
      title: "Browser analysis ready",
      message: "On-device ONNX analysis is supported on this browser.",
    },
    fallback: {
      showFallbackNotice: false,
      title: "Standard model",
      message: "Using the fp32 ONNX model for analysis.",
    },
    load: {
      showProgress: false,
      severity: "ok",
      message: "ONNX model not loaded yet.",
    },
    loadSnapshot,
    inferenceBlocked: false,
    startDisabled: true,
    modelVariants: ["fp32", "fp16", "uint8"] as const,
    selectedVariant: null,
    recommendedVariant: "fp32",
    pickedVariantReady: false,
    selectionMode: "auto",
    selectAutoMode: () => undefined,
    selectManualMode: () => undefined,
    selectModelVariant: () => undefined,
    ...overrides,
  };
}

describe("AnalysisRuntimeBanner", () => {
  afterEach(() => {
    resetOnnxModelLoadSnapshotForTests();
  });

  it("shows incompatible-browser error when wasm is unavailable", () => {
    render(<AnalysisRuntimeBanner status={statusFor({ inferenceBlocked: true, capability: {
      compatible: false,
      severity: "error",
      title: "Incompatible browser",
      message:
        "This browser cannot run WebAssembly, which is required for on-device analysis. Try a current version of Chrome, Edge, or Firefox.",
    } })} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/incompatible/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/WebAssembly/i);
  });

  it("shows fallback notice and download progress for constrained runtimes", () => {
    reportOnnxModelDownloadStarted("/models/kaya.uint8.onnx", "uint8");
    const loadSnapshot = {
      phase: "downloading" as const,
      variant: "uint8" as const,
      modelArtifactUrl: "/models/kaya.uint8.onnx",
    };

    render(
      <AnalysisRuntimeBanner
        status={statusFor(
          {
            policy: {
              providerId: "browser-onnx",
              reason: "browser_onnx_constrained_runtime",
              model: {
                variant: "uint8",
                modelArtifactUrl: "/models/kaya.uint8.onnx",
                reason: "constrained_runtime_fallback",
              },
              note: "kaya-fallback",
            },
            fallback: {
              showFallbackNotice: true,
              title: "Using lighter ONNX model",
              message: "Using uint8 fallback chosen from Kaya runtime auto-config.",
            },
            load: {
              showProgress: true,
              severity: "ok",
              message: "Downloading uint8 model…",
            },
            selectedVariant: "uint8",
            recommendedVariant: "uint8",
          },
          loadSnapshot,
        )}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/downloading/i);
    expect(screen.getByText(/Using lighter ONNX model/i)).toBeInTheDocument();
  });
});
