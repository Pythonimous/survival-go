import type { ApiStone, CandidateSummary, StoneColor, SurvivalMetrics } from "@/types/api";

export type PositionInput = {
  gameId: string;
  boardSize: number;
  setupStones: readonly ApiStone[];
  moves: readonly { move: string; color: StoneColor }[];
  sideToMove: StoneColor;
};

export type AnalysisResult = {
  policy?: number[];
  pBlack?: number[];
  scoreLead?: number;
  winrate?: number;
  survivalScore: number;
  metrics: SurvivalMetrics;
};

export type CandidateMoveInfo = CandidateSummary;

export type EngineMoveResult = {
  survivalScore: number;
  metrics: SurvivalMetrics;
  candidates: readonly CandidateMoveInfo[];
  move?: string;
  resigned: boolean;
};

export interface AnalysisProvider {
  readonly id: string;
  analyzePosition(input: PositionInput): Promise<AnalysisResult>;
  getCandidateMoves(input: PositionInput): Promise<readonly CandidateMoveInfo[]>;
  requestEngineMove(gameId: string): Promise<EngineMoveResult>;
}
