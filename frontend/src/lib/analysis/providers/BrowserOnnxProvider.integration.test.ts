import { describe, expect, it, vi } from "vitest";

import { BrowserOnnxProvider } from "./BrowserOnnxProvider";
import { AnalysisQueue, type AnalysisRequest } from "@/lib/analysis/onnx/kaya/queue";
import { OnnxEngine } from "@/lib/analysis/onnx/kaya/onnx-engine";
import type { BrowserEngineMovePayload } from "@/lib/analysis/onnx/inference/engineMovePayload";
import type { GameState } from "@/types/api";

const boardSize = 19;
const ortMock = vi.hoisted(() => {
  const mockBoardSize = 19;
  const mockLetters = "ABCDEFGHJKLMNOPQRST";
  const policyMoves = ["Q16", "D16", "K10", "C3", "R4", "PASS"];

  function outputTensor(data: Float32Array, dims: readonly number[]): {
    data: Float32Array;
    dims: readonly number[];
    getData: () => Promise<Float32Array>;
    dispose: () => void;
  } {
    return {
      data,
      dims,
      getData: async () => data,
      dispose: () => undefined,
    };
  }

  function policyIndexForMove(move: string): number {
    if (move === "PASS") {
      return mockBoardSize * mockBoardSize;
    }
    const x = mockLetters.indexOf(move[0]);
    const y = mockBoardSize - Number(move.slice(1));
    return y * mockBoardSize + x;
  }

  class MockTensor {
    readonly type: string;
    readonly data: Float32Array | Uint16Array;
    readonly dims: readonly number[];

    constructor(type: string, data: Float32Array | Uint16Array, dims: readonly number[]) {
      this.type = type;
      this.data = data;
      this.dims = dims;
    }

    dispose(): void {
      // Test double only.
    }
  }

  const sessionRun = vi.fn(async (inputs: { bin_input: { dims: readonly number[] } }) => {
    const batchSize = Number(inputs.bin_input.dims[0]);
    const policy = new Float32Array(batchSize * (mockBoardSize * mockBoardSize + 1)).fill(-10);
    const value = new Float32Array(batchSize * 3);
    const miscvalue = new Float32Array(batchSize * 10);
    const ownership = new Float32Array(batchSize * mockBoardSize * mockBoardSize);

    for (let batch = 0; batch < batchSize; batch += 1) {
      value[batch * 3] = 0;
      value[batch * 3 + 1] = 0;
      value[batch * 3 + 2] = -8;
      for (let moveIndex = 0; moveIndex < policyMoves.length; moveIndex += 1) {
        const policyIndex = policyIndexForMove(policyMoves[moveIndex]);
        policy[batch * (mockBoardSize * mockBoardSize + 1) + policyIndex] = 8 - moveIndex;
      }
    }

    return {
      policy: outputTensor(policy, [batchSize, 1, mockBoardSize * mockBoardSize + 1]),
      value: outputTensor(value, [batchSize, 3]),
      miscvalue: outputTensor(miscvalue, [batchSize, 10]),
      ownership: outputTensor(ownership, [batchSize, mockBoardSize * mockBoardSize]),
    };
  });

  return { MockTensor, sessionRun };
});

vi.mock("onnxruntime-web/all", () => ({
  Tensor: ortMock.MockTensor,
  env: { wasm: {}, webgpu: {} },
  InferenceSession: {
    create: vi.fn(async () => ({
      inputNames: ["bin_input", "global_input"],
      outputNames: ["policy", "value", "miscvalue", "ownership"],
      run: ortMock.sessionRun,
      release: vi.fn(async () => undefined),
    })),
  },
}));

describe("BrowserOnnxProvider Kaya engine integration", () => {
  it("runs an engine move through OnnxEngine MCTS and keeps candidate payload populated", async () => {
    ortMock.sessionRun.mockClear();
    const engine = new OnnxEngine({
      modelBuffer: new ArrayBuffer(1),
      executionProviders: ["wasm"],
      enableCache: false,
    });
    const queue = new AnalysisQueue(engine);
    const queuedRequests: AnalysisRequest[] = [];
    const postedPayloads: BrowserEngineMovePayload[] = [];
    const gameState = engineMoveGameState();
    const provider = new BrowserOnnxProvider({
      loadGameState: vi.fn(async () => gameState),
      submitQueueRequest: async (request) => {
        queuedRequests.push(request);
        return queue.submit(request).result;
      },
      submitQueueBatch: async (requests) => {
        queuedRequests.push(...requests);
        return Promise.all(queue.submitBatch(requests).map((handle) => handle.result));
      },
      postEngineMovePayload: vi.fn(async ({ payload }) => {
        postedPayloads.push(payload);
        return {
          survivalScore: 0,
          metrics: { unresolved_count: 0, min_black_probability: 0.5 },
          candidates: payload.candidates.map(
            (candidate: BrowserEngineMovePayload["candidates"][number]) => ({
              move: candidate.move,
              survival_score: 0,
              min_black_probability: 0.5,
            }),
          ),
          move: payload.candidates[0]?.move,
          resigned: false,
        };
      }),
    });

    const result = await provider.requestEngineMove(gameState.game_id);
    await engine.dispose();

    expect(queuedRequests[0]).toEqual(
      expect.objectContaining<Partial<AnalysisRequest>>({
        numVisits: 4,
        maxMctsBatch: 4,
        priority: "batch",
      }),
    );
    expect(ortMock.sessionRun).toHaveBeenCalled();
    const legalMoves = gameState.legal_moves ?? [];
    expect(postedPayloads[0]?.candidates).toHaveLength(legalMoves.length);
    expect(result.candidates).toHaveLength(legalMoves.length);
    expect(legalMoves.length).toBeGreaterThan(gameState.difficulty?.top_n ?? 0);
    expect(result.move).toBe(result.candidates[0]?.move);

    const maxVisits = gameState.difficulty?.max_visits ?? 1;
    const maxMctsBatch = Math.min(maxVisits, 8);
    const childInferenceRuns = ortMock.sessionRun.mock.calls.length;
    const maxRunsPerBatchedChildPhase = Math.ceil(maxVisits / maxMctsBatch) + 1;
    expect(childInferenceRuns).toBeLessThan(
      1 + legalMoves.length * maxRunsPerBatchedChildPhase,
    );
    expect(childInferenceRuns).toBeLessThan(1 + legalMoves.length);
  });
});

function engineMoveGameState(): GameState {
  return {
    game_id: "game-kaya-integration",
    preset_id: "balanced",
    board_size: boardSize,
    human_side: "W",
    engine_side: "B",
    next_to_move: "B",
    moves_played: 1,
    last_move: "D4",
    status: "active",
    winner: null,
    difficulty: {
      max_visits: 4,
      top_n: 3,
      randomness: 0,
      variant_awareness: 1,
      policy_anchor: 0,
      score_anchor: 0,
      temperature: 0,
      blunder_margin: 0,
      global_weight: 1,
      local_weight: 0,
    },
    stones: [{ move: "D4", color: "W" }],
    legal_moves: ["Q16", "D16", "K10", "C3", "R4"],
  };
}
