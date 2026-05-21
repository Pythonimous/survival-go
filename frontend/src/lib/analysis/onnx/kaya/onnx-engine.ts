// SPDX-License-Identifier: AGPL-3.0-or-later
// Ported from kaya-go/kaya (AGPL-3.0), packages/ai-engine/src/onnx-engine.ts
// Upstream commit: 8fafeac0fedde020c447d931c0b1afdf283edf2a

/** ONNX Runtime Web engine for KataGo analysis. */
import * as ort from 'onnxruntime-web/all';
import { GoBoard, type Sign, type SignMap } from './goboard';
import {
  Engine,
  type EngineAnalysisOptions,
  type EngineCapabilities,
  type EngineRuntimeInfo,
} from './base-engine';
import type { AnalysisResult } from './types';
import type { OnnxEngineConfig } from './onnx-types';
import {
  float32ToFloat16,
  createTensor,
  validateTensorData,
  debugLog,
  processBatchResults,
} from './onnx-utils';
import { filterKoMoves, runBatchedMCTS, runMCTS, type MCTSSearchSpec } from './onnx-mcts';

/** Max trees advanced together in one `runBatchedMCTS` (limits leaf fan-out per iteration). */
export const CROSS_TREE_MCTS_CHUNK = 4;

export function crossTreeMctsChunkCount(pendingTreeCount: number): number {
  if (pendingTreeCount <= 0) return 0;
  return Math.ceil(pendingTreeCount / CROSS_TREE_MCTS_CHUNK);
}
import { featurizeToBuffer } from './onnx-featurization';
import type { MCTSBatchEvaluator, MCTSProgress } from './onnx-types';
import { createOnnxSession } from './onnx-session';
import {
  type GpuBufferState,
  createEmptyGpuState,
  allocateGpuBuffers,
  releaseGpuBuffers,
  uploadToGpuBuffers,
  recreateSessionForBoardSize,
} from './onnx-gpu';

export { type OnnxEngineConfig } from './onnx-types';

export class OnnxEngine extends Engine {
  private session: ort.InferenceSession | null = null;
  private debugEnabled = false;
  private usedProviders: string[] = [];
  private inputDataType: 'float32' | 'float16' = 'float32';
  private graphCaptureEnabled: boolean = false;
  private useGpuInputs: boolean = false;
  private maxInferenceBatch: number = Infinity;
  private storedSessionOptions: ort.InferenceSession.SessionOptions | null = null;
  private modelSource: { buffer?: ArrayBuffer; url?: string } | null = null;
  private gpu: GpuBufferState = createEmptyGpuState();
  private lastInferenceRunCount = 0;

  /** WebGPU device reference for error scope checking (null if not using WebGPU). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private gpuDevice: any = null;

  constructor(config: OnnxEngineConfig = {}) {
    super(config);
    this.debugEnabled = Boolean(config.debug);
  }

  private debugLog(message: string, payload?: Record<string, unknown>): void {
    debugLog(this.debugEnabled, message, payload);
  }

  resetInferenceRunCount(): void {
    this.lastInferenceRunCount = 0;
  }

  getInferenceRunCount(): number {
    return this.lastInferenceRunCount;
  }

  /** Pop the GPU error scope and throw if a validation error was detected. */
  private async checkGpuErrorScope(): Promise<void> {
    if (!this.gpuDevice) return;
    const error = await this.gpuDevice.popErrorScope();
    if (error) {
      throw new Error(`WebGPU validation error: ${error.message}`);
    }
  }

  private async ensureGpuBuffers(size: number): Promise<void> {
    if (!this.storedSessionOptions || !this.modelSource) return;
    const result = await recreateSessionForBoardSize(
      this.gpu,
      size,
      this.inputDataType,
      this.maxInferenceBatch,
      this.storedSessionOptions,
      this.modelSource,
      this.session
    );
    if (result) {
      this.session = result.session;
      this.graphCaptureEnabled = result.graphCaptureEnabled;
      this.useGpuInputs = result.useGpuInputs;
    }
  }

