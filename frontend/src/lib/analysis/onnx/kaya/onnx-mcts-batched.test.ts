import { describe, expect, it, vi } from "vitest";

import { GoBoard, type Sign } from "./goboard";
import { runBatchedMCTS } from "./onnx-mcts";

function emptyBoard(size = 19): GoBoard {
  const signMap: Sign[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => 0 as Sign),
  );
  return new GoBoard(signMap);
}

describe("runBatchedMCTS", () => {
  it("batches leaf inference across multiple searches in one evaluator call per iteration", async () => {
    const board = emptyBoard();
    const evaluator = vi.fn(async (leaves: unknown[]) =>
      leaves.map(() => ({
        moveSuggestions: [{ move: "PASS", probability: 1, winRate: 0.5, scoreLead: 0 }],
        winRate: 0.5,
        scoreLead: 0,
        currentTurn: "B" as const,
        visits: 1,
      })),
    );

    await runBatchedMCTS(
      [
        { rootBoard: board, nextPla: 1, komi: 7.5, history: [], numVisits: 4 },
        { rootBoard: board, nextPla: 1, komi: 7.5, history: [], numVisits: 4 },
        { rootBoard: board, nextPla: 1, komi: 7.5, history: [], numVisits: 4 },
      ],
      19,
      64,
      4,
      evaluator,
      () => undefined,
    );

    const batchSizes = evaluator.mock.calls.map(call => call[0].length);
    expect(batchSizes.some(size => size >= 3)).toBe(true);
    expect(evaluator).toHaveBeenCalledTimes(1);
  });

  it("chunks leaf evaluator calls to maxInferenceBatch", async () => {
    const board = emptyBoard();
    const evaluator = vi.fn(async (leaves: unknown[]) =>
      leaves.map(() => ({
        moveSuggestions: [{ move: "PASS", probability: 1, winRate: 0.5, scoreLead: 0 }],
        winRate: 0.5,
        scoreLead: 0,
        currentTurn: "B" as const,
        visits: 1,
      })),
    );
    const searches = Array.from({ length: 10 }, () => ({
      rootBoard: board,
      nextPla: 1 as const,
      komi: 7.5,
      history: [],
      numVisits: 4,
    }));

    await runBatchedMCTS(searches, 19, 4, 4, evaluator, () => undefined);

    const batchSizes = evaluator.mock.calls.map(call => call[0].length);
    expect(batchSizes.every(size => size <= 4)).toBe(true);
    expect(evaluator.mock.calls.length).toBeGreaterThan(1);
  });
});
