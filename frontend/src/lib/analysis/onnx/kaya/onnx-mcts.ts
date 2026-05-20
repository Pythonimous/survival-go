// SPDX-License-Identifier: AGPL-3.0-or-later
// Ported from kaya-go/kaya (AGPL-3.0), packages/ai-engine/src/onnx-mcts.ts
// Upstream commit: 8fafeac0fedde020c447d931c0b1afdf283edf2a

import { agentDebugLog } from '@/lib/analysis/debug-agent-log';
import { GoBoard, type Sign } from './goboard';
import type { MCTSNode, MCTSBatchEvaluator, MCTSProgress } from './onnx-types';
import type { AnalysisResult, MoveSuggestion } from './types';

/** Parse a GTP move string (e.g. "D4", "Q16", "PASS") to board [x, y] or null for pass. */
export function parseMoveStr(move: string, size: number): [number, number] | null {
  if (!move || move === 'PASS') return null;
  const letters = 'ABCDEFGHJKLMNOPQRST';
  const x = letters.indexOf(move[0].toUpperCase());
  const y = size - parseInt(move.slice(1), 10);
  if (x < 0 || y < 0 || y >= size) return null;
  return [x, y];
}

/** Get the GTP string for the ko-forbidden vertex, or null if no ko. */
export function getKoVertex(board: GoBoard, pla: Sign, size: number): string | null {
  const koInfo = board._koInfo;
  if (!koInfo || koInfo.sign !== pla || koInfo.vertex[0] === -1) return null;
  const letters = 'ABCDEFGHJKLMNOPQRST';
  return `${letters[koInfo.vertex[0]]}${size - koInfo.vertex[1]}`;
}

/** Remove the ko-forbidden move from suggestions and renormalise probabilities. */
export function filterKoMoves(
  result: AnalysisResult,
  board: GoBoard,
  pla: Sign,
  size: number
): AnalysisResult {
  const koMove = getKoVertex(board, pla, size);
  if (!koMove) return result;
  const filtered = result.moveSuggestions.filter(s => s.move !== koMove);
  const total = filtered.reduce((sum, s) => sum + s.probability, 0);
  if (total > 0) {
    for (const s of filtered) s.probability /= total;
  }
  return { ...result, moveSuggestions: filtered };
}

/** Expand a node: create children from NN policy, skipping occupied and ko-illegal intersections. */
export function expandNode(
  node: MCTSNode,
  eval_: AnalysisResult,
  board: GoBoard,
  pla: Sign,
  size: number
): void {
  node.children = new Map();
  const koVertex = getKoVertex(board, pla, size);
  for (const suggestion of eval_.moveSuggestions) {
    const move = suggestion.move;
    if (move !== 'PASS') {
      if (koVertex && move === koVertex) continue;
      const parsed = parseMoveStr(move, size);
      if (!parsed) continue;
      // Skip occupied intersections
      const stone = board.get(parsed);
      if (stone !== 0) continue;
    }
    node.children.set(move, {
      N: 0,
      W: 0,
      S: 0,
      P: suggestion.probability,
      children: null,
      expanded: false,
      virtualLoss: 0,
    });
  }
  node.expanded = true;
}

export type MCTSSearchSpec = {
  rootBoard: GoBoard;
  nextPla: Sign;
  komi: number;
  history: { color: Sign; x: number; y: number }[];
  numVisits: number;
  includeMove?: string;
  onProgress?: (progress: MCTSProgress) => void;
};

type MCTSHistory = MCTSSearchSpec['history'];
type MCTSStep = { node: MCTSNode; board: GoBoard; pla: Sign; hist: MCTSHistory };

type ActiveMCTSSearch = MCTSSearchSpec & {
  root: MCTSNode;
  completed: number;
  ownershipSum: Float64Array;
  ownershipCount: number;
  rootPolicyLogits?: number[];
};

const CPUCT = 1.5;

