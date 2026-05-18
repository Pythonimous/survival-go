import type { StoneColor, SurvivalMetrics } from "../types/api";

/** Matches default backend `SURVIVAL_THRESHOLD` (ownership resolved at this level). */
export const SURVIVAL_OWNERSHIP_THRESHOLD = 0.95;

export type PositionMetricLabels = {
  disputedLabel: string;
  disputedValue: string;
  bottleneckLabel: string;
  bottleneckValue: string;
};

export type CandidateColumnLabels = {
  disputedHeader: string;
  bottleneckHeader: string;
};

export function totalBoardPoints(boardSize: number): number {
  return boardSize * boardSize;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatPositionMetrics(
  metrics: SurvivalMetrics,
  humanSide: StoneColor,
  boardSize: number,
): PositionMetricLabels {
  const total = totalBoardPoints(boardSize);
  const disputed = metrics.unresolved_count;
  const minBlack = metrics.min_black_probability;

  if (humanSide === "B") {
    return {
      disputedLabel: "Points still disputed",
      disputedValue: `${disputed} / ${total}`,
      bottleneckLabel: "Most vulnerable point",
      bottleneckValue: `${formatPercent(minBlack)} Black control (target: ${formatPercent(SURVIVAL_OWNERSHIP_THRESHOLD)}+)`,
    };
  }

  return {
    disputedLabel: "Points still in play",
    disputedValue: `${disputed} / ${total}`,
    bottleneckLabel: "Strongest foothold",
    bottleneckValue: `${formatPercent(1 - minBlack)} non-Black control (keep any point in play)`,
  };
}

export function candidateColumnLabels(humanSide: StoneColor): CandidateColumnLabels {
  if (humanSide === "B") {
    return {
      disputedHeader: "Disputed points",
      bottleneckHeader: "Most vulnerable",
    };
  }
  return {
    disputedHeader: "Points in play",
    bottleneckHeader: "Best foothold",
  };
}

export function formatCandidateBottleneck(
  minBlackProbability: number,
  humanSide: StoneColor,
): string {
  if (humanSide === "B") {
    return formatPercent(minBlackProbability);
  }
  return formatPercent(1 - minBlackProbability);
}
