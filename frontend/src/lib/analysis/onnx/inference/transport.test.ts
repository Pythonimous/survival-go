import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiNetworkError, ApiTimeoutError } from "@/lib/api/clientErrors";
import {
  postBrowserEngineMovePayload,
  postRawOnnxOutputsForAnalysis,
} from "./transport";
import type { BrowserEngineMovePayload } from "@/lib/analysis/onnx/inference/engineMovePayload";
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

  it("passes an abort signal with a configured timeout", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          survival_score: 0,
          metrics: { unresolved_count: 0, min_black_probability: 0.5 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await postRawOnnxOutputsForAnalysis({ gameId: "game-1", raw: makeRawOutput() });

    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.signal).toBeInstanceOf(AbortSignal);
  });

  it("surfaces ApiTimeoutError when analyze fetch times out", async () => {
    fetchMock.mockImplementation((_url, init) => {
      const signal = init?.signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });
    vi.useFakeTimers();

    const promise = postRawOnnxOutputsForAnalysis({
      gameId: "game-1",
      raw: makeRawOutput(),
      timeoutMs: 500,
    });
    const rejection = expect(promise).rejects;
    vi.advanceTimersByTime(500);
    await rejection.toBeInstanceOf(ApiTimeoutError);
    await expect(promise).rejects.toMatchObject({
      message: expect.stringContaining("analyze"),
    });
    vi.useRealTimers();
  });

  it("surfaces ApiNetworkError when analyze fetch cannot reach the API", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(
      postRawOnnxOutputsForAnalysis({ gameId: "game-1", raw: makeRawOutput() }),
    ).rejects.toBeInstanceOf(ApiNetworkError);
  });
});

function makeEngineMovePayload(): BrowserEngineMovePayload {
  const points = 19 * 19;
  const moves = points + 1;
  return {
    positionRaw: {
      policy: Array.from({ length: moves }, () => 0),
      ownership: Array.from({ length: points }, () => 0),
      value: [0, 0, 0],
      miscvalue: Array.from({ length: 10 }, () => 0),
    },
    candidates: [
      {
        move: "D4",
        policyProb: 0.2,
        raw: {
          policy: Array.from({ length: moves }, () => 0),
          ownership: Array.from({ length: points }, () => 0),
        },
      },
    ],
  };
}

describe("postBrowserEngineMovePayload", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("surfaces ApiTimeoutError when engine-move fetch times out", async () => {
    fetchMock.mockImplementation((_url, init) => {
      const signal = init?.signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });
    vi.useFakeTimers();

    const promise = postBrowserEngineMovePayload({
      gameId: "game-1",
      payload: makeEngineMovePayload(),
      timeoutMs: 500,
    });
    const rejection = expect(promise).rejects;
    vi.advanceTimersByTime(500);
    await rejection.toBeInstanceOf(ApiTimeoutError);
    await expect(promise).rejects.toMatchObject({
      message: expect.stringContaining("engine move"),
    });
  });
});