function selectMctsPath(
  root: MCTSNode,
  rootBoard: GoBoard,
  nextPla: Sign,
  history: MCTSHistory,
  size: number,
): MCTSStep[] {
  const path: MCTSStep[] = [{ node: root, board: rootBoard, pla: nextPla, hist: history }];

  while (true) {
    const { node, board, pla, hist } = path[path.length - 1];
    if (!node.expanded || !node.children || node.children.size === 0) break;

    const len = hist.length;
    if (len >= 2 && hist[len - 1].x < 0 && hist[len - 2].x < 0) break;

    let bestScore = -Infinity;
    let bestMove = '';
    let bestChild: MCTSNode | null = null;

    const parentN = node.N + node.virtualLoss;
    for (const [move, child] of node.children) {
      const effectiveN = child.N + child.virtualLoss;
      const virtualW = pla === 1 ? 0 : child.virtualLoss;
      const effectiveW = child.W + virtualW;
      const q =
        effectiveN > 0
          ? pla === 1
            ? effectiveW / effectiveN
            : 1 - effectiveW / effectiveN
          : 0;
      const u = (CPUCT * child.P * Math.sqrt(Math.max(parentN, 1))) / (1 + effectiveN);
      if (q + u > bestScore) {
        bestScore = q + u;
        bestMove = move;
        bestChild = child;
      }
    }
    if (!bestChild) break;

    let newBoard: GoBoard;
    let newHist: MCTSHistory;
    if (bestMove === 'PASS') {
      newBoard = new GoBoard(board.signMap.map(row => [...row] as Sign[]));
      newHist = [...hist.slice(-4), { color: pla, x: -1, y: -1 }];
    } else {
      const parsed = parseMoveStr(bestMove, size);
      if (!parsed) break;
      try {
        newBoard = board.makeMove(pla, parsed, {});
      } catch {
        break;
      }
      newHist = [...hist.slice(-4), { color: pla, x: parsed[0], y: parsed[1] }];
    }

    path.push({
      node: bestChild,
      board: newBoard,
      pla: (pla === 1 ? -1 : 1) as Sign,
      hist: newHist,
    });
  }

  return path;
}

function buildMctsResult(search: ActiveMCTSSearch, nextPla: Sign): AnalysisResult {
  const { root, ownershipSum, ownershipCount, rootPolicyLogits } = search;
  const moveSuggestions: MoveSuggestion[] = [];
  if (root.children && root.children.size > 0) {
    const totalChildVisits = [...root.children.values()].reduce((sum, child) => sum + child.N, 0);
    const sorted = [...root.children.entries()].sort(([, a], [, b]) => {
      if (a.N !== b.N) return b.N - a.N;
      return b.P - a.P;
    });
    const rootWinRate = root.N > 0 ? root.W / root.N : 0.5;
    const rootScoreLead = root.N > 0 ? root.S / root.N : 0;

    for (const [move, child] of sorted) {
      moveSuggestions.push({
        move,
        probability: child.N > 0 && totalChildVisits > 0 ? child.N / totalChildVisits : child.P,
        winRate: child.N > 0 ? child.W / child.N : rootWinRate,
        scoreLead: child.N > 0 ? child.S / child.N : rootScoreLead,
      });
    }
  }

  const winRate = root.N > 0 ? root.W / root.N : 0.5;
  const mctsScoreLead = root.N > 0 ? root.S / root.N : 0;
  const ownership =
    ownershipCount > 0 ? Array.from(ownershipSum, value => value / ownershipCount) : undefined;

  return {
    moveSuggestions,
    winRate,
    scoreLead: mctsScoreLead,
    currentTurn: nextPla === 1 ? 'B' : 'W',
    visits: root.N,
    ownership,
    policyLogits: rootPolicyLogits,
  };
}

/**
 * Run multiple independent PUCT MCTS searches with synchronized iterations so leaf
 * evaluations from every active tree are submitted in one batched inference call.
 */
