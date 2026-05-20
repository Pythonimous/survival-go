import { apiUrl } from "@/lib/api/client";
import { readApiFailure } from "@/lib/api/errors";
import { positionInputFromGameState } from "@/lib/analysis/positionInput";
import type { DifficultyConfig, GameState } from "@/types/api";
import {
  emitAnalysisInstrumentation,
  instrumentedAnalysisCall,
} from "@/lib/analysis/instrumentation/bus";
import { emptySignMap, gtpToVertex } from "@/lib/go/coordinates";
import type {
  AnalysisProvider,
  AnalysisResult,
  CandidateMoveInfo,
  EngineMoveResult,
  PositionInput,
} from "@/lib/analysis/types";
import {
  postBrowserEngineMovePayload,
  postRawOnnxOutputsForAnalysis,
} from "@/lib/analysis/onnx/inference/transport";
import type { BrowserEngineMovePayload } from "@/lib/analysis/onnx/inference/engineMovePayload";
import { assembleBrowserEngineMovePayload } from "@/lib/analysis/onnx/inference/engineMovePayload";
import type { OnnxRawInferenceOutput } from "@/lib/analysis/onnx/inference/rawOutputs";
import {
  ONNX_MODEL_ARTIFACT_URLS,
  type OnnxModelVariant,
  getUserSelectedOnnxModelVariant,
} from "@/lib/analysis/runtime/modelVariant";
import { OnnxEngine } from "@/lib/analysis/onnx/kaya/onnx-engine";
import { pickConfig, probeEnvironment, type AutoPick } from "@/lib/analysis/onnx/kaya/auto-config";
import type {
  AnalysisResult as KayaAnalysisResult,
  MoveSuggestion,
} from "@/lib/analysis/onnx/kaya/types";
import type { SignMap } from "@/lib/analysis/onnx/kaya/goboard";
import { AnalysisQueue, type AnalysisRequest } from "@/lib/analysis/onnx/kaya/queue";
import {
  preloadThreadedOrtWasmPaths,
  revokePreloadedOrtWasmPaths,
  willUseMultiThreadedOrtWasm,
} from "@/lib/analysis/runtime/ortWasmAssets";

const DEFAULT_POLICY_LOGIT = -20;
const MIN_POLICY_PROBABILITY = 1e-6;
const DEFAULT_ENGINE_MOVE_TOP_N = 8;
const DEFAULT_ENGINE_MOVE_VISITS = 1;
const DEFAULT_MAX_MCTS_BATCH = 8;
/** Chinese-rules Survival eval komi passed to KataGo featurization (selfKomi encoding). */
export const ENGINE_EVAL_KOMI = 345.5;
/** How many highest-probability legal moves the browser sends for backend Survival rerank. */
export const ENGINE_MOVE_POLICY_CANDIDATE_COUNT = 12;

type BrowserOnnxProviderOptions = {
  loadGameState?: (gameId: string) => Promise<GameState>;
  submitQueueRequest?: (request: AnalysisRequest) => Promise<KayaAnalysisResult>;
  submitQueueBatch?: (requests: AnalysisRequest[]) => Promise<KayaAnalysisResult[]>;
  postRawOutputsForAnalysis?: (options: {
    gameId: string;
    raw: OnnxRawInferenceOutput;
  }) => Promise<AnalysisResult>;
  postEngineMovePayload?: (options: {
    gameId: string;
    payload: BrowserEngineMovePayload;
  }) => Promise<EngineMoveResult>;
};

async function loadGameStateByApi(gameId: string): Promise<GameState> {
  const response = await fetch(apiUrl(`/api/games/${gameId}`));
  if (!response.ok) {
    await readApiFailure(response, "Could not load game state.");
  }
  return (await response.json()) as GameState;
}

let sharedEnginePromise: Promise<OnnxEngine> | null = null;
let sharedQueuePromise: Promise<AnalysisQueue> | null = null;
let primedModelBuffer: ArrayBuffer | undefined;

