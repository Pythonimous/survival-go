export type StoneColor = "B" | "W";

export type PresetMetadata = {
  id: string;
  name: string;
  board_size: number;
  initial_player_to_move: StoneColor;
};

export type CreateGamePayload = {
  preset_id: string;
  human_side: StoneColor;
  difficulty?: DifficultyConfig;
};

export type ApiStone = {
  move: string;
  color: StoneColor;
};

export type GameStatus = "active" | "finished";

export type GameState = {
  game_id: string;
  preset_id: string;
  board_size: number;
  human_side: StoneColor;
  engine_side: StoneColor;
  next_to_move: StoneColor;
  moves_played: number;
  last_move: string | null;
  status: GameStatus;
  winner: StoneColor | null;
  difficulty?: DifficultyConfig;
  stones: ApiStone[];
  /** Legal GTP moves for ``next_to_move`` (authoritative from backend rules). */
  legal_moves?: string[];
};

export type DifficultyConfig = {
  max_visits: number;
  top_n: number;
  randomness: number;
  variant_awareness: number;
  policy_anchor: number;
  score_anchor: number;
  temperature: number;
  blunder_margin: number;
  global_weight: number;
  local_weight: number;
};

export type DifficultyPreset = {
  id: string;
  name: string;
  description: string;
  config: DifficultyConfig;
};

export type MoveResponse = GameState & {
  move: string;
};

export type SurvivalMetrics = {
  unresolved_count: number;
  min_black_probability: number;
};

export type CandidateSummary = {
  move: string;
  survival_score: number;
  min_black_probability: number;
};

export type AnalyzeResponse = {
  game_id: string;
  survival_score: number;
  metrics: SurvivalMetrics;
};

export type EngineMoveResponse = MoveResponse & {
  survival_score: number;
  metrics: SurvivalMetrics;
  candidates: CandidateSummary[];
  resigned: boolean;
};