export async function runBatchedMCTS(
  searches: MCTSSearchSpec[],
  size: number,
  maxInferenceBatch: number,
  maxMctsBatch: number,
  batchEvaluator: MCTSBatchEvaluator,
  debugLogFn: (message: string, payload?: Record<string, unknown>) => void,
  signal?: AbortSignal,
): Promise<AnalysisResult[]> {
  if (searches.length === 0) return [];

  const boardArea = size * size;
  const active: ActiveMCTSSearch[] = searches.map(spec => ({
    ...spec,
    root: {
      N: 0,
      W: 0,
      S: 0,
      P: 1,
      children: null,
      expanded: false,
      virtualLoss: 0,
    },
    completed: 0,
    ownershipSum: new Float64Array(boardArea),
    ownershipCount: 0,
  }));

  for (const search of active) {
    search.onProgress?.({
      completedVisits: 0,
      totalVisits: search.numVisits,
      bestMove: '',
      bestMoveVisits: 0,
      winRate: 0.5,
      scoreLead: 0,
      topMoves: [],
    });
  }

  const anyActive = (): boolean =>
    active.some(search => search.completed < search.numVisits && !signal?.aborted);

  let mctsIteration = 0;
  const mctsLoopStartedAt = performance.now();
  while (anyActive()) {
    mctsIteration += 1;
    const iterationStartedAt = performance.now();
    const pending: { searchIdx: number; path: MCTSStep[]; needsEval: boolean }[] = [];

    for (let searchIdx = 0; searchIdx < active.length; searchIdx += 1) {
      const search = active[searchIdx];
      if (search.completed >= search.numVisits || signal?.aborted) continue;

      const batchSize = Math.min(
        maxMctsBatch,
        maxInferenceBatch,
        search.numVisits - search.completed,
      );

      for (let batchIndex = 0; batchIndex < batchSize; batchIndex += 1) {
        const path = selectMctsPath(
          search.root,
          search.rootBoard,
          search.nextPla,
          search.history,
          size,
        );
        for (const step of path) step.node.virtualLoss++;
        const leaf = path[path.length - 1];
        pending.push({ searchIdx, path, needsEval: !leaf.node.expanded });
      }
    }

    if (pending.length === 0) {
      // #region agent log
      agentDebugLog("D", "onnx-mcts.ts:emptyPendingBreak", "breaking with empty pending", {
        mctsIteration,
        searchCount: active.length,
        completed: active.map(search => search.completed),
        numVisits: active.map(search => search.numVisits),
        anyActive: anyActive(),
      });
      // #endregion
      break;
    }

    const toEvaluate = pending.filter(item => item.needsEval);
    const evalResults: AnalysisResult[] = [];

    if (toEvaluate.length > 0) {
      const leaves = toEvaluate.map(item => {
        const leaf = item.path[item.path.length - 1];
        const search = active[item.searchIdx];
        return {
          board: leaf.board,
          pla: leaf.pla,
          komi: search.komi,
          history: leaf.hist,
        };
      });
      const inferenceChunk =
        Number.isFinite(maxInferenceBatch) && maxInferenceBatch > 0
          ? Math.floor(maxInferenceBatch)
          : leaves.length;
      for (let chunkStart = 0; chunkStart < leaves.length; chunkStart += inferenceChunk) {
        const chunk = leaves.slice(chunkStart, chunkStart + inferenceChunk);
        evalResults.push(...(await batchEvaluator(chunk)));
      }
    }

    let evalIdx = 0;
    for (const item of pending) {
      const search = active[item.searchIdx];
      for (const step of item.path) step.node.virtualLoss--;

      const leaf = item.path[item.path.length - 1];
      let value: number;
      let scoreLead: number;

      if (item.needsEval && evalIdx < evalResults.length) {
        const result = evalResults[evalIdx++];
        if (item.path.length === 1 && result.policyLogits) {
          search.rootPolicyLogits = result.policyLogits;
        }
        const filtered = filterKoMoves(result, leaf.board, leaf.pla, size);
        expandNode(leaf.node, filtered, leaf.board, leaf.pla, size);
        value = filtered.winRate;
        scoreLead = filtered.scoreLead;

        if (filtered.ownership) {
          for (let point = 0; point < boardArea; point += 1) {
            search.ownershipSum[point] += filtered.ownership[point];
          }
          search.ownershipCount++;
        }
      } else {
        value = leaf.node.N > 0 ? leaf.node.W / leaf.node.N : 0.5;
        scoreLead = leaf.node.N > 0 ? leaf.node.S / leaf.node.N : 0;
      }

      for (const step of item.path) {
        step.node.N++;
        step.node.W += value;
        step.node.S += scoreLead;
      }

      search.completed += 1;
    }

    if (toEvaluate.length > 0 && evalIdx !== toEvaluate.length) {
      // #region agent log
      agentDebugLog("E", "onnx-mcts.ts:evalMismatch", "eval count mismatch", {
        mctsIteration,
        toEvaluateCount: toEvaluate.length,
        evalIdx,
        evalResultCount: evalResults.length,
      });
      // #endregion
    }

    for (const search of active) {
      if (!search.onProgress || !search.root.children || search.root.children.size === 0) {
        continue;
      }
      const sorted = [...search.root.children.entries()].sort(([, a], [, b]) => b.N - a.N);
      const [bestMove, bestChild] = sorted[0];
      let progressTopMoves = sorted.slice(0, 5);
      if (
        search.includeMove &&
        !progressTopMoves.some(([move]) => move === search.includeMove) &&
        search.root.children.has(search.includeMove)
      ) {
        const child = search.root.children.get(search.includeMove)!;
        progressTopMoves.push([search.includeMove, child]);
      }

      search.onProgress({
        completedVisits: search.completed,
        totalVisits: search.numVisits,
        bestMove,
        bestMoveVisits: bestChild.N,
        winRate: search.root.N > 0 ? search.root.W / search.root.N : 0.5,
        scoreLead: search.root.N > 0 ? search.root.S / search.root.N : 0,
        topMoves: progressTopMoves.map(([move, child]) => ({
          move,
          visits: child.N,
          winRate: child.N > 0 ? child.W / child.N : 0.5,
          scoreLead: child.N > 0 ? child.S / child.N : 0,
        })),
      });
    }

    if (mctsIteration <= 5 || mctsIteration % 10 === 0 || pending.length > 40) {
      // #region agent log
      agentDebugLog("B", "onnx-mcts.ts:iteration", "batched MCTS iteration", {
        mctsIteration,
        iterationMs: performance.now() - iterationStartedAt,
        searchCount: active.length,
        pendingCount: pending.length,
        toEvaluateCount: toEvaluate.length,
        evalResultCount: evalResults.length,
        maxMctsBatch,
        maxInferenceBatch,
      });
      // #endregion
    }

    if (anyActive()) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  }

  // #region agent log
  agentDebugLog("B", "onnx-mcts.ts:loopDone", "batched MCTS loop finished", {
    mctsIteration,
    totalLoopMs: performance.now() - mctsLoopStartedAt,
    searchCount: active.length,
    completed: active.map(search => search.completed),
  });
  // #endregion

  for (const search of active) {
    if (
      !search.includeMove ||
      !search.root.children ||
      !search.root.children.has(search.includeMove) ||
      search.numVisits <= 1 ||
      signal?.aborted
    ) {
      continue;
    }

    const minVisits = Math.max(3, Math.ceil(search.numVisits * 0.05));
    const includedChild = search.root.children.get(search.includeMove)!;
    if (includedChild.N >= minVisits) continue;

    const extraNeeded = minVisits - includedChild.N;
    debugLogFn('includeMove forced visits', {
      move: search.includeMove,
      existing: includedChild.N,
      extra: extraNeeded,
    });

    for (let extra = 0; extra < extraNeeded && !signal?.aborted; extra += 1) {
      const path: MCTSStep[] = [
        { node: search.root, board: search.rootBoard, pla: search.nextPla, hist: search.history },
      ];
      const parsed = parseMoveStr(search.includeMove, size);
      let childBoard: GoBoard;
      let childHist: MCTSHistory;
      if (search.includeMove === 'PASS') {
        childBoard = new GoBoard(search.rootBoard.signMap.map(row => [...row] as Sign[]));
        childHist = [...search.history.slice(-4), { color: search.nextPla, x: -1, y: -1 }];
      } else if (parsed) {
        try {
          childBoard = search.rootBoard.makeMove(search.nextPla, parsed, {});
        } catch {
          break;
        }
        childHist = [...search.history.slice(-4), { color: search.nextPla, x: parsed[0], y: parsed[1] }];
      } else {
        break;
      }

      const childPla = (search.nextPla === 1 ? -1 : 1) as Sign;
      path.push({
        node: includedChild,
        board: childBoard,
        pla: childPla,
        hist: childHist,
      });

      let current = path[path.length - 1];
      while (true) {
        const { node, board, pla, hist } = current;
        if (!node.expanded || !node.children || node.children.size === 0) break;
        const len = hist.length;
        if (len >= 2 && hist[len - 1].x < 0 && hist[len - 2].x < 0) break;

        let bestScore = -Infinity;
        let bestMove = '';
        let bestChild: MCTSNode | null = null;
        const parentN = node.N;
        for (const [move, child] of node.children) {
          const q = child.N > 0 ? (pla === 1 ? child.W / child.N : 1 - child.W / child.N) : 0;
          const u = (CPUCT * child.P * Math.sqrt(Math.max(parentN, 1))) / (1 + child.N);
          if (q + u > bestScore) {
            bestScore = q + u;
            bestMove = move;
            bestChild = child;
          }
        }
        if (!bestChild) break;

        let nextBoard: GoBoard;
        let nextHist: MCTSHistory;
        if (bestMove === 'PASS') {
          nextBoard = new GoBoard(board.signMap.map(row => [...row] as Sign[]));
          nextHist = [...hist.slice(-4), { color: pla, x: -1, y: -1 }];
        } else {
          const nextParsed = parseMoveStr(bestMove, size);
          if (!nextParsed) break;
          try {
            nextBoard = board.makeMove(pla, nextParsed, {});
          } catch {
            break;
          }
          nextHist = [...hist.slice(-4), { color: pla, x: nextParsed[0], y: nextParsed[1] }];
        }

        path.push({
          node: bestChild,
          board: nextBoard,
          pla: (pla === 1 ? -1 : 1) as Sign,
          hist: nextHist,
        });
        current = path[path.length - 1];
      }

      const leaf = path[path.length - 1];
      let value: number;
      let scoreLead: number;
      if (!leaf.node.expanded) {
        const [evalResult] = await batchEvaluator([
          { board: leaf.board, pla: leaf.pla, komi: search.komi, history: leaf.hist },
        ]);
        const filtered = filterKoMoves(evalResult, leaf.board, leaf.pla, size);
        expandNode(leaf.node, filtered, leaf.board, leaf.pla, size);
        value = filtered.winRate;
        scoreLead = filtered.scoreLead;
      } else {
        value = leaf.node.N > 0 ? leaf.node.W / leaf.node.N : 0.5;
        scoreLead = leaf.node.N > 0 ? leaf.node.S / leaf.node.N : 0;
      }

      for (const step of path) {
        step.node.N++;
        step.node.W += value;
        step.node.S += scoreLead;
      }
    }
  }

  return active.map(search => {
    const result = buildMctsResult(search, search.nextPla);
    debugLogFn('MCTS complete', {
      visits: search.root.N,
      winRate: result.winRate,
      scoreLead: result.scoreLead,
    });
    return result;
  });
}

