import type { OnnxModelLoadSnapshot } from "@/lib/analysis/runtime/loadProgress";
import type { OnnxModelVariant } from "@/lib/analysis/runtime/modelVariant";

type VariantDescriptor = {
  variant: OnnxModelVariant;
  title: string;
  approxSize: string;
  blurb: string;
};

const VARIANT_DESCRIPTORS: Record<OnnxModelVariant, VariantDescriptor> = {
  fp32: {
    variant: "fp32",
    title: "Full precision (fp32)",
    approxSize: "~293 MB",
    blurb: "Highest fidelity, slow without a GPU.",
  },
  fp16: {
    variant: "fp16",
    title: "Half precision (fp16)",
    approxSize: "~147 MB",
    blurb: "Balanced for modern CPUs.",
  },
  uint8: {
    variant: "uint8",
    title: "Quantized (uint8)",
    approxSize: "~75 MB",
    blurb: "Smallest download, lowest memory.",
  },
};

type AnalysisRuntimeModelPickerProps = {
  variants: readonly OnnxModelVariant[];
  selectionMode: "auto" | "manual";
  selectedVariant: OnnxModelVariant | null;
  recommendedVariant: OnnxModelVariant;
  loadSnapshot: OnnxModelLoadSnapshot;
  capabilityCompatible: boolean;
  onSelectAutoMode: () => void;
  onSelectManualMode: () => void;
  onSelectVariant: (variant: OnnxModelVariant) => void;
};

function describeStatus(
  selectionMode: "auto" | "manual",
  selectedVariant: OnnxModelVariant | null,
  recommendedVariant: OnnxModelVariant,
  snapshot: OnnxModelLoadSnapshot,
): { role: "status" | "alert"; message: string } {
  const labelFor = (variant: OnnxModelVariant | null) => variant ?? "model";
  const targetLabel =
    selectionMode === "auto" ? `auto (${recommendedVariant})` : labelFor(selectedVariant);

  if (snapshot.phase === "error") {
    const detail = snapshot.errorMessage ? `: ${snapshot.errorMessage}` : "";
    return {
      role: "alert",
      message: `Failed to load ${labelFor(snapshot.variant ?? selectedVariant ?? recommendedVariant)} model${detail}.`,
    };
  }

  if (snapshot.phase === "downloading") {
    return {
      role: "status",
      message: `Downloading ${labelFor(snapshot.variant)} model…`,
    };
  }

  if (snapshot.phase === "initializing") {
    return {
      role: "status",
      message: `Initializing ${labelFor(snapshot.variant)} model…`,
    };
  }

  if (snapshot.phase === "ready") {
    return {
      role: "status",
      message: `${labelFor(snapshot.variant)} model ready (${targetLabel}).`,
    };
  }

  return {
    role: "status",
    message:
      selectionMode === "auto"
        ? `Auto mode selected (${recommendedVariant}). Press Auto to download and initialize.`
        : "Manual mode selected. Pick a model to download before starting a game.",
  };
}

export default function AnalysisRuntimeModelPicker({
  variants,
  selectionMode,
  selectedVariant,
  recommendedVariant,
  loadSnapshot,
  capabilityCompatible,
  onSelectAutoMode,
  onSelectManualMode,
  onSelectVariant,
}: AnalysisRuntimeModelPickerProps) {
  if (!capabilityCompatible) {
    return (
      <section className="analysis-runtime-picker" aria-label="Model picker">
        <p className="analysis-runtime-picker__status" role="status">
          On-device analysis is not available in this browser, so no model can be loaded.
        </p>
      </section>
    );
  }

  const loading =
    loadSnapshot.phase === "downloading" || loadSnapshot.phase === "initializing";
  const { role, message } = describeStatus(
    selectionMode,
    selectedVariant,
    recommendedVariant,
    loadSnapshot,
  );
  const autoSelected = selectionMode === "auto";

  return (
    <section className="analysis-runtime-picker" aria-label="Model picker">
      <header className="analysis-runtime-picker__header">
        <h2 className="analysis-runtime-picker__title">Model</h2>
        <p className="analysis-runtime-picker__hint">
          Browser inference runs the AI locally. Choose Auto (recommended) or Manual.
        </p>
      </header>
      <div role="group" aria-label="Model mode" className="analysis-runtime-picker__buttons">
        <button
          type="button"
          className={[
            "analysis-runtime-picker__button",
            autoSelected ? "analysis-runtime-picker__button--selected" : "",
            "analysis-runtime-picker__button--recommended",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-pressed={autoSelected}
          disabled={loading}
          onClick={onSelectAutoMode}
        >
          <span className="analysis-runtime-picker__button-title">
            Auto (recommended) · runtime pick
          </span>
          <span className="analysis-runtime-picker__button-blurb">
            Uses Kaya auto-config and may choose {recommendedVariant} for this device.
          </span>
        </button>
        <button
          type="button"
          className={[
            "analysis-runtime-picker__button",
            !autoSelected ? "analysis-runtime-picker__button--selected" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-pressed={!autoSelected}
          disabled={loading}
          onClick={onSelectManualMode}
        >
          <span className="analysis-runtime-picker__button-title">Manual</span>
          <span className="analysis-runtime-picker__button-blurb">
            Pick fp32/fp16/uint8 yourself. Manual choice is always honored.
          </span>
        </button>
      </div>
      <div
        role="group"
        aria-label="Manual model"
        className="analysis-runtime-picker__buttons"
      >
        {variants.map((variant) => {
          const descriptor = VARIANT_DESCRIPTORS[variant];
          const isSelected = selectedVariant === variant;
          const isRecommended = recommendedVariant === variant;
          const isReady =
            loadSnapshot.phase === "ready" && loadSnapshot.variant === variant;
          const buttonClass = [
            "analysis-runtime-picker__button",
            isSelected ? "analysis-runtime-picker__button--selected" : "",
            isRecommended ? "analysis-runtime-picker__button--recommended" : "",
            isReady ? "analysis-runtime-picker__button--ready" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={variant}
              type="button"
              className={buttonClass}
              aria-pressed={isSelected}
              disabled={loading || autoSelected}
              onClick={() => onSelectVariant(variant)}
            >
              <span className="analysis-runtime-picker__button-title">
                {descriptor.title} · {descriptor.approxSize}
                {isRecommended && (
                  <span className="analysis-runtime-picker__badge"> (recommended)</span>
                )}
              </span>
              <span className="analysis-runtime-picker__button-blurb">{descriptor.blurb}</span>
            </button>
          );
        })}
      </div>
      <p
        className={`analysis-runtime-picker__status analysis-runtime-picker__status--${loadSnapshot.phase}`}
        role={role}
      >
        {message}
      </p>
    </section>
  );
}
