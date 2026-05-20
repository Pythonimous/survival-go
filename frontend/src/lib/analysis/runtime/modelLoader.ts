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
  setUserSelectedOnnxModelVariant,
  type OnnxModelVariant,
} from "@/lib/analysis/runtime/modelVariant";

type ActiveLoad = { variant: OnnxModelVariant; promise: Promise<void> };

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
  if (activeLoad && activeLoad.variant === variant) {
    return activeLoad.promise;
  }

  setUserSelectedOnnxModelVariant(variant);
  resetSharedOnnxEngine();

  const modelArtifactUrl = ONNX_MODEL_ARTIFACT_URLS[variant];
  const promise = (async () => {
    reportOnnxModelDownloadStarted(modelArtifactUrl, variant);
    try {
      const modelBuffer = await fetchOnnxModelArtifact(modelArtifactUrl);
      primeSharedOnnxEngineModelBuffer(modelBuffer);
      reportOnnxModelInitializing(modelArtifactUrl, variant);
      await getSharedOnnxEngine();
      reportOnnxModelReady(modelArtifactUrl, variant);
    } catch (error) {
      reportOnnxModelError(modelArtifactUrl, variant, error);
      throw error;
    } finally {
      if (activeLoad && activeLoad.variant === variant) {
        activeLoad = null;
      }
    }
  })();

  activeLoad = { variant, promise };
  return promise;
}