/**
 * Run PUCT MCTS search from the given position.
 * Uses batch evaluation with virtual loss to amortize GPU sync overhead.
 *
 * @param maxMctsBatch - Max visits per loop iteration before yielding for progress.
 *   Caps batch size independently of maxInferenceBatch so that backends with
 *   unbounded inference batch (e.g. WASM) still emit incremental progress.
 * @param includeMove - GTP move (e.g. "D4") to force-visit so it always has
 *   MCTS statistics in the result. Used to evaluate the actually-played move.
 */
export async function runMCTS(
  rootBoard: GoBoard,
  nextPla: Sign,
  komi: number,
  history: { color: Sign; x: number; y: number }[],
  numVisits: number,
  size: number,
  maxInferenceBatch: number,
  maxMctsBatch: number,
  batchEvaluator: MCTSBatchEvaluator,
  debugLogFn: (message: string, payload?: Record<string, unknown>) => void,
  onProgress?: (progress: MCTSProgress) => void,
  signal?: AbortSignal,
  includeMove?: string
): Promise<AnalysisResult> {
  const [result] = await runBatchedMCTS(
    [{ rootBoard, nextPla, komi, history, numVisits, includeMove, onProgress }],
    size,
    maxInferenceBatch,
    maxMctsBatch,
    batchEvaluator,
    debugLogFn,
    signal,
  );
  return result;
}
