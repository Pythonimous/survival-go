import type { GameState } from "@/types/api";
import type { PositionInput } from "@/lib/analysis/types";

export function positionInputFromGameState(gameState: GameState): PositionInput {
  return {
    gameId: gameState.game_id,
    boardSize: gameState.board_size,
    setupStones: gameState.stones,
    moves: [],
    sideToMove: gameState.next_to_move,
  };
}