  /** Whether any GPU-based execution provider is currently active. */
  isUsingGpuProvider(): boolean {
    return this.usedProviders.some(p => ['webgpu', 'webnn'].includes(p));
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const config = this.config as OnnxEngineConfig;

    try {
      const result = await createOnnxSession(config, this.debugLog.bind(this));
      this.session = result.session;
      this.usedProviders = result.usedProviders;
      this.inputDataType = result.inputDataType;
      this.graphCaptureEnabled = result.graphCaptureEnabled;
      this.useGpuInputs = result.useGpuInputs;
      this.maxInferenceBatch = result.maxInferenceBatch;
      this.modelSource = result.modelSource;
      this.storedSessionOptions = result.sessionOptions;
      this.initialized = true;

      // Capture WebGPU device for error scope checking during inference
      if (this.usedProviders.includes('webgpu')) {
        this.gpuDevice = (ort.env as any).webgpu?.device ?? null;
      }

      if (this.graphCaptureEnabled) {
        try {
          await allocateGpuBuffers(this.gpu, 19, this.maxInferenceBatch, this.inputDataType);
        } catch (e) {
          console.warn('[OnnxEngine] GPU buffer allocation failed, disabling graph capture:', e);
          this.graphCaptureEnabled = false;
          this.useGpuInputs = false;
        }
      }
    } catch (e) {
      console.error('[OnnxEngine] Failed to initialize:', e);
      throw e;
    }
  }

  getCapabilities(): EngineCapabilities {
    return {
      name: 'KataGo (ONNX)',
      version: '1.0.0',
      supportedBoardSizes: [],
      supportsParallel: false,
      providesPV: false,
      providesWinRate: false,
      providesScoreLead: true,
    };
  }

  getRuntimeInfo(): EngineRuntimeInfo {
    let backend = 'wasm';
    if (this.usedProviders.includes('webgpu')) {
      backend = this.graphCaptureEnabled ? 'webgpu-gc' : 'webgpu';
    } else if (this.usedProviders.includes('webnn')) {
      backend = 'webnn';
    } else if (this.usedProviders.length > 0) {
      backend = this.usedProviders[0];
    }

    return {
      backend,
      inputDataType: this.inputDataType,
    };
  }

