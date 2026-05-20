import { emitAnalysisInstrumentation } from "@/lib/analysis/instrumentation/bus";
import type { OnnxModelVariant } from "@/lib/analysis/runtime/modelVariant";

export type OnnxModelLoadPhase = "idle" | "downloading" | "initializing" | "ready" | "error";

export type OnnxModelLoadSnapshot = {
  phase: OnnxModelLoadPhase;
  variant: OnnxModelVariant | null;
  modelArtifactUrl: string | null;
  errorMessage?: string;
};

const PROVIDER_ID = "browser-onnx";

let snapshot: OnnxModelLoadSnapshot = {
  phase: "idle",
  variant: null,
  modelArtifactUrl: null,
};

function toInstrumentationStatus(
  phase: OnnxModelLoadPhase,
): "idle" | "loading" | "ready" | "error" {
  if (phase === "downloading" || phase === "initializing") {
    return "loading";
  }
  if (phase === "ready") {
    return "ready";
  }
  if (phase === "error") {
    return "error";
  }
  return "idle";
}

function publishSnapshot(next: OnnxModelLoadSnapshot, detail?: string): void {
  if (snapshot.phase === "ready" && next.phase === "ready") {
    return;
  }

  snapshot = next;
  emitAnalysisInstrumentation({
    type: "load_status",
    providerId: PROVIDER_ID,
    status: toInstrumentationStatus(next.phase),
    detail,
  });
}

export function getOnnxModelLoadSnapshot(): OnnxModelLoadSnapshot {
  return snapshot;
}

export function resetOnnxModelLoadSnapshotForTests(): void {
  snapshot = {
    phase: "idle",
    variant: null,
    modelArtifactUrl: null,
  };
}

export function reportOnnxModelDownloadStarted(
  modelArtifactUrl: string,
  variant: OnnxModelVariant,
): void {
  publishSnapshot(
    {
      phase: "downloading",
      variant,
      modelArtifactUrl,
    },
    "downloading",
  );
}

export function reportOnnxModelInitializing(
  modelArtifactUrl: string,
  variant: OnnxModelVariant,
): void {
  publishSnapshot(
    {
      phase: "initializing",
      variant,
      modelArtifactUrl,
    },
    "initializing",
  );
}

export function reportOnnxModelReady(modelArtifactUrl: string, variant: OnnxModelVariant): void {
  publishSnapshot(
    {
      phase: "ready",
      variant,
      modelArtifactUrl,
    },
    undefined,
  );
}

export function reportOnnxModelError(
  modelArtifactUrl: string,
  variant: OnnxModelVariant,
  error: unknown,
): void {
  const errorMessage = error instanceof Error ? error.message : "unknown error";
  publishSnapshot(
    {
      phase: "error",
      variant,
      modelArtifactUrl,
      errorMessage,
    },
    errorMessage,
  );
}
