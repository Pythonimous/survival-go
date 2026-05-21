import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BrowserOnnxProvider,
  buildKayaEngineBootstrapSelection,
  countInferenceChunks,
  normalizeOnnxExecutionProviders,
  policyProbabilityForMove,
  ENGINE_EVAL_KOMI,
  ENGINE_MOVE_POLICY_CANDIDATE_COUNT,
  resolveEngineMoveSearchSettings,
  resolveOnnxNumThreads,
  topPolicyCandidateMoves,
} from "./BrowserOnnxProvider";

const SAMPLE_LEGAL_MOVES = ["Q16", "D16", "K10", "C3", "R4", "F3"];
import {
  resetAnalysisInstrumentationListeners,
  subscribeAnalysisInstrumentation,
} from "@/lib/analysis/instrumentation/bus";
import { gtpToVertex } from "@/lib/go/coordinates";
import type { BrowserEngineMovePayload } from "@/lib/analysis/onnx/inference/engineMovePayload";
import type { PositionInput } from "@/lib/analysis/types";
import type { AnalysisRequest } from "@/lib/analysis/onnx/kaya/queue";
import type { AutoPick } from "@/lib/analysis/onnx/kaya/auto-config";
import { ONNX_MODEL_ARTIFACT_URLS } from "@/lib/analysis/runtime/modelVariant";

