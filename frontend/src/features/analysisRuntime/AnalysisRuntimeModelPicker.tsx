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
  selectedVariant: OnnxModelVariant | null;
  recommendedVariant: OnnxModelVariant;
  loadSnapshot: OnnxModelLoadSnapshot;
  capabilityCompatible: boolean;
  onSelectVariant: (variant: OnnxModelVariant) => void;
};

function describeStatus(
  selectedVariant: OnnxModelVariant | null,
  snapshot: OnnxModelLoadSnapshot,
): { role: "status" | "alert"; message: string } {
  const labelFor = (variant: OnnxModelVariant | null) => variant ?? "model";

  if (snapshot.phase === "error" && selectedVariant !== null) {
    const detail = snapshot.errorMessage ? `: ${snapshot.errorMessage}` : "";
    return {
      role: "alert",
      message: `Failed to load ${labelFor(snapshot.variant ?? selectedVariant)} model${detail}.`,
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
      message: `${labelFor(snapshot.variant)} model ready.`,
    };
  }

  return {
    role: "status",
    message: "Pick a model to download before starting a game.",
  };
}

export default function AnalysisRuntimeModelPicker({
  variants,
  selectedVariant,
  recommendedVariant,
  loadSnapshot,
  capabilityCompatible,
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
  const { role, message } = describeStatus(selectedVariant, loadSnapshot);

  return (
    <section className="analysis-runtime-picker" aria-label="Model picker">
      <header className="analysis-runtime-picker__header">
        <h2 className="analysis-runtime-picker__title">Model</h2>
        <p className="analysis-runtime-picker__hint">
          Browser inference runs the AI locally. Pick a model to download before starting a game.
        </p>
      </header>
      <div
        role="group"
        aria-label="Model"
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
              disabled={loading}
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
