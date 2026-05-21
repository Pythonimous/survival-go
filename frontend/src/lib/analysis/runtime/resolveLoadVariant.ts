import { pickConfig, probeEnvironment } from "@/lib/analysis/onnx/kaya/auto-config";
import { resolveBootstrapModelVariant } from "@/lib/analysis/providers/BrowserOnnxProvider";
import type { OnnxModelVariant } from "@/lib/analysis/runtime/modelVariant";

/** Map selection mode/pick to the artifact we actually download and execute. */
export async function resolveOnnxArtifactVariantForLoad(
  requestedVariant: OnnxModelVariant | null,
): Promise<{
  effectiveVariant: OnnxModelVariant;
  upgradedFrom: OnnxModelVariant | null;
}> {
  const probe = await probeEnvironment();
  const autoPick = pickConfig(probe);
  const resolved = resolveBootstrapModelVariant(autoPick, requestedVariant);
  return {
    effectiveVariant: resolved.modelVariant,
    upgradedFrom: resolved.upgradedFrom,
  };
}
