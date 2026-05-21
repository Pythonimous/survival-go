import { useCallback, useEffect, useState } from "react";

import {
  getOnnxModelLoadSnapshot,
  type OnnxModelLoadSnapshot,
} from "@/lib/analysis/runtime/loadProgress";
import {
  ONNX_MODEL_ARTIFACT_URLS,
  ONNX_MODEL_VARIANTS,
  FALLBACK_ONNX_MODEL_VARIANT,
  PREFERRED_ONNX_MODEL_VARIANT,
  type OnnxModelArtifactSelection,
  getUserSelectedOnnxModelVariant,
  type OnnxModelVariant,
} from "@/lib/analysis/runtime/modelVariant";
import {
  loadOnnxModelAutoVariant,
  loadOnnxModelVariant,
} from "@/lib/analysis/runtime/modelLoader";
import { subscribeAnalysisInstrumentation } from "@/lib/analysis/instrumentation/bus";
import { pickConfig, probeEnvironment } from "@/lib/analysis/onnx/kaya/auto-config";

type ProviderSelectionReason = "browser_onnx_primary" | "browser_onnx_constrained_runtime";

type RuntimeCapabilityDescription = {
  compatible: boolean;
  severity: "ok" | "warning" | "error";
  title: string;
  message: string;
};

type ProviderPolicyDescription = {
  showFallbackNotice: boolean;
  title: string;
  message: string;
};

type ModelLoadDescription = {
  showProgress: boolean;
  severity: "ok" | "warning" | "error";
  message: string;
};

type AnalysisProviderSelectionPolicy = {
  providerId: string;
  reason: ProviderSelectionReason;
  model: OnnxModelArtifactSelection;
  note: string;
};

export type AnalysisRuntimeStatus = {
  policy: AnalysisProviderSelectionPolicy;
  capability: RuntimeCapabilityDescription;
  fallback: ProviderPolicyDescription;
  load: ModelLoadDescription;
  loadSnapshot: OnnxModelLoadSnapshot;
  inferenceBlocked: boolean;
  startDisabled: boolean;
  modelVariants: readonly OnnxModelVariant[];
  selectionMode: "auto" | "manual";
  selectedVariant: OnnxModelVariant | null;
  recommendedVariant: OnnxModelVariant;
  pickedVariantReady: boolean;
  selectAutoMode: () => void;
  selectManualMode: () => void;
  selectModelVariant: (variant: OnnxModelVariant) => void;
};

function describeModelLoadSnapshot(snapshot: OnnxModelLoadSnapshot): ModelLoadDescription {
  if (snapshot.phase === "downloading") {
    return {
      showProgress: true,
      severity: "ok",
      message: `Downloading ${snapshot.variant ?? "ONNX"} model...`,
    };
  }

  if (snapshot.phase === "initializing") {
    return {
      showProgress: true,
      severity: "ok",
      message: "Initializing ONNX runtime...",
    };
  }

  if (snapshot.phase === "error") {
    return {
      showProgress: true,
      severity: "error",
      message: snapshot.errorMessage
        ? `Model load failed: ${snapshot.errorMessage}`
        : "Model load failed.",
    };
  }

  if (snapshot.phase === "ready") {
    return {
      showProgress: false,
      severity: "ok",
      message: `ONNX model ready (${snapshot.variant ?? "unknown"}).`,
    };
  }

  return {
    showProgress: false,
    severity: "ok",
    message: "ONNX model not loaded yet.",
  };
}

