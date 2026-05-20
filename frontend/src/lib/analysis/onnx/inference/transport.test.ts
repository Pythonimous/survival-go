import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { postRawOnnxOutputsForAnalysis } from "./transport";
import type { OnnxRawInferenceOutput } from "@/lib/analysis/onnx/inference/rawOutputs";

function makeRawOutput(): OnnxRawInferenceOutput {
  const boardSize = 19;
  const points = boardSize * boardSize;
  const moves = points + 1;
  return {
    policy: new Float32Array(moves).map((_, index) => Math.sin(index * 0.013)),
    ownership: new Float32Array(points).map((_, index) => ((index % 18) / 9) - 1),
    value: new Float32Array([0.02, -0.01, -0.01]),
    miscvalue: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  };
}

describe("postRawOnnxOutputsForAnalysis", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts raw model outputs as numeric arrays only", async () => {
    const raw = makeRawOutput();
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          game_id: "game-1",
          survival_score: 3,
          metrics: { unresolved_count: 3, min_black_probability: 0.42 },
          policy: [0.7, 0.2, 0.1],
          p_black: [0.4, 0.9],
          winrate: 0.61,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const response = await postRawOnnxOutputsForAnalysis({
      gameId: "game-1",
      raw,
    });

    expect(response).toEqual({
      survivalScore: 3,
      metrics: { unresolved_count: 3, min_black_probability: 0.42 },
      policy: [0.7, 0.2, 0.1],
      pBlack: [0.4, 0.9],
      winrate: 0.61,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/games/game-1/analyze",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );

    const request = fetchMock.mock.calls[0]?.[1];
    expect(request).toBeDefined();
    const body = JSON.parse(String(request?.body)) as {
      raw_model_outputs: Record<string, unknown>;
    };
    expect(Object.keys(body)).toEqual(["raw_model_outputs"]);
    expect(Object.keys(body.raw_model_outputs).sort()).toEqual([
      "miscvalue",
      "ownership",
      "policy",
      "value",
    ]);
    expect(body.raw_model_outputs).not.toHaveProperty("pBlack");
    expect(body.raw_model_outputs).not.toHaveProperty("survivalScore");
    expect(body.raw_model_outputs).not.toHaveProperty("metrics");
    expect(body.raw_model_outputs.policy).toEqual(Array.from(raw.policy));
    expect(body.raw_model_outputs.ownership).toEqual(Array.from(raw.ownership));
    expect(body.raw_model_outputs.value).toEqual(Array.from(raw.value ?? []));
    expect(body.raw_model_outputs.miscvalue).toEqual(Array.from(raw.miscvalue ?? []));
  });
});
