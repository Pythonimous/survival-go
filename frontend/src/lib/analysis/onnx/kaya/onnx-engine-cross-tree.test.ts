import { describe, expect, it } from "vitest";

import {
  CROSS_TREE_MCTS_CHUNK,
  crossTreeMctsChunkCount,
} from "./onnx-engine";

describe("cross-tree MCTS chunking", () => {
  it("uses a fixed chunk size of four trees", () => {
    expect(CROSS_TREE_MCTS_CHUNK).toBe(4);
  });

  it("splits twelve candidate trees into three synchronized groups", () => {
    expect(crossTreeMctsChunkCount(12)).toBe(3);
    expect(crossTreeMctsChunkCount(4)).toBe(1);
    expect(crossTreeMctsChunkCount(5)).toBe(2);
  });
});
