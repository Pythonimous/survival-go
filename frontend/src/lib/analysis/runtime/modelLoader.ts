import {
  getSharedOnnxEngine,
  primeSharedOnnxEngineModelBuffer,
  resetSharedOnnxEngine,
} from "@/lib/analysis/providers/BrowserOnnxProvider";
import {
  getOnnxModelLoadSnapshot,
  reportOnnxModelDownloadStarted,
  reportOnnxModelError,
  reportOnnxModelInitializing,
  reportOnnxModelReady,
} from "@/lib/analysis/runtime/loadProgress";
import { fetchOnnxModelArtifact } from "@/lib/analysis/runtime/modelArtifact";
import {
  ONNX_MODEL_ARTIFACT_URLS,
  clearUserSelectedOnnxModelVariant,
  setUserSelectedOnnxModelVariant,
  type OnnxModelVariant,
} from "@/lib/analysis/runtime/modelVariant";
import { resolveOnnxArtifactVariantForLoad } from "@/lib/analysis/runtime/resolveLoadVariant";

type LoadRequestKey = OnnxModelVariant | "auto";
type ActiveLoad = { key: LoadRequestKey; promise: Promise<void> };

let activeLoad: ActiveLoad | null = null;

export function resetOnnxWarmupForTests(): void {
  activeLoad = null;
}

/**
 * Auto-warmup hook retained as a no-op-friendly export so existing test mocks
 * keep resolving. The setup screen requires an explicit variant pick via
 * `loadOnnxModelVariant`.
 */
export async function warmupOnnxModelSession(): Promise<void> {
  if (getOnnxModelLoadSnapshot().phase === "ready") {
    return;
  }
}

/**
 * Explicitly load an ONNX model variant chosen by the user. Tears down any
 * existing Kaya engine (so a fresh one is built against the new variant) and
 * emits the load-progress phases the picker/banner UX subscribes to.
 */
export async function loadOnnxModelVariant(variant: OnnxModelVariant): Promise<void> {
  if (activeLoad && activeLoad.key === variant) {
    return activeLoad.promise;
  }

  setUserSelectedOnnxModelVariant(variant);
  resetSharedOnnxEngine();

  const promise = (async () => {
    const { effectiveVariant, upgradedFrom } = await resolveOnnxArtifactVariantForLoad(variant);
    const modelArtifactUrl = ONNX_MODEL_ARTIFACT_URLS[effectiveVariant];
    reportOnnxModelDownloadStarted(modelArtifactUrl, effectiveVariant);
    try {
      const modelBuffer = await fetchOnnxModelArtifact(modelArtifactUrl);
      primeSharedOnnxEngineModelBuffer(modelBuffer);
      reportOnnxModelInitializing(modelArtifactUrl, effectiveVariant);
      await getSharedOnnxEngine();
      reportOnnxModelReady(modelArtifactUrl, effectiveVariant);
      if (upgradedFrom) {
        console.warn(
          `[OnnxEngine] Requested ${upgradedFrom} weights; loaded ${effectiveVariant} artifact (${modelArtifactUrl}).`,
        );
      }
    } catch (error) {
      reportOnnxModelError(modelArtifactUrl, effectiveVariant, error);
      throw error;
    } finally {
      if (activeLoad && activeLoad.key === variant) {
        activeLoad = null;
      }
    }
  })();

  activeLoad = { key: variant, promise };
  return promise;
}

/** Load Kaya-recommended model from auto-config (no manual override). */
export async function loadOnnxModelAutoVariant(): Promise<void> {
  const key: LoadRequestKey = "auto";
  if (activeLoad && activeLoad.key === key) {
    return activeLoad.promise;
  }
  clearUserSelectedOnnxModelVariant();
  resetSharedOnnxEngine();

  const promise = (async () => {
    const { effectiveVariant } = await resolveOnnxArtifactVariantForLoad(null);
    const modelArtifactUrl = ONNX_MODEL_ARTIFACT_URLS[effectiveVariant];
    reportOnnxModelDownloadStarted(modelArtifactUrl, effectiveVariant);
    try {
      const modelBuffer = await fetchOnnxModelArtifact(modelArtifactUrl);
      primeSharedOnnxEngineModelBuffer(modelBuffer);
      reportOnnxModelInitializing(modelArtifactUrl, effectiveVariant);
      await getSharedOnnxEngine();
      reportOnnxModelReady(modelArtifactUrl, effectiveVariant);
    } catch (error) {
      reportOnnxModelError(modelArtifactUrl, effectiveVariant, error);
      throw error;
    } finally {
      if (activeLoad && activeLoad.key === key) {
        activeLoad = null;
      }
    }
  })();

  activeLoad = { key, promise };
  return promise;
}
