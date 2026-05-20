import type { OnnxRawInferenceOutput } from "@/lib/analysis/onnx/inference/rawOutputs";

export type RawModelOutputsPayload = {
  policy: number[];
  ownership: number[];
  value?: number[];
  miscvalue?: number[];
};

export type BrowserEngineMoveCandidatePayload = {
  move: string;
  policyProb: number;
  raw: RawModelOutputsPayload;
};

export type BrowserEngineMovePayload = {
  positionRaw: RawModelOutputsPayload;
  candidates: BrowserEngineMoveCandidatePayload[];
};

/**
 * Minimal numeric candidate descriptor consumed when assembling the
 * engine-move transport payload. Backend Python interprets the raw model
 * outputs; the frontend just labels each candidate with its GTP move and the
 * policy probability the engine reported for it.
 */
export type EngineMoveCandidateDescriptor = {
  move: string;
  policyProb: number;
};

function toNumericPayload(raw: OnnxRawInferenceOutput): RawModelOutputsPayload {
  return {
    policy: Array.from(raw.policy),
    ownership: Array.from(raw.ownership),
    value: raw.value === undefined ? undefined : Array.from(raw.value),
    miscvalue: raw.miscvalue === undefined ? undefined : Array.from(raw.miscvalue),
  };
}

/** Assemble numeric-only transport payload for backend engine-move interpretation. */
export function assembleBrowserEngineMovePayload(options: {
  positionRaw: OnnxRawInferenceOutput;
  candidates: readonly {
    extract: EngineMoveCandidateDescriptor;
    raw: OnnxRawInferenceOutput;
  }[];
}): BrowserEngineMovePayload {
  return {
    positionRaw: toNumericPayload(options.positionRaw),
    candidates: options.candidates.map((item) => ({
      move: item.extract.move,
      policyProb: item.extract.policyProb,
      raw: toNumericPayload(item.raw),
    })),
  };
}
