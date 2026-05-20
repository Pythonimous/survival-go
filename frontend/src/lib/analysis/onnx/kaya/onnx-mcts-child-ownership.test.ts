import { describe, expect, it, vi } from "vitest";

import { GoBoard, type Sign } from "./goboard";
import { runMCTS } from "./onnx-mcts";

function emptyBoard(size = 19): GoBoard {
  const signMap: Sign[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => 0 as Sign),
  );
  return new GoBoard(signMap);
}

describe("runMCTS child ownership", () => {
  it("attaches averaged ownership to root move suggestions after depth-1 leaf evals", async () => {
    const board = emptyBoard();
    const size = 19;
    const boardArea = size * size;
    let evalCount = 0;
    const evaluator = vi.fn(async (leaves: unknown[]) =>
      leaves.map(() => {
        const ownership = new Array<number>(boardArea).fill(evalCount * 0.1);
        evalCount += 1;
        return {
          moveSuggestions: [
            { move: "Q16", probability: 0.5, winRate: 0.5, scoreLead: 0 },
            { move: "D4", probability: 0.5, winRate: 0.5, scoreLead: 0 },
          ],
          winRate: 0.5,
          scoreLead: 0,
          currentTurn: "B" as const,
          ownership,
          visits: 1,
        };
      }),
    );

    const result = await runMCTS(
      board,
      1,
      345.5,
      [],
      32,
      size,
      64,
      8,
      evaluator,
      () => undefined,
    );

    const withOwnership = result.moveSuggestions.filter(
      suggestion => suggestion.ownership && suggestion.ownership.length === boardArea,
    );
    expect(withOwnership.length).toBeGreaterThan(0);
    expect(evaluator.mock.calls.length).toBeGreaterThan(0);
  });
});