  protected async analyzePosition(
    signMap: SignMap,
    options: EngineAnalysisOptions
  ): Promise<AnalysisResult> {
    if (!this.session) throw new Error('Engine not initialized');

    const board = new GoBoard(signMap);
    const size = board.width;

    let nextPla: Sign = 1;
    if (options.nextToPlay) {
      nextPla = options.nextToPlay === 'W' ? -1 : 1;
    } else {
      let blackStones = 0,
        whiteStones = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const s = board.get([x, y]);
          if (s === 1) blackStones++;
          else if (s === -1) whiteStones++;
        }
      }
      nextPla = blackStones === whiteStones ? 1 : -1;
    }

    const komi = options.komi ?? 7.5;
    const history = options.history || [];
    const numVisits: number = (options as any).numVisits ?? 1;

    const koInfo = (options as any).koInfo as { sign: Sign; vertex: [number, number] } | undefined;
    if (koInfo && (koInfo.sign as number) !== 0) {
      board._koInfo = { sign: koInfo.sign, vertex: koInfo.vertex };
    }

    const evaluator: MCTSBatchEvaluator = async leaves =>
      this.runFeaturizedBatchInference(leaves, size);

    const onProgress = (options as any).onProgress as ((p: MCTSProgress) => void) | undefined;
    const signal = (options as any).signal as AbortSignal | undefined;
    const includeMove = options.includeMove;

    // Cap MCTS batch size. Smaller batches = more frequent abort checks +
    // more frequent progress emission, at the cost of slightly higher
    // per-inference overhead. 8 strikes a balance for interactive use:
    // abort latency is ~halved vs 16 with only marginal throughput loss.
    const requestedMaxMctsBatch = (options as any).maxMctsBatch;
    const interactiveBatchLimit =
      typeof requestedMaxMctsBatch === 'number' && Number.isFinite(requestedMaxMctsBatch)
        ? Math.max(1, Math.floor(requestedMaxMctsBatch))
        : 8;
    const maxMctsBatch = Math.min(this.maxInferenceBatch, interactiveBatchLimit);

    return runMCTS(
      board,
      nextPla,
      komi,
      history,
      numVisits,
      size,
      this.maxInferenceBatch,
      maxMctsBatch,
      evaluator,
      this.debugLog.bind(this),
      onProgress,
      signal,
      includeMove
    );
  }

  private inferenceChunkSize(): number {
    return this.maxInferenceBatch === Infinity
      ? Number.POSITIVE_INFINITY
      : Math.max(1, Math.floor(this.maxInferenceBatch));
  }

  private async runFeaturizedBatchInference(
    leaves: Array<{
      board: GoBoard;
      pla: Sign;
      komi: number;
      history: { color: Sign; x: number; y: number }[];
    }>,
    size: number
  ): Promise<AnalysisResult[]> {
    if (leaves.length === 0) return [];

    const numPlanes = 22;
    const perPosBinSize = numPlanes * size * size;
    const chunkSize = this.inferenceChunkSize();
    const allResults: AnalysisResult[] = [];

    for (let chunkStart = 0; chunkStart < leaves.length; chunkStart += chunkSize) {
      if (chunkStart > 0) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
      const chunk = leaves.slice(chunkStart, chunkStart + chunkSize);
      const batchBin = new Float32Array(chunk.length * perPosBinSize);
      const batchGlobal = new Float32Array(chunk.length * 19);
      const plas: Sign[] = [];

      for (let i = 0; i < chunk.length; i++) {
        const leaf = chunk[i];
        plas.push(leaf.pla);
        featurizeToBuffer(
          leaf.board,
          leaf.pla,
          leaf.komi,
          leaf.history,
          batchBin,
          batchGlobal,
          i,
          size
        );
      }
      allResults.push(...(await this.runBatchInference(batchBin, batchGlobal, plas, size)));
    }

    return allResults;
  }

  private async runBatchInference(
    bin_input: Float32Array,
    global_input: Float32Array,
    plas: Sign[],
    size: number
  ): Promise<AnalysisResult[]> {
    const batchSize = plas.length;
    const chunkSize = this.inferenceChunkSize();
    if (batchSize > chunkSize) {
      const numPlanes = 22;
      const perPosBinSize = numPlanes * size * size;
      const allResults: AnalysisResult[] = [];
      for (let chunkStart = 0; chunkStart < batchSize; chunkStart += chunkSize) {
        const thisBatch = Math.min(chunkSize, batchSize - chunkStart);
        const chunkBin = new Float32Array(
          bin_input.buffer,
          bin_input.byteOffset + chunkStart * perPosBinSize * 4,
          thisBatch * perPosBinSize
        );
        const chunkGlobal = new Float32Array(
          global_input.buffer,
          global_input.byteOffset + chunkStart * 19 * 4,
          thisBatch * 19
        );
        const chunkPlas = plas.slice(chunkStart, chunkStart + thisBatch);
        allResults.push(
          ...(await this.runBatchInference(chunkBin, chunkGlobal, chunkPlas, size))
        );
      }
      return allResults;
    }

    const { binTensor, globalTensor, usingGpuBuffers } = await this.prepareInputTensors(
      bin_input,
      global_input,
      batchSize,
      size
    );

    this.gpuDevice?.pushErrorScope('validation');
    const results = await this.session!.run({ bin_input: binTensor, global_input: globalTensor });
    this.lastInferenceRunCount += 1;
    await this.checkGpuErrorScope();

    if (!usingGpuBuffers) {
      binTensor.dispose();
      globalTensor.dispose();
    }
    const analysis = await processBatchResults(results, plas, size, batchSize);
    return analysis;
  }

  private async prepareInputTensors(
    binInput: Float32Array,
    globalInput: Float32Array,
    batchSize: number,
    size: number
  ): Promise<{ binTensor: ort.Tensor; globalTensor: ort.Tensor; usingGpuBuffers: boolean }> {
    if (this.useGpuInputs && this.gpu.device) {
      await this.ensureGpuBuffers(size);
    }
    if (this.useGpuInputs && this.gpu.device) {
      const paddedBin = new Float32Array(this.maxInferenceBatch * 22 * size * size);
      paddedBin.set(binInput);
      const paddedGlobal = new Float32Array(this.maxInferenceBatch * 19);
      paddedGlobal.set(globalInput);
      const binData = this.inputDataType === 'float16' ? float32ToFloat16(paddedBin) : paddedBin;
      const globalData =
        this.inputDataType === 'float16' ? float32ToFloat16(paddedGlobal) : paddedGlobal;
      const t = uploadToGpuBuffers(this.gpu, binData, globalData);
      return { binTensor: t.binTensor, globalTensor: t.globalTensor, usingGpuBuffers: true };
    }
    if (this.maxInferenceBatch !== Infinity && batchSize < this.maxInferenceBatch) {
      const paddedBin = new Float32Array(this.maxInferenceBatch * 22 * size * size);
      paddedBin.set(binInput);
      const paddedGlobal = new Float32Array(this.maxInferenceBatch * 19);
      paddedGlobal.set(globalInput);
      return {
        binTensor: createTensor(
          paddedBin,
          [this.maxInferenceBatch, 22, size, size],
          this.inputDataType
        ),
        globalTensor: createTensor(paddedGlobal, [this.maxInferenceBatch, 19], this.inputDataType),
        usingGpuBuffers: false,
      };
    }
    return {
      binTensor: createTensor(
        new Float32Array(binInput),
        [batchSize, 22, size, size],
        this.inputDataType
      ),
      globalTensor: createTensor(
        new Float32Array(globalInput),
        [batchSize, 19],
        this.inputDataType
      ),
      usingGpuBuffers: false,
    };
  }

  private buildMctsSearchSpec(
    signMap: SignMap,
    options: EngineAnalysisOptions
  ): {
    spec: MCTSSearchSpec;
    board: GoBoard;
    nextPla: Sign;
    maxMctsBatch: number;
    onProgress?: (progress: MCTSProgress) => void;
    signal?: AbortSignal;
  } {
    const board = new GoBoard(signMap);
    const size = board.width;

    let nextPla: Sign = 1;
    if (options.nextToPlay) {
      nextPla = options.nextToPlay === 'W' ? -1 : 1;
    } else {
      let blackStones = 0;
      let whiteStones = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const stone = board.get([x, y]);
          if (stone === 1) blackStones++;
          else if (stone === -1) whiteStones++;
        }
      }
      nextPla = blackStones === whiteStones ? 1 : -1;
    }

    const koInfo = (options as any).koInfo as { sign: Sign; vertex: [number, number] } | undefined;
    if (koInfo && (koInfo.sign as number) !== 0) {
      board._koInfo = { sign: koInfo.sign, vertex: koInfo.vertex };
    }

    const requestedMaxMctsBatch = (options as any).maxMctsBatch;
    const interactiveBatchLimit =
      typeof requestedMaxMctsBatch === 'number' && Number.isFinite(requestedMaxMctsBatch)
        ? Math.max(1, Math.floor(requestedMaxMctsBatch))
        : 8;
    const maxMctsBatch = Math.min(this.maxInferenceBatch, interactiveBatchLimit);

    return {
      board,
      nextPla,
      maxMctsBatch,
      onProgress: (options as any).onProgress as ((progress: MCTSProgress) => void) | undefined,
      signal: (options as any).signal as AbortSignal | undefined,
      spec: {
        rootBoard: board,
        nextPla,
        komi: options.komi ?? 7.5,
        history: options.history || [],
        numVisits: (options as any).numVisits ?? 1,
        includeMove: options.includeMove,
        onProgress: (options as any).onProgress as ((progress: MCTSProgress) => void) | undefined,
      },
    };
  }

  async analyzeBatch(
    inputs: { signMap: SignMap; options?: EngineAnalysisOptions }[]
  ): Promise<AnalysisResult[]> {
    if (!this.initialized || !this.session) {
      throw new Error('Engine not initialized');
    }

    if (inputs.length === 0) return [];

    const hasMultiVisit = inputs.some(i => ((i.options as any)?.numVisits ?? 1) > 1);
    if (hasMultiVisit) {
      const size = inputs[0].signMap.length;
      const results: (AnalysisResult | null)[] = new Array(inputs.length).fill(null);
      const pending: {
        originalIndex: number;
        signMap: SignMap;
        options: EngineAnalysisOptions;
        board: GoBoard;
        nextPla: Sign;
        spec: MCTSSearchSpec;
        maxMctsBatch: number;
        signal?: AbortSignal;
      }[] = [];

      const useCache = this.config.enableCache;
      for (let i = 0; i < inputs.length; i++) {
        const { signMap, options = {} } = inputs[i];
        if (useCache) {
          const cacheKey = this.getCacheKey(signMap, options);
          const cached = this.cache.get(cacheKey);
          if (cached) {
            results[i] = cached;
            continue;
          }
        }
        const built = this.buildMctsSearchSpec(signMap, options);
        pending.push({
          originalIndex: i,
          signMap,
          options,
          board: built.board,
          nextPla: built.nextPla,
          spec: built.spec,
          maxMctsBatch: built.maxMctsBatch,
          signal: built.signal,
        });
      }

      if (pending.length === 0) {
        return results as AnalysisResult[];
      }

      const sharedSignal = pending.find(item => item.signal)?.signal;
      const evaluator: MCTSBatchEvaluator = async leaves =>
        this.runFeaturizedBatchInference(leaves, size);

      const treeChunks: typeof pending[] = [];
      for (let offset = 0; offset < pending.length; offset += CROSS_TREE_MCTS_CHUNK) {
        treeChunks.push(pending.slice(offset, offset + CROSS_TREE_MCTS_CHUNK));
      }

      for (let chunkIndex = 0; chunkIndex < treeChunks.length; chunkIndex += 1) {
        const treeChunk = treeChunks[chunkIndex];
        const chunkMaxMctsBatch = Math.min(...treeChunk.map(item => item.maxMctsBatch));
        const chunkResults = await runBatchedMCTS(
          treeChunk.map(item => item.spec),
          size,
          this.maxInferenceBatch,
          chunkMaxMctsBatch,
          evaluator,
          this.debugLog.bind(this),
          sharedSignal
        );

        for (let i = 0; i < treeChunk.length; i++) {
          const { originalIndex, signMap, options, board, nextPla } = treeChunk[i];
          const result = filterKoMoves(chunkResults[i], board, nextPla, size);
          results[originalIndex] = result;
          if (useCache) {
            const cacheKey = this.getCacheKey(signMap, options);
            this.cache.set(cacheKey, result);
            if (this.cache.size > (this.config.maxCacheSize ?? 1000)) {
              const firstKey = this.cache.keys().next().value;
              if (firstKey) this.cache.delete(firstKey);
            }
          }
        }
      }
      this.debugLog('Multi-visit batch analysis complete', {
        actualBatchSize: pending.length,
        inferenceRunCount: this.lastInferenceRunCount,
      });

      return results as AnalysisResult[];
    }

    const size = inputs[0].signMap.length;
    const numPlanes = 22;

    const results: (AnalysisResult | null)[] = new Array(inputs.length).fill(null);
    const uncachedInputs: {
      originalIndex: number;
      signMap: SignMap;
      options: EngineAnalysisOptions;
      board: GoBoard;
      nextPla: Sign;
    }[] = [];

    const useCache = this.config.enableCache;
    for (let i = 0; i < inputs.length; i++) {
      const { signMap, options = {} } = inputs[i];
      if (useCache) {
        const cacheKey = this.getCacheKey(signMap, options);
        const cached = this.cache.get(cacheKey);
        if (cached) {
          results[i] = cached;
          continue;
        }
      }
      const board = new GoBoard(signMap);
      const nextPla: Sign = options.nextToPlay === 'W' ? -1 : 1;
      const koInfo = (options as any).koInfo as
        | { sign: Sign; vertex: [number, number] }
        | undefined;
      if (koInfo && (koInfo.sign as number) !== 0) {
        board._koInfo = { sign: koInfo.sign, vertex: koInfo.vertex };
      }
      uncachedInputs.push({ originalIndex: i, signMap, options, board, nextPla });
    }

    if (uncachedInputs.length === 0) {
      return results as AnalysisResult[];
    }

    const actualBatchSize = uncachedInputs.length;
    const batchStart = performance.now();
    const perPosBinSize = numPlanes * size * size;
    const bin_input = new Float32Array(actualBatchSize * perPosBinSize);
    const global_input = new Float32Array(actualBatchSize * 19);
    const plas: Sign[] = [];

    for (let b = 0; b < actualBatchSize; b++) {
      const { options, board, nextPla } = uncachedInputs[b];
      const komi = options.komi ?? 7.5;
      plas.push(nextPla);
      const history = options.history || [];
      featurizeToBuffer(board, nextPla, komi, history, bin_input, global_input, b, size);
    }

    validateTensorData(bin_input, 'bin_input(batch)', this.debugEnabled);
    validateTensorData(global_input, 'global_input(batch)', this.debugEnabled);

    // Run inference — chunk if model has limited batch size
    const chunkSize = Math.min(actualBatchSize, this.maxInferenceBatch);
    const allBatchResults: AnalysisResult[] = [];
    let totalInferenceTime = 0;

    for (let chunkStart = 0; chunkStart < actualBatchSize; chunkStart += chunkSize) {
      const chunkEnd = Math.min(chunkStart + chunkSize, actualBatchSize);
      const thisBatch = chunkEnd - chunkStart;
      const chunkPlas = plas.slice(chunkStart, chunkEnd);

      const chunkBin = new Float32Array(
        bin_input.buffer,
        bin_input.byteOffset + chunkStart * perPosBinSize * 4,
        thisBatch * perPosBinSize
      );
      const chunkGlobal = new Float32Array(
        global_input.buffer,
        global_input.byteOffset + chunkStart * 19 * 4,
        thisBatch * 19
      );

      const inferenceStart = performance.now();
      const chunkResults = await this.runBatchInference(chunkBin, chunkGlobal, chunkPlas, size);
      totalInferenceTime += performance.now() - inferenceStart;

      allBatchResults.push(...chunkResults);
    }

    // Store in cache; filter ko moves
    for (let b = 0; b < actualBatchSize; b++) {
      const { originalIndex, signMap, options, board, nextPla } = uncachedInputs[b];
      const result = filterKoMoves(allBatchResults[b], board, nextPla, size);
      results[originalIndex] = result;

      if (useCache) {
        const cacheKey = this.getCacheKey(signMap, options);
        this.cache.set(cacheKey, result);
        if (this.cache.size > (this.config.maxCacheSize ?? 1000)) {
          const firstKey = this.cache.keys().next().value;
          if (firstKey) this.cache.delete(firstKey);
        }
      }
    }

    const totalTime = performance.now() - batchStart;
    this.debugLog('Batch analysis complete', {
      actualBatchSize,
      totalTimeMs: totalTime,
      msPerPos: totalTime / actualBatchSize,
      inferenceTimeMs: totalInferenceTime,
    });

    return results as AnalysisResult[];
  }

  async dispose(): Promise<void> {
    releaseGpuBuffers(this.gpu);
    this.gpu.device = null;

    if (this.session) {
      try {
        // @ts-ignore
        await this.session.release?.();
      } catch {
        // Ignore
      }
      this.session = null;
    }
    await super.dispose();
  }
}
