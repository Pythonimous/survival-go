import { pickConfig, probeEnvironment } from "@/lib/analysis/onnx/kaya/auto-config";

/**
 * Shipped ONNX artifact variants, ordered from highest precision / largest
 * download (`fp32`) to most aggressively quantized (`uint8`).
 *
 * Names mirror the upstream Kaya release files
 * (`kata1-b28c512nbt-s12043015936-d5616446734.<variant>.onnx`).
 */
export type OnnxModelVariant = "fp32" | "fp16" | "uint8";

export const ONNX_MODEL_VARIANTS: readonly OnnxModelVariant[] = ["fp32", "fp16", "uint8"] as const;

export const PREFERRED_ONNX_MODEL_VARIANT: OnnxModelVariant = "fp32";
export const FALLBACK_ONNX_MODEL_VARIANT: OnnxModelVariant = "uint8";

/**
 * Default model artifact source: Hugging Face `kaya-go/kaya` repo. Public
 * artifacts respond with reflected CORS headers, range requests, and a 1-year
 * `Cache-Control: public, max-age=31536000`, so browser-direct fetch works
 * with no proxy / no app-side hosting.
 *
 * Override via build env:
 *   VITE_ONNX_MODEL_BASE_URL          – directory URL containing the files.
 *   VITE_ONNX_MODEL_FILENAME_PREFIX   – filename stem before `.<variant>.onnx`.
 *
 * Example override for a local `frontend/public/models/kaya.*.onnx` layout:
 *   VITE_ONNX_MODEL_BASE_URL=/models
 *   VITE_ONNX_MODEL_FILENAME_PREFIX=kaya
 */
const HF_DEFAULT_BASE_URL =
  "https://huggingface.co/kaya-go/kaya/resolve/main/" +
  "kata1-b28c512nbt-s12043015936-d5616446734";
const HF_DEFAULT_FILENAME_PREFIX = "kata1-b28c512nbt-s12043015936-d5616446734";

function readEnv(key: string): string | undefined {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const value = env?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function resolveArtifactUrls(): Record<OnnxModelVariant, string> {
  const baseUrl = trimTrailingSlash(readEnv("VITE_ONNX_MODEL_BASE_URL") ?? HF_DEFAULT_BASE_URL);
  const prefix = readEnv("VITE_ONNX_MODEL_FILENAME_PREFIX") ?? HF_DEFAULT_FILENAME_PREFIX;
  return {
    fp32: `${baseUrl}/${prefix}.fp32.onnx`,
    fp16: `${baseUrl}/${prefix}.fp16.onnx`,
    uint8: `${baseUrl}/${prefix}.uint8.onnx`,
  };
}

export const ONNX_MODEL_ARTIFACT_URLS: Record<OnnxModelVariant, string> = resolveArtifactUrls();

export type OnnxModelSelectionReason =
  | "primary"
  | "constrained_runtime_fallback"
  | "user_selection";

export type OnnxModelArtifactSelection = {
  variant: OnnxModelVariant;
  modelArtifactUrl: string;
  reason: OnnxModelSelectionReason;
};

let userSelectedVariant: OnnxModelVariant | null = null;

export function setUserSelectedOnnxModelVariant(variant: OnnxModelVariant): void {
  userSelectedVariant = variant;
}

export function clearUserSelectedOnnxModelVariant(): void {
  userSelectedVariant = null;
}

export function getUserSelectedOnnxModelVariant(): OnnxModelVariant | null {
  return userSelectedVariant;
}

export async function getKayaRecommendedOnnxModelVariant(): Promise<OnnxModelVariant> {
  try {
    const probe = await probeEnvironment();
    const autoPick = pickConfig(probe);
    return autoPick.quantization;
  } catch {
    return PREFERRED_ONNX_MODEL_VARIANT;
  }
}
