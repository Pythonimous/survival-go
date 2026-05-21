/**
 * POST raw ONNX outputs / engine-move payloads to the backend for interpretation.
 * fetchWithTimeout applies only to these HTTP calls — after local OnnxEngine work finishes.
 */
import { apiUrl } from "@/lib/api/client";
import { readApiFailure } from "@/lib/api/errors";
import { fetchWithTimeout } from "@/lib/api/fetchWithTimeout";
import type { AnalysisResult, EngineMoveResult } from "@/lib/analysis/types";
import type { OnnxRawInferenceOutput } from "@/lib/analysis/onnx/inference/rawOutputs";
import type { BrowserEngineMovePayload } from "@/lib/analysis/onnx/inference/engineMovePayload";

type AnalyzeApiResponse = {
  survival_score: number;
  metrics: AnalysisResult["metrics"];
  policy?: number[];
  p_black?: number[];
  score_lead?: number;
  winrate?: number;
};

type EngineMoveApiResponse = {
  survival_score: number;
  metrics: AnalysisResult["metrics"];
  candidates: EngineMoveResult["candidates"];
  move?: string;
  resigned: boolean;
  winrate?: number;
  score_lead?: number;
};

type RawModelOutputsPayload = {
  policy: number[];
  ownership: number[];
  value?: number[];
  miscvalue?: number[];
};

export async function postRawOnnxOutputsForAnalysis(options: {
  gameId: string;
  raw: OnnxRawInferenceOutput;
  timeoutMs?: number;
}): Promise<AnalysisResult> {
  const payload: RawModelOutputsPayload = {
    policy: Array.from(options.raw.policy),
    ownership: Array.from(options.raw.ownership),
  };
  if (options.raw.value !== undefined) {
    payload.value = Array.from(options.raw.value);
  }
  if (options.raw.miscvalue !== undefined) {
    payload.miscvalue = Array.from(options.raw.miscvalue);
  }

  const response = await fetchWithTimeout(
    apiUrl(`/api/games/${options.gameId}/analyze`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw_model_outputs: payload }),
    },
    { timeoutMs: options.timeoutMs, operation: "analyze position" },
  );
  if (!response.ok) {
    await readApiFailure(response, "Could not analyze position.");
  }
  const body = (await response.json()) as AnalyzeApiResponse;
  return {
    survivalScore: body.survival_score,
    metrics: body.metrics,
    policy: body.policy,
    pBlack: body.p_black,
    scoreLead: body.score_lead,
    winrate: body.winrate,
  };
}

export async function postBrowserEngineMovePayload(options: {
  gameId: string;
  payload: BrowserEngineMovePayload;
  timeoutMs?: number;
}): Promise<EngineMoveResult> {
  const browserEngineMovePayload = {
    position_raw: options.payload.positionRaw,
    candidates: options.payload.candidates.map((candidate) => ({
      move: candidate.move,
      policy_prob: candidate.policyProb,
      raw_model_outputs: candidate.raw,
    })),
  };
  const response = await fetchWithTimeout(
    apiUrl(`/api/games/${options.gameId}/engine-move`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ browser_engine_move: browserEngineMovePayload }),
    },
    { timeoutMs: options.timeoutMs, operation: "request engine move" },
  );
  if (!response.ok) {
    await readApiFailure(response, "Could not request engine move.");
  }
  const body = (await response.json()) as EngineMoveApiResponse;
  return {
    survivalScore: body.survival_score,
    metrics: body.metrics,
    candidates: body.candidates,
    move: body.resigned ? undefined : body.move,
    resigned: body.resigned,
    winrate: body.winrate,
    scoreLead: body.score_lead,
  };
}