export function primeSharedOnnxEngineModelBuffer(buffer: ArrayBuffer): void {
  primedModelBuffer = buffer;
}

function toOnnxExecutionProviders(backendChain: readonly string[]): string[] {
  const providers = backendChain.filter((backend): backend is "webgpu" | "wasm" =>
    backend === "webgpu" || backend === "wasm",
  );
  return providers.length === 0 ? ["wasm"] : providers;
}

function readViteEnv(key: string): string | undefined {
  const env = (import.meta as { env?: Record<string, string | boolean | undefined> }).env;
  const value = env?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Optional override via `VITE_ONNX_NUM_THREADS`; otherwise Kaya picks from COI. */
export function resolveOnnxNumThreads(): number | undefined {
  const raw = readViteEnv("VITE_ONNX_NUM_THREADS");
  if (raw === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed >= 1) {
    return parsed;
  }
  return undefined;
}

/**
 * uint8 on WebGPU is far slower than fp16/fp32 in practice (debug: ~41s per batch-8
 * `session.run`). When WebGPU is in the backend chain, use Kaya auto-pick quantization.
 */
export function resolveBootstrapModelVariant(
  autoPick: AutoPick,
  userSelectedVariant: OnnxModelVariant | null,
): { modelVariant: OnnxModelVariant; upgradedFrom: OnnxModelVariant | null } {
  const requested = userSelectedVariant ?? autoPick.quantization;
  const usesWebGpu = autoPick.backendChain.includes("webgpu");
  if (usesWebGpu && requested === "uint8") {
    return { modelVariant: autoPick.quantization, upgradedFrom: "uint8" };
  }
  return { modelVariant: requested, upgradedFrom: null };
}

export function buildKayaEngineBootstrapSelection(options: {
  autoPick: AutoPick;
  userSelectedVariant: OnnxModelVariant | null;
}): {
  modelVariant: OnnxModelVariant;
  modelUrl: string;
  executionProviders: string[];
  upgradedFrom: OnnxModelVariant | null;
} {
  const { modelVariant, upgradedFrom } = resolveBootstrapModelVariant(
    options.autoPick,
    options.userSelectedVariant,
  );
  return {
    modelVariant,
    modelUrl: ONNX_MODEL_ARTIFACT_URLS[modelVariant],
    executionProviders: toOnnxExecutionProviders(options.autoPick.backendChain),
    upgradedFrom,
  };
}

export async function getSharedOnnxEngine(): Promise<OnnxEngine> {
  if (!sharedEnginePromise) {
    sharedEnginePromise = (async () => {
      const probe = await probeEnvironment();
      const autoPick = pickConfig(probe);
      const selection = buildKayaEngineBootstrapSelection({
        autoPick,
        userSelectedVariant: getUserSelectedOnnxModelVariant(),
      });
      const numThreads = resolveOnnxNumThreads();
      const crossOriginIsolated =
        typeof self !== "undefined" && self.crossOriginIsolated;
      const modelBuffer = primedModelBuffer;
      primedModelBuffer = undefined;

      const wasmPaths = willUseMultiThreadedOrtWasm(numThreads, crossOriginIsolated)
        ? await preloadThreadedOrtWasmPaths()
        : undefined;

      // KataGo ONNX cannot use graph capture (not all nodes on JsExecutionProvider).
      const providerChains: string[][] = selection.executionProviders.includes("webgpu")
        ? [["webgpu"], selection.executionProviders]
        : [selection.executionProviders];
      let engine: OnnxEngine | null = null;
      for (const executionProviders of providerChains) {
        try {
          const candidate = new OnnxEngine({
            modelBuffer,
            modelUrl: modelBuffer ? undefined : selection.modelUrl,
            executionProviders,
            numThreads,
            wasmPaths,
          });
          await candidate.initialize();
          engine = candidate;
          break;
        } catch (error) {
          if (executionProviders === providerChains[providerChains.length - 1]) {
            throw error;
          }
        }
      }
      if (!engine) {
        throw new Error("Failed to initialize OnnxEngine.");
      }
      if (selection.upgradedFrom) {
        console.warn(
          `[OnnxEngine] ${selection.upgradedFrom} model is not viable on WebGPU; using ${selection.modelVariant} instead.`,
        );
      }
      return engine;
    })().catch((error) => {
      sharedEnginePromise = null;
      primedModelBuffer = undefined;
      revokePreloadedOrtWasmPaths();
      throw error;
    });
  }
  return sharedEnginePromise;
}

async function getSharedAnalysisQueue(): Promise<AnalysisQueue> {
  if (!sharedQueuePromise) {
    sharedQueuePromise = (async () => {
      const engine = await getSharedOnnxEngine();
      return new AnalysisQueue(engine);
    })().catch((error) => {
      sharedQueuePromise = null;
      throw error;
    });
  }
  return sharedQueuePromise;
}

/**
 * Tear down the shared Kaya engine + analysis queue so the next
 * `analyzePosition` / `requestEngineMove` call (or an explicit warmup) builds
 * a new engine for the currently selected model variant. Used by the runtime
 * model loader when the user picks a different ONNX variant.
 */
export function resetSharedOnnxEngine(): void {
  const enginePromise = sharedEnginePromise;
  sharedEnginePromise = null;
  sharedQueuePromise = null;
  primedModelBuffer = undefined;
  revokePreloadedOrtWasmPaths();
  if (enginePromise) {
    void enginePromise
      .then((engine) => engine.dispose().catch(() => undefined))
      .catch(() => undefined);
  }
}

function isPassMove(move: string): boolean {
  return move.trim().toUpperCase() === "PASS";
}

function toSign(color: "B" | "W"): 1 | -1 {
  return color === "B" ? 1 : -1;
}

function policyIndexForMove(move: string, boardSize: number): number | null {
  if (isPassMove(move)) {
    return boardSize * boardSize;
  }
  try {
    const [x, y] = gtpToVertex(move, boardSize);
    return y * boardSize + x;
  } catch {
    return null;
  }
}

function logitsFromMoveSuggestions(
  moveSuggestions: KayaAnalysisResult["moveSuggestions"],
  boardSize: number,
): number[] {
  const totalMoves = boardSize * boardSize + 1;
  const logits = new Array<number>(totalMoves).fill(DEFAULT_POLICY_LOGIT);
  for (const suggestion of moveSuggestions) {
    const policyIndex = policyIndexForMove(suggestion.move, boardSize);
    if (policyIndex === null || policyIndex < 0 || policyIndex >= totalMoves) {
      continue;
    }
    const probability = Math.max(MIN_POLICY_PROBABILITY, suggestion.probability);
    logits[policyIndex] = Math.log(probability);
  }
  return logits;
}

function policyLogitsFromAnalysis(
  analysis: KayaAnalysisResult,
  boardSize: number,
): number[] {
  if (analysis.policyLogits && analysis.policyLogits.length === boardSize * boardSize + 1) {
    return Array.from(analysis.policyLogits);
  }
  return logitsFromMoveSuggestions(analysis.moveSuggestions, boardSize);
}

export function policyProbabilityForMove(
  policyLogits: readonly number[],
  move: string,
  boardSize: number,
): number {
  const policyIndex = policyIndexForMove(move, boardSize);
  if (policyIndex === null || policyIndex < 0 || policyIndex >= policyLogits.length) {
    return MIN_POLICY_PROBABILITY;
  }
  let maxLogit = -Infinity;
  for (const logit of policyLogits) {
    if (logit > maxLogit) {
      maxLogit = logit;
    }
  }
  let sum = 0;
  const weights = policyLogits.map((logit) => {
    const weight = Math.exp(logit - maxLogit);
    sum += weight;
    return weight;
  });
  if (sum <= 0) {
    return MIN_POLICY_PROBABILITY;
  }
  return Math.max(MIN_POLICY_PROBABILITY, weights[policyIndex] / sum);
}

function legalMovesForEngineTurn(gameState: GameState): string[] {
  const legalMoves = gameState.legal_moves?.filter((move) => !isPassMove(move)) ?? [];
  if (legalMoves.length === 0) {
    throw new Error("Game state is missing legal_moves for the engine turn.");
  }
  return legalMoves;
}

function valueHeadFromWinRate(winRate: number | undefined): number[] | undefined {
  if (winRate === undefined || !Number.isFinite(winRate)) {
    return undefined;
  }
  const blackWin = Math.max(MIN_POLICY_PROBABILITY, Math.min(1 - MIN_POLICY_PROBABILITY, winRate));
  const whiteWin = 1 - blackWin;
  return [Math.log(blackWin), Math.log(whiteWin), Math.log(MIN_POLICY_PROBABILITY)];
}

function miscvalueHeadFromScoreLead(scoreLead: number | undefined): number[] | undefined {
  if (scoreLead === undefined || !Number.isFinite(scoreLead)) {
    return undefined;
  }
  const miscvalue = new Array<number>(10).fill(0);
  miscvalue[2] = scoreLead / 20;
  return miscvalue;
}

function rawOutputFromMoveSuggestion(
  suggestion: MoveSuggestion,
  rootAnalysis: KayaAnalysisResult,
  boardSize: number,
): OnnxRawInferenceOutput {
  const points = boardSize * boardSize;
  return {
    policy: policyLogitsFromAnalysis(rootAnalysis, boardSize),
    ownership: Array.from({ length: points }, () => 0),
    value: valueHeadFromWinRate(suggestion.winRate ?? rootAnalysis.winRate),
    miscvalue: miscvalueHeadFromScoreLead(suggestion.scoreLead ?? rootAnalysis.scoreLead),
  };
}

function rawOutputFromKayaAnalysis(
  analysis: KayaAnalysisResult,
  boardSize: number,
): OnnxRawInferenceOutput {
  const points = boardSize * boardSize;
  const ownership =
    analysis.ownership && analysis.ownership.length === points
      ? Array.from(analysis.ownership)
      : Array.from({ length: points }, () => 0);
  return {
    policy: policyLogitsFromAnalysis(analysis, boardSize),
    ownership,
    value: valueHeadFromWinRate(analysis.winRate),
    miscvalue: miscvalueHeadFromScoreLead(analysis.scoreLead),
  };
}

function signMapFromPositionInput(input: PositionInput): SignMap {
  const signMap = emptySignMap(input.boardSize);
  const setStone = (move: string, color: "B" | "W"): void => {
    if (isPassMove(move)) {
      return;
    }
    const [x, y] = gtpToVertex(move, input.boardSize);
    signMap[y][x] = toSign(color);
  };

  for (const stone of input.setupStones) {
    setStone(stone.move, stone.color);
  }
  for (const move of input.moves) {
    setStone(move.move, move.color);
  }

  return signMap;
}

function historyFromPositionInput(input: PositionInput): Array<{ color: 1 | -1; x: number; y: number }> {
  return input.moves.map((move) => {
    if (isPassMove(move.move)) {
      return { color: toSign(move.color), x: -1, y: -1 };
    }
    const [x, y] = gtpToVertex(move.move, input.boardSize);
    return { color: toSign(move.color), x, y };
  });
}

function buildQueueRequest(
  input: PositionInput,
  options: {
    numVisits: number;
    priority: AnalysisRequest["priority"];
    maxMctsBatch?: number;
    includeMove?: string;
    komi?: number;
  },
): AnalysisRequest {
  return {
    signMap: signMapFromPositionInput(input),
    nextToPlay: input.sideToMove,
    komi: options.komi ?? 7.5,
    history: historyFromPositionInput(input),
    numVisits: options.numVisits,
    priority: options.priority,
    maxMctsBatch: options.maxMctsBatch,
    includeMove: options.includeMove,
  };
}

function positiveIntegerOr(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}

export type EngineMoveSearchSettings = {
  topN: number;
  numVisits: number;
  maxMctsBatch: number;
};

export function countInferenceChunks(batchSize: number, chunkLimit: number = DEFAULT_MAX_MCTS_BATCH): number {
  if (batchSize <= 0) {
    return 0;
  }
  const limit = Math.max(1, Math.floor(chunkLimit));
  return Math.ceil(batchSize / limit);
}

/**
 * Top legal moves by root MCTS visit probability (fallback: policy prior), for backend rerank.
 * Ownership for each candidate comes from root-tree depth-1 evals when available.
 */
export function topPolicyCandidateMoves(
  legalMoves: readonly string[],
  rootAnalysis: KayaAnalysisResult,
  boardSize: number,
  limit: number = ENGINE_MOVE_POLICY_CANDIDATE_COUNT,
): string[] {
  const playable = legalMoves.filter((move) => !isPassMove(move));
  if (playable.length <= limit) {
    return [...playable];
  }
  const probByMove = new Map<string, number>();
  for (const suggestion of rootAnalysis.moveSuggestions) {
    if (!isPassMove(suggestion.move)) {
      probByMove.set(suggestion.move, suggestion.probability);
    }
  }
  const policyLogits = policyLogitsFromAnalysis(rootAnalysis, boardSize);
  return [...playable]
    .map((move) => ({
      move,
      policyProb:
        probByMove.get(move) ?? policyProbabilityForMove(policyLogits, move, boardSize),
    }))
    .sort((left, right) => right.policyProb - left.policyProb)
    .slice(0, limit)
    .map((entry) => entry.move);
}

export function resolveEngineMoveSearchSettings(
  difficulty: DifficultyConfig | undefined,
): EngineMoveSearchSettings {
  const topN = positiveIntegerOr(difficulty?.top_n, DEFAULT_ENGINE_MOVE_TOP_N);
  const numVisits = positiveIntegerOr(difficulty?.max_visits, DEFAULT_ENGINE_MOVE_VISITS);
  const maxMctsBatch = Math.min(numVisits, DEFAULT_MAX_MCTS_BATCH);
  return {
    topN,
    numVisits,
    maxMctsBatch,
  };
}

export function suggestionsByMove(
  analysis: KayaAnalysisResult,
): Map<string, MoveSuggestion> {
  const byMove = new Map<string, MoveSuggestion>();
  for (const suggestion of analysis.moveSuggestions) {
    byMove.set(suggestion.move, suggestion);
  }
  return byMove;
}

async function submitWithSharedQueue(request: AnalysisRequest): Promise<KayaAnalysisResult> {
  const queue = await getSharedAnalysisQueue();
  const { result } = queue.submit(request);
  return result;
}

export async function submitBatchWithSharedQueue(
  requests: AnalysisRequest[],
): Promise<KayaAnalysisResult[]> {
  const queue = await getSharedAnalysisQueue();
  const handles = queue.submitBatch(requests);
  return Promise.all(handles.map((handle) => handle.result));
}

export class BrowserOnnxProvider implements AnalysisProvider {
  readonly id = "browser-onnx";
  private readonly loadGameStateImpl: (gameId: string) => Promise<GameState>;
  private readonly submitQueueRequestImpl: (request: AnalysisRequest) => Promise<KayaAnalysisResult>;
  private readonly postRawOutputsForAnalysisImpl: (options: {
    gameId: string;
    raw: OnnxRawInferenceOutput;
  }) => Promise<AnalysisResult>;
  private readonly postEngineMovePayloadImpl: (options: {
    gameId: string;
    payload: BrowserEngineMovePayload;
  }) => Promise<EngineMoveResult>;
  constructor(options: BrowserOnnxProviderOptions = {}) {
    this.loadGameStateImpl = options.loadGameState ?? loadGameStateByApi;
    this.submitQueueRequestImpl = options.submitQueueRequest ?? submitWithSharedQueue;
    this.postRawOutputsForAnalysisImpl = options.postRawOutputsForAnalysis ?? postRawOnnxOutputsForAnalysis;
    this.postEngineMovePayloadImpl = options.postEngineMovePayload ?? postBrowserEngineMovePayload;
  }

  analyzePosition(input: PositionInput): Promise<AnalysisResult> {
    return instrumentedAnalysisCall({
      providerId: this.id,
      operation: "analyzePosition",
      run: async () => {
        const analysis = await this.submitQueueRequestImpl(
          buildQueueRequest(input, { numVisits: 1, priority: "live" }),
        );
        const raw = rawOutputFromKayaAnalysis(analysis, input.boardSize);
        return this.postRawOutputsForAnalysisImpl({
          gameId: input.gameId,
          raw,
        });
      },
    });
  }

  getCandidateMoves(_input: PositionInput): Promise<readonly CandidateMoveInfo[]> {
    return instrumentedAnalysisCall({
      providerId: this.id,
      operation: "getCandidateMoves",
      run: async () => {
        throw new Error("getCandidateMoves is not supported on the browser ONNX provider.");
      },
    });
  }

  requestEngineMove(gameId: string): Promise<EngineMoveResult> {
    return instrumentedAnalysisCall({
      providerId: this.id,
      operation: "requestEngineMove",
      run: async () => {
        const gameState = await this.loadGameStateImpl(gameId);
        const input = positionInputFromGameState(gameState);
        const search = resolveEngineMoveSearchSettings(gameState.difficulty);
        const rootStartedAt = performance.now();
        const rootAnalysis = await this.submitQueueRequestImpl(
          buildQueueRequest(input, {
            numVisits: search.numVisits,
            priority: "batch",
            maxMctsBatch: search.maxMctsBatch,
            komi: ENGINE_EVAL_KOMI,
          }),
        );
        const rootPhaseMs = performance.now() - rootStartedAt;
        const rootRaw = rawOutputFromKayaAnalysis(rootAnalysis, input.boardSize);
        const legalMoves = legalMovesForEngineTurn(gameState);
        const candidateMoves = topPolicyCandidateMoves(
          legalMoves,
          rootAnalysis,
          input.boardSize,
        );
        const moveSuggestions = suggestionsByMove(rootAnalysis);

        const payload = assembleBrowserEngineMovePayload({
          positionRaw: rootRaw,
          candidates: candidateMoves.map((move) => {
            const suggestion = moveSuggestions.get(move);
            const policyProb =
              suggestion?.probability ??
              policyProbabilityForMove(
                policyLogitsFromAnalysis(rootAnalysis, input.boardSize),
                move,
                input.boardSize,
              );
            return {
              extract: { move, policyProb },
              raw: suggestion
                ? rawOutputFromMoveSuggestion(suggestion, rootAnalysis, input.boardSize)
                : rawOutputFromKayaAnalysis(rootAnalysis, input.boardSize),
            };
          }),
        });
        const backendStartedAt = performance.now();
        const result = await this.postEngineMovePayloadImpl({ gameId, payload });
        const backendRoundtripMs = performance.now() - backendStartedAt;

        emitAnalysisInstrumentation({
          type: "engine_move_phase",
          providerId: this.id,
          rootPhaseMs,
          childPhaseMs: 0,
          childBatchSize: 0,
          childBatchChunks: 0,
          childExecutionMode: "sequential",
          childInferenceCallCount: 0,
          backendRoundtripMs,
          legalMoveCount: legalMoves.length,
          policyShortlistCount: candidateMoves.length,
          topN: search.topN,
        });

        return result;
      },
    });
  }
}
