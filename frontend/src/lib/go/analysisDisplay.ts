import { formatWinRate, processAnalysis } from "@/lib/analysis/onnx/kaya/analysis-utils";
import type { CandidateSummary, StoneColor } from "@/types/api";

export type PositionAnalysisLabels = {
  winRateLabel: string;
  winRateValue: string;
  scoreLabel: string;
  scoreValue: string;
};

export type CandidateColumnLabels = {
  winRateHeader: string;
  scoreHeader: string;
};

export function formatPositionAnalysis(
  humanSide: StoneColor,
  winrate: number | undefined,
  scoreLead: number | undefined,
): PositionAnalysisLabels {
  const blackLead = scoreLead ?? 0;
  const processed = processAnalysis(blackLead, "B", winrate);
  const humanWinRate = humanSide === "B" ? processed.blackWinRate : processed.whiteWinRate;
  const humanLead = humanSide === "B" ? processed.blackScoreLead : processed.whiteScoreLead;

  return {
    winRateLabel: "Your win rate",
    winRateValue: formatWinRate(humanWinRate),
    scoreLabel: "Score",
    scoreValue: formatLeadShort(humanLead, humanSide),
  };
}

export function candidateColumnLabels(perspectiveSide: StoneColor): CandidateColumnLabels {
  const sideName = perspectiveSide === "B" ? "Black" : "White";
  return {
    winRateHeader: `${sideName} win rate (after move)`,
    scoreHeader: "Score after move",
  };
}

export function candidateTableCaption(perspectiveSide: StoneColor): string {
  const sideName = perspectiveSide === "B" ? "Black" : "White";
  return `Each row is the position after ${sideName} plays that move.`;
}

export function formatCandidateWinRate(
  winrate: number | undefined,
  perspectiveSide: StoneColor,
): string {
  if (winrate === undefined || !Number.isFinite(winrate)) {
    return "—";
  }
  const sideWinRate = perspectiveSide === "B" ? winrate : 1 - winrate;
  return formatWinRate(sideWinRate);
}

export function formatCandidateScore(
  scoreLead: number | undefined,
  perspectiveSide: StoneColor,
): string {
  if (scoreLead === undefined || !Number.isFinite(scoreLead)) {
    return "—";
  }
  const sideLead = perspectiveSide === "B" ? scoreLead : -scoreLead;
  return formatLeadShort(sideLead, perspectiveSide);
}

export function sortCandidatesForDisplay(
  candidates: readonly CandidateSummary[],
  perspectiveSide: StoneColor,
): CandidateSummary[] {
  return [...candidates].sort((left, right) => {
    const leftWinRate = candidateWinRateForSide(left.winrate, perspectiveSide);
    const rightWinRate = candidateWinRateForSide(right.winrate, perspectiveSide);
    if (rightWinRate !== leftWinRate) {
      return rightWinRate - leftWinRate;
    }
    const leftLead = candidateScoreLeadForSide(left.score_lead, perspectiveSide);
    const rightLead = candidateScoreLeadForSide(right.score_lead, perspectiveSide);
    return rightLead - leftLead;
  });
}

function candidateWinRateForSide(
  winrate: number | undefined,
  perspectiveSide: StoneColor,
): number {
  if (winrate === undefined || !Number.isFinite(winrate)) {
    return -1;
  }
  return perspectiveSide === "B" ? winrate : 1 - winrate;
}

function candidateScoreLeadForSide(
  scoreLead: number | undefined,
  perspectiveSide: StoneColor,
): number {
  if (scoreLead === undefined || !Number.isFinite(scoreLead)) {
    return Number.NEGATIVE_INFINITY;
  }
  return perspectiveSide === "B" ? scoreLead : -scoreLead;
}

function formatLeadShort(scoreLeadFromPerspective: number, perspectiveSide: StoneColor): string {
  if (Math.abs(scoreLeadFromPerspective) < 0.05) {
    return "Even";
  }
  const amount = Math.abs(scoreLeadFromPerspective);
  const formatted =
    Math.abs(amount - Math.round(amount)) < 0.05 ? String(Math.round(amount)) : amount.toFixed(1);
  const sign = scoreLeadFromPerspective >= 0 ? "+" : "-";
  return `${perspectiveSide}${sign}${formatted}`;
}