describe("BrowserOnnxProvider", () => {
  afterEach(() => {
    resetAnalysisInstrumentationListeners();
  });

  it("returns undefined numThreads when env override is unset", () => {
    expect(resolveOnnxNumThreads()).toBeUndefined();
  });

  it("places wasm before webgpu so ORT can constant-fold and assign CPU fallbacks", () => {
    expect(normalizeOnnxExecutionProviders(["webgpu", "wasm"])).toEqual([
      "wasm",
      "webgpu",
    ]);
    expect(normalizeOnnxExecutionProviders(["wasm", "webgpu"])).toEqual([
      "wasm",
      "webgpu",
    ]);
  });

  it("leaves wasm-only and webgpu-only chains unchanged", () => {
    expect(normalizeOnnxExecutionProviders(["wasm"])).toEqual(["wasm"]);
    expect(normalizeOnnxExecutionProviders(["webgpu"])).toEqual(["webgpu"]);
  });

  it("maps Kaya auto-pick to model URL and execution providers", () => {
    const autoPick: AutoPick = {
      modelId: "kata1-b28-latest",
      quantization: "fp16",
      backendChain: ["webgpu", "wasm"],
      reasoning: "webgpu available",
    };

    const selection = buildKayaEngineBootstrapSelection({
      autoPick,
      userSelectedVariant: null,
    });

    expect(selection.modelVariant).toBe("fp16");
    expect(selection.modelUrl).toBe(ONNX_MODEL_ARTIFACT_URLS.fp16);
    expect(selection.executionProviders).toEqual(["wasm", "webgpu"]);
  });

  it("honors user-selected model variant over Kaya quantization", () => {
    const autoPick: AutoPick = {
      modelId: "kata1-b28-latest",
      quantization: "fp32",
      backendChain: ["webgpu", "wasm"],
      reasoning: "webgpu available",
    };

    const selection = buildKayaEngineBootstrapSelection({
      autoPick,
      userSelectedVariant: "fp32",
    });

    expect(selection.modelVariant).toBe("fp32");
    expect(selection.modelUrl).toBe(ONNX_MODEL_ARTIFACT_URLS.fp32);
    expect(selection.upgradedFrom).toBeNull();
  });

  it("honors explicit uint8 manual selection when WebGPU is available", () => {
    const autoPick: AutoPick = {
      modelId: "kata1-b28-latest",
      quantization: "fp16",
      backendChain: ["webgpu", "wasm"],
      reasoning: "webgpu available",
    };

    const selection = buildKayaEngineBootstrapSelection({
      autoPick,
      userSelectedVariant: "uint8",
    });

    expect(selection.modelVariant).toBe("uint8");
    expect(selection.modelUrl).toBe(ONNX_MODEL_ARTIFACT_URLS.uint8);
    expect(selection.executionProviders).toEqual(["wasm"]);
    expect(selection.upgradedFrom).toBeNull();
  });

  it("falls back to wasm when auto-pick has no web backend", () => {
    const autoPick: AutoPick = {
      modelId: "kata1-b28-latest",
      quantization: "fp32",
      backendChain: ["native-gpu", "native-cpu"],
      reasoning: "desktop native-only chain",
    };

    const selection = buildKayaEngineBootstrapSelection({
      autoPick,
      userSelectedVariant: null,
    });

    expect(selection.executionProviders).toEqual(["wasm"]);
  });

  it("analyzes via Kaya engine result and posts raw outputs", async () => {
    const submitQueueRequest = vi.fn(async (_request: AnalysisRequest) => ({
      moveSuggestions: [
        { move: "D4", probability: 0.6 },
        { move: "Q16", probability: 0.4 },
      ],
      winRate: 0.55,
      scoreLead: 1.8,
      currentTurn: "B" as const,
      ownership: Array.from({ length: 361 }, () => 0),
      visits: 1,
    }));
    const postRawOutputsForAnalysis = vi.fn(async () => ({
      survivalScore: 0,
      metrics: { unresolved_count: 0, min_black_probability: 1 },
      policy: [0.5, 0.5],
      pBlack: [0.5, 0.5],
      winrate: 0.55,
      scoreLead: 1.8,
    }));
    const provider = new BrowserOnnxProvider({
      submitQueueRequest,
      postRawOutputsForAnalysis,
    });

    const input: PositionInput = {
      gameId: "game-2",
      boardSize: 19,
      setupStones: [{ move: "D4", color: "B" }],
      moves: [],
      sideToMove: "W",
    };
    const result = await provider.analyzePosition(input);

    expect(result.metrics.unresolved_count).toBe(0);
    expect(submitQueueRequest).toHaveBeenCalledWith(
      expect.objectContaining<Partial<AnalysisRequest>>({
        priority: "live",
        nextToPlay: "W",
        numVisits: 1,
      }),
    );
    expect(postRawOutputsForAnalysis).toHaveBeenCalledWith({
      gameId: "game-2",
      raw: expect.objectContaining({
        policy: expect.any(Array),
        ownership: expect.any(Array),
        value: expect.any(Array),
        miscvalue: expect.any(Array),
      }),
    });
  });

  it("maps max_visits to root-only MCTS search settings", () => {
    const search = resolveEngineMoveSearchSettings({
      max_visits: 16,
      top_n: 8,
      randomness: 0.7,
      variant_awareness: 0.35,
      policy_anchor: 0.6,
      score_anchor: 0.1,
      temperature: 0.7,
      blunder_margin: 0.08,
      global_weight: 1,
      local_weight: 0,
    });

    expect(search.numVisits).toBe(16);
    expect(search.maxMctsBatch).toBe(8);
    expect(search).not.toHaveProperty("childNumVisits");
  });

  it("exposes a fixed top-12 policy candidate pool for backend rerank", () => {
    expect(ENGINE_MOVE_POLICY_CANDIDATE_COUNT).toBe(12);
  });

  it("shortlists legal moves by descending root MCTS visit probability", () => {
    const logits = Array.from({ length: 362 }, () => -20);
    const [qx, qy] = gtpToVertex("Q16", 19);
    const [dx, dy] = gtpToVertex("D16", 19);
    const [fx, fy] = gtpToVertex("F3", 19);
    const [rx, ry] = gtpToVertex("R4", 19);
    logits[qy * 19 + qx] = 0;
    logits[dy * 19 + dx] = -1;
    logits[fy * 19 + fx] = -20;
    logits[ry * 19 + rx] = -20;
    for (const move of ["K10", "C3"]) {
      const [x, y] = gtpToVertex(move, 19);
      logits[y * 19 + x] = -2;
    }

    const shortlist = topPolicyCandidateMoves(
      SAMPLE_LEGAL_MOVES,
      {
        moveSuggestions: [
          { move: "Q16", probability: 0.5 },
          { move: "D16", probability: 0.3 },
          { move: "K10", probability: 0.15 },
          { move: "C3", probability: 0.04 },
          { move: "R4", probability: 0.01 },
          { move: "F3", probability: 0.0 },
        ],
        winRate: 0.5,
        scoreLead: 0,
        currentTurn: "B",
        policyLogits: logits,
      },
      19,
      5,
    );

    expect(shortlist).toHaveLength(5);
    expect(shortlist).toContain("Q16");
    expect(shortlist).toContain("D16");
    expect(shortlist).not.toContain("F3");
  });

  it("derives policy probability from full root policy logits", () => {
    const logits = Array.from({ length: 362 }, () => -20);
    const [qx, qy] = gtpToVertex("Q16", 19);
    const [kx, ky] = gtpToVertex("K10", 19);
    logits[qy * 19 + qx] = 0;
    logits[ky * 19 + kx] = -5;

    const high = policyProbabilityForMove(logits, "Q16", 19);
    const low = policyProbabilityForMove(logits, "K10", 19);

    expect(high).toBeGreaterThan(low);
    expect(countInferenceChunks(SAMPLE_LEGAL_MOVES.length)).toBe(1);
  });

  it("builds engine-move payload from root tree without per-child searches", async () => {
    const loadGameState = vi.fn(async () => ({
      game_id: "game-wide-pool",
      preset_id: "balanced",
      board_size: 19,
      human_side: "W" as const,
      engine_side: "B" as const,
      next_to_move: "B" as const,
      moves_played: 1,
      last_move: "D4",
      status: "active" as const,
      winner: null,
      difficulty: {
        max_visits: 20,
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
      stones: [{ move: "D4", color: "W" as const }],
      legal_moves: SAMPLE_LEGAL_MOVES,
    }));
    const logits = Array.from({ length: 362 }, () => -20);
    const [fx, fy] = gtpToVertex("F3", 19);
    logits[fy * 19 + fx] = -10;
    for (const move of ["Q16", "D16", "K10", "C3", "R4"]) {
      const [x, y] = gtpToVertex(move, 19);
      logits[y * 19 + x] = 0;
    }
    const rootOwnership = Array.from({ length: 361 }, (_, index) => index / 361);
    const submitQueueRequest = vi.fn(async () => ({
      moveSuggestions: [
        { move: "Q16", probability: 0.6, ownership: rootOwnership },
        { move: "D16", probability: 0.3, ownership: rootOwnership },
        { move: "K10", probability: 0.1, ownership: rootOwnership },
      ],
      policyLogits: logits,
      winRate: 0.55,
      scoreLead: 1.8,
      currentTurn: "B" as const,
      ownership: rootOwnership,
      visits: 4,
    }));
    const postPayload = vi.fn(async () => ({
      survivalScore: 0,
      metrics: { unresolved_count: 0, min_black_probability: 1 },
      candidates: [],
      resigned: false,
      move: "Q16",
    }));
    const provider = new BrowserOnnxProvider({
      loadGameState,
      submitQueueRequest,
      postEngineMovePayload: postPayload,
    });

    await provider.requestEngineMove("game-wide-pool");

    expect(submitQueueRequest).toHaveBeenCalledTimes(1);
    expect(submitQueueRequest).toHaveBeenCalledWith(
      expect.objectContaining<Partial<AnalysisRequest>>({
        komi: ENGINE_EVAL_KOMI,
        numVisits: 20,
      }),
    );
    const postedCalls = postPayload.mock.calls as unknown as Array<
      [{ gameId: string; payload: BrowserEngineMovePayload }]
    >;
    const postedMoves = postedCalls[0][0].payload.candidates.map((candidate) => candidate.move);
    expect(postedMoves.length).toBeLessThanOrEqual(ENGINE_MOVE_POLICY_CANDIDATE_COUNT);
    expect(postedMoves[0]).toBe("Q16");
  });

  it("emits engine-move phase instrumentation with batch shape", async () => {
    const phaseEvents: Array<{
      childBatchSize: number;
      legalMoveCount: number;
      policyShortlistCount: number;
      topN: number;
    }> = [];
    subscribeAnalysisInstrumentation((event) => {
      if (event.type === "engine_move_phase") {
        phaseEvents.push({
          childBatchSize: event.childBatchSize,
          legalMoveCount: event.legalMoveCount,
          policyShortlistCount: event.policyShortlistCount,
          topN: event.topN,
        });
      }
    });

    const loadGameState = vi.fn(async () => ({
      game_id: "game-phase",
      preset_id: "balanced",
      board_size: 19,
      human_side: "W" as const,
      engine_side: "B" as const,
      next_to_move: "B" as const,
      moves_played: 0,
      last_move: null,
      status: "active" as const,
      winner: null,
      difficulty: {
        max_visits: 4,
        top_n: 2,
        randomness: 0,
        variant_awareness: 1,
        policy_anchor: 0,
        score_anchor: 0,
        temperature: 0,
        blunder_margin: 0,
        global_weight: 1,
        local_weight: 0,
      },
      stones: [],
      legal_moves: ["Q16", "D16", "K10"],
    }));
    const provider = new BrowserOnnxProvider({
      loadGameState,
      submitQueueRequest: vi.fn(async () => ({
        moveSuggestions: [{ move: "Q16", probability: 0.6 }],
        policyLogits: Array.from({ length: 362 }, () => -5),
        winRate: 0.55,
        scoreLead: 0,
        currentTurn: "B" as const,
        ownership: Array.from({ length: 361 }, () => 0),
        visits: 4,
      })),
      postEngineMovePayload: vi.fn(async () => ({
        survivalScore: 0,
        metrics: { unresolved_count: 0, min_black_probability: 1 },
        candidates: [],
        resigned: false,
        move: "Q16",
      })),
    });

    await provider.requestEngineMove("game-phase");

    expect(phaseEvents).toEqual([
      {
        childBatchSize: 0,
        legalMoveCount: 3,
        policyShortlistCount: 3,
        topN: 2,
      },
    ]);
  });

  it("builds engine-move payload with game difficulty search settings", async () => {
    const loadGameState = vi.fn(async () => ({
      game_id: "game-1",
      preset_id: "balanced",
      board_size: 19,
      human_side: "W" as const,
      engine_side: "B" as const,
      next_to_move: "B" as const,
      moves_played: 1,
      last_move: "D4",
      status: "active" as const,
      winner: null,
      difficulty: {
        max_visits: 20,
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
      stones: [{ move: "D4", color: "W" as const }],
      legal_moves: ["Q16", "D16", "K10"],
    }));
    const rootAnalysis = {
      moveSuggestions: [
        { move: "Q16", probability: 0.6, ownership: Array.from({ length: 361 }, () => 0.1) },
        { move: "D16", probability: 0.3, ownership: Array.from({ length: 361 }, () => -0.1) },
        { move: "K10", probability: 0.1, ownership: Array.from({ length: 361 }, () => 0) },
      ],
      policyLogits: Array.from({ length: 362 }, () => -4),
      winRate: 0.55,
      scoreLead: 1.8,
      currentTurn: "B" as const,
      ownership: Array.from({ length: 361 }, () => 0),
      visits: 20,
    };
    const submitQueueRequest = vi.fn(async () => rootAnalysis);
    const postPayload = vi.fn(async () => ({
      survivalScore: 0,
      metrics: { unresolved_count: 0, min_black_probability: 1 },
      candidates: [],
      resigned: false,
      move: "Q16",
    }));
    const provider = new BrowserOnnxProvider({
      loadGameState,
      submitQueueRequest,
      postEngineMovePayload: postPayload,
    });

    const result = await provider.requestEngineMove("game-1");

    expect(result.move).toBe("Q16");
    expect(loadGameState).toHaveBeenCalledWith("game-1");
    expect(submitQueueRequest).toHaveBeenCalledWith(
      expect.objectContaining<Partial<AnalysisRequest>>({
        priority: "batch",
        nextToPlay: "B",
        numVisits: 20,
        maxMctsBatch: 8,
        komi: ENGINE_EVAL_KOMI,
      }),
    );
    expect(postPayload).toHaveBeenCalledWith({
      gameId: "game-1",
      payload: expect.objectContaining({
        positionRaw: expect.any(Object),
        candidates: expect.any(Array),
      }),
    });
  });
});
