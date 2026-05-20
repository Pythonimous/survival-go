export const REQUIRED_KAYA_OUTPUT_NAMES = ["policy", "value", "miscvalue", "ownership"] as const;

export type KayaOutputNameValidation =
  | { ok: true }
  | {
      ok: false;
      message: string;
    };

export function validateKayaOutputNames(outputNames: readonly string[]): KayaOutputNameValidation {
  const available = new Set(outputNames);
  const missing = REQUIRED_KAYA_OUTPUT_NAMES.filter((name) => !available.has(name));
  if (missing.length === 0) {
    return { ok: true };
  }
  return {
    ok: false,
    message: `Kaya ONNX artifact is missing required output name(s): ${missing.join(", ")}`,
  };
}

export function assertKayaOutputNames(outputNames: readonly string[]): void {
  const validation = validateKayaOutputNames(outputNames);
  if (!validation.ok) {
    throw new Error(validation.message);
  }
}
