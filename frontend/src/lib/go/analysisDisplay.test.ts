import { describe, expect, it } from "vitest";

import {
  candidateColumnLabels,
  formatCandidateScore,
  formatCandidateWinRate,
  formatPositionAnalysis,
  sortCandidatesForDisplay,
} from "./analysisDisplay";
import type { CandidateSummary } from "@/types/api";

describe("analysisDisplay", () => {
  it("formats position win rate and score for human Black", () => {
    const labels = formatPositionAnalysis("B", 0.73, 5.2);
    expect(labels.winRateLabel).toBe("Your win rate");
    expect(labels.winRateValue).toBe("73.0%");
    expect(labels.scoreLabel).toBe("Score");
    expect(labels.scoreValue).toBe("B+5.2");
  });

  it("formats position win rate and score for human White", () => {
    const labels = formatPositionAnalysis("W", 0.33, -5.0);
    expect(labels.winRateValue).toBe("67.0%");
    expect(labels.scoreValue).toBe("W+5");
  });

  it("shows Even when score lead is near zero", () => {
    expect(formatPositionAnalysis("B", 0.5, 0).scoreValue).toBe("Even");
  });

  it("formats position summary as human perspective", () => {
    const labels = formatPositionAnalysis("W", 0.02, 22.5);
    expect(labels.winRateLabel).toBe("Your win rate");
    expect(labels.winRateValue).toBe("98.0%");
    expect(labels.scoreLabel).toBe("Score");
    expect(labels.scoreValue).toBe("W-22.5");
  });

  it("uses mover-side headers for candidate rows", () => {
    expect(candidateColumnLabels("B")).toEqual({
      winRateHeader: "Black win rate (after move)",
      scoreHeader: "Score after move",
    });
  });

  it("formats per-candidate stats from Black-perspective engine outputs for the mover side", () => {
    expect(formatCandidateWinRate(0.98, "B")).toBe("98.0%");
    expect(formatCandidateWinRate(0.98, "W")).toBe("2.0%");
    expect(formatCandidateScore(22.5, "B")).toBe("B+22.5");
    expect(formatCandidateScore(22.5, "W")).toBe("W-22.5");
    expect(formatCandidateWinRate(undefined, "B")).toBe("—");
    expect(formatCandidateScore(undefined, "W")).toBe("—");
  });

  it("sorts candidates best-first for the mover perspective", () => {
    const candidates: CandidateSummary[] = [
      { move: "D4", survival_score: 0, min_black_probability: 0.5, winrate: 0.7, score_lead: 1 },
      { move: "K10", survival_score: 0, min_black_probability: 0.5, winrate: 0.98, score_lead: 22.5 },
      { move: "Q16", survival_score: 0, min_black_probability: 0.5, winrate: 0.9, score_lead: 10 },
    ];

    expect(sortCandidatesForDisplay(candidates, "B").map((candidate) => candidate.move)).toEqual([
      "K10",
      "Q16",
      "D4",
    ]);
  });
});
