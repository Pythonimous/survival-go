import { describe, expect, it, vi } from "vitest";

import type { Engine } from "./base-engine";
import { AnalysisQueue, type AnalysisRequest } from "./queue";
import type { SignMap } from "./goboard";

function emptySignMap(size = 19): SignMap {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
}

function request(overrides: Partial<AnalysisRequest> = {}): AnalysisRequest {
  return {
    signMap: emptySignMap(),
    nextToPlay: "B",
    komi: 7.5,
    history: [],
    numVisits: 12,
    maxMctsBatch: 4,
    priority: "batch",
    includeMove: "D4",
    ...overrides,
  };
}

describe("AnalysisQueue", () => {
  it("forwards MCTS options and abort signal for batch requests", async () => {
    const analyzeBatch = vi.fn(async (inputs: { options?: Record<string, unknown> }[]) =>
      inputs.map(() => ({
        moveSuggestions: [],
        winRate: 0.5,
        scoreLead: 0,
        currentTurn: "B" as const,
        visits: 12,
      })),
    );
    const queue = new AnalysisQueue({ analyzeBatch } as unknown as Engine);

    const [handle] = queue.submitBatch([request()]);
    await handle.result;

    expect(analyzeBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        options: expect.objectContaining({
          numVisits: 12,
          maxMctsBatch: 4,
          includeMove: "D4",
          signal: expect.any(AbortSignal),
        }),
      }),
    ]);
  });

  it("uses a single analyzeBatch call for multi-visit batch requests", async () => {
    const analyze = vi.fn();
    const analyzeBatch = vi.fn(async (inputs: { options?: Record<string, unknown> }[]) =>
      inputs.map(() => ({
        moveSuggestions: [],
        winRate: 0.5,
        scoreLead: 0,
        currentTurn: "B" as const,
        visits: 12,
      })),
    );
    const queue = new AnalysisQueue({ analyze, analyzeBatch } as unknown as Engine);

    const handles = queue.submitBatch([
      request({ numVisits: 12 }),
      request({ numVisits: 12, includeMove: undefined }),
    ]);
    await Promise.all(handles.map(handle => handle.result));

    expect(analyzeBatch).toHaveBeenCalledTimes(1);
    expect(analyze).not.toHaveBeenCalled();
  });

  it("does not reuse cached results across different includeMove requests", async () => {
    const analyze = vi.fn(async () => ({
      moveSuggestions: [],
      winRate: 0.5,
      scoreLead: 0,
      currentTurn: "B" as const,
      visits: 12,
    }));
    const queue = new AnalysisQueue({ analyze } as unknown as Engine);

    await queue.submit(request({ includeMove: undefined })).result;
    await queue.submit(request({ includeMove: "D4" })).result;

    expect(analyze).toHaveBeenCalledTimes(2);
  });
});