export function useAnalysisRuntimeStatus(): AnalysisRuntimeStatus {
  const [policy, setPolicy] = useState<AnalysisProviderSelectionPolicy>({
    providerId: "browser-onnx",
    reason: "browser_onnx_primary",
    model: {
      variant: PREFERRED_ONNX_MODEL_VARIANT,
      modelArtifactUrl: ONNX_MODEL_ARTIFACT_URLS[PREFERRED_ONNX_MODEL_VARIANT],
      reason: "primary",
    },
    note: "Kaya auto-config pending",
  });
  const [capability, setCapability] = useState<RuntimeCapabilityDescription>({
    compatible: true,
    severity: "ok",
    title: "Browser analysis ready",
    message: "Runtime details are being detected from Kaya auto-config.",
  });
  const [fallback, setFallback] = useState<ProviderPolicyDescription>({
    showFallbackNotice: false,
    title: "Standard model",
    message: "Using the model selected by Kaya runtime auto-config.",
  });
  const [recommendedVariant, setRecommendedVariant] = useState<OnnxModelVariant>(
    PREFERRED_ONNX_MODEL_VARIANT,
  );
  const [loadSnapshot, setLoadSnapshot] = useState(getOnnxModelLoadSnapshot);
  const [selectedVariant, setSelectedVariant] = useState<OnnxModelVariant | null>(
    () => getUserSelectedOnnxModelVariant(),
  );
  const [selectionMode, setSelectionMode] = useState<"auto" | "manual">(() =>
    getUserSelectedOnnxModelVariant() === null ? "auto" : "manual",
  );

  useEffect(() => {
    let active = true;

    const resolveFromKaya = async () => {
      try {
        const probe = await probeEnvironment();
        const autoPick = pickConfig(probe);
        if (!active) {
          return;
        }

        const recommended = autoPick.quantization;
        const constrained = recommended === FALLBACK_ONNX_MODEL_VARIANT;
        setRecommendedVariant(recommended);
        setPolicy({
          providerId: "browser-onnx",
          reason: constrained ? "browser_onnx_constrained_runtime" : "browser_onnx_primary",
          model: {
            variant: recommended,
            modelArtifactUrl: ONNX_MODEL_ARTIFACT_URLS[recommended],
            reason: constrained ? "constrained_runtime_fallback" : "primary",
          },
          note: autoPick.reasoning,
        });
        setCapability({
          compatible: true,
          severity: constrained ? "warning" : "ok",
          title: constrained ? "Limited device capability" : "Browser analysis ready",
          message: autoPick.reasoning,
        });
        setFallback(
          constrained
            ? {
                showFallbackNotice: true,
                title: "Using lighter ONNX model",
                message: `Kaya auto-config selected ${recommended} for this runtime (${autoPick.reasoning}).`,
              }
            : {
                showFallbackNotice: false,
                title: "Standard model",
                message: `Kaya auto-config selected ${recommended} (${autoPick.reasoning}).`,
              },
        );
      } catch {
        if (!active) {
          return;
        }
        setRecommendedVariant(PREFERRED_ONNX_MODEL_VARIANT);
        setPolicy({
          providerId: "browser-onnx",
          reason: "browser_onnx_primary",
          model: {
            variant: PREFERRED_ONNX_MODEL_VARIANT,
            modelArtifactUrl: ONNX_MODEL_ARTIFACT_URLS[PREFERRED_ONNX_MODEL_VARIANT],
            reason: "primary",
          },
          note: "Kaya auto-config probe failed; defaulting to fp32.",
        });
        setCapability({
          compatible: true,
          severity: "warning",
          title: "Runtime detection degraded",
          message: "Could not probe Kaya runtime; defaulting to fp32.",
        });
        setFallback({
          showFallbackNotice: false,
          title: "Standard model",
          message: "Using fp32 default because Kaya runtime probing failed.",
        });
      }
    };

    void resolveFromKaya();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeAnalysisInstrumentation((event) => {
      if (event.type === "load_status") {
        setLoadSnapshot(getOnnxModelLoadSnapshot());
      }
    });
    return unsubscribe;
  }, []);

  const selectAutoMode = useCallback(() => {
    setSelectionMode("auto");
    setSelectedVariant(null);
    void loadOnnxModelAutoVariant();
  }, []);

  const selectManualMode = useCallback(() => {
    setSelectionMode("manual");
  }, []);

  const selectModelVariant = useCallback((variant: OnnxModelVariant) => {
    setSelectionMode("manual");
    setSelectedVariant(variant);
    void loadOnnxModelVariant(variant);
  }, []);

  const load = describeModelLoadSnapshot(loadSnapshot);
  const inferenceBlocked = !capability.compatible;
  const expectedReadyVariant =
    selectionMode === "manual" ? selectedVariant : recommendedVariant;
  const pickedVariantReady =
    expectedReadyVariant !== null &&
    loadSnapshot.phase === "ready" &&
    loadSnapshot.variant === expectedReadyVariant;
  const startDisabled = inferenceBlocked || !pickedVariantReady;

  return {
    policy,
    capability,
    fallback,
    load,
    loadSnapshot,
    inferenceBlocked,
    startDisabled,
    modelVariants: ONNX_MODEL_VARIANTS,
    selectionMode,
    selectedVariant,
    recommendedVariant,
    pickedVariantReady,
    selectAutoMode,
    selectManualMode,
    selectModelVariant,
  };
}
