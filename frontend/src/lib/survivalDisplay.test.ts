import { describe, expect, it } from "vitest";

import {
  candidateColumnLabels,
  formatCandidateBottleneck,
  formatPositionMetrics,
  totalBoardPoints,
} from "./survivalDisplay";

describe("survivalDisplay", () => {
  it("counts board points from size", () => {
    expect(totalBoardPoints(19)).toBe(361);
  });

  it("frames metrics for human Black", () => {
    const labels = formatPositionMetrics(
      { unresolved_count: 12, min_black_probability: 0.41 },
      "B",
      19,
    );
    expect(labels.disputedLabel).toBe("Points still disputed");
    expect(labels.disputedValue).toBe("12 / 361");
    expect(labels.bottleneckLabel).toBe("Most vulnerable point");
    expect(labels.bottleneckValue).toBe("41% Black control (target: 95%+)");
  });

  it("frames metrics for human White", () => {
    const labels = formatPositionMetrics(
      { unresolved_count: 3, min_black_probability: 0.41 },
      "W",
      19,
    );
    expect(labels.disputedLabel).toBe("Points still in play");
    expect(labels.disputedValue).toBe("3 / 361");
    expect(labels.bottleneckLabel).toBe("Strongest foothold");
    expect(labels.bottleneckValue).toBe(
      "59% non-Black control (keep any point in play)",
    );
  });

  it("uses side-aware candidate column headers", () => {
    expect(candidateColumnLabels("B")).toEqual({
      disputedHeader: "Disputed points",
      bottleneckHeader: "Most vulnerable",
    });
    expect(candidateColumnLabels("W")).toEqual({
      disputedHeader: "Points in play",
      bottleneckHeader: "Best foothold",
    });
  });

  it("formats candidate bottleneck from human perspective", () => {
    expect(formatCandidateBottleneck(0.4, "B")).toBe("40%");
    expect(formatCandidateBottleneck(0.4, "W")).toBe("60%");
  });
});
