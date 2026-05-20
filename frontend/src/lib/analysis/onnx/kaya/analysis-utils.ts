// SPDX-License-Identifier: AGPL-3.0-or-later
// Ported from kaya-go/kaya (AGPL-3.0), packages/ai-engine/src/analysis-utils.ts
// Upstream commit: 8fafeac0fedde020c447d931c0b1afdf283edf2a

/**
 * Utility functions for processing AI analysis results.
 */

export interface ProcessedAnalysis {
  currentTurn: "B" | "W";
  blackWinRate: number;
  whiteWinRate: number;
  blackScoreLead: number;
  whiteScoreLead: number;
  leadingPlayer: "B" | "W";
  leadAmount: number;
}

/**
 * Calculate whose turn it is based on move number.
 */
export function calculateCurrentTurn(
  moveNumber: number,
  explicitTurn?: "B" | "W" | null
): "B" | "W" {
  if (explicitTurn) {
    return explicitTurn;
  }

  return moveNumber % 2 === 0 ? "B" : "W";
}

/**
 * Process raw analysis results to get consistent win rates and score leads.
 */
export function processAnalysis(
  scoreLead: number,
  currentTurn: "B" | "W",
  winRate?: number
): ProcessedAnalysis {
  const blackScoreLead = scoreLead;
  const whiteScoreLead = -scoreLead;

  const blackWinRate =
    typeof winRate === "number" && Number.isFinite(winRate)
      ? Math.max(0, Math.min(1, winRate))
      : 0.5 + Math.tanh(blackScoreLead / 20) / 2;
  const whiteWinRate = 1 - blackWinRate;

  const leadingPlayer = blackScoreLead > 0 ? "B" : "W";
  const leadAmount = Math.abs(blackScoreLead);

  return {
    currentTurn,
    blackWinRate,
    whiteWinRate,
    blackScoreLead,
    whiteScoreLead,
    leadingPlayer,
    leadAmount,
  };
}

/**
 * Format win rate as percentage string.
 */
export function formatWinRate(winRate: number): string {
  return `${(winRate * 100).toFixed(1)}%`;
}

/**
 * Format score lead with sign.
 */
export function formatScoreLead(scoreLead: number): string {
  return `${scoreLead > 0 ? "+" : ""}${scoreLead.toFixed(1)}`;
}

/**
 * Get player name with the same marker text used upstream.
 */
export function getPlayerName(player: "B" | "W"): string {
  return player === "B" ? "Black ⚫" : "White ⚪";
}
