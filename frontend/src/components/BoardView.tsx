import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiUrl } from "../lib/api";
import {
  formatTurnStatusLabel,
  markerMapFromLastMove,
  signMapFromStones,
} from "../lib/coordinates";
import type {
  AnalyzeResponse,
  CandidateSummary,
  CreateGamePayload,
  EngineMoveResponse,
  GameState,
  SurvivalMetrics,
} from "../types/api";
import EngineReasoning from "./EngineReasoning";
import GameOverDialog from "./GameOverDialog";
import GobanBoard from "./GobanBoard";

type ReasoningState = {
  survivalScore: number;
  metrics: SurvivalMetrics;
  candidates?: readonly CandidateSummary[];
  selectedMove?: string;
};

type BoardViewProps = {
  gameId: string;
  onTryAgain: (payload: CreateGamePayload) => void;
  onNewGame: () => void;
};

type ApiErrorBody = {
  detail?: string;
};

function readApiError(body: unknown): string | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const maybeError = body as ApiErrorBody;
  return typeof maybeError.detail === "string" ? maybeError.detail : null;
}

async function readApiFailure(response: Response, fallback: string): Promise<never> {
  const errorBody = (await response.json().catch(() => null)) as unknown;
  const apiMessage = readApiError(errorBody);
  throw new Error(apiMessage ?? fallback);
}

export default function BoardView({ gameId, onTryAgain, onNewGame }: BoardViewProps) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isTurnInProgress, setIsTurnInProgress] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [reasoning, setReasoning] = useState<ReasoningState | null>(null);
  const openingEngineHandledRef = useRef(false);
  const openingEngineRequestRef = useRef(0);

  const loadGameState = useCallback(async (): Promise<GameState> => {
    const response = await fetch(apiUrl(`/api/games/${gameId}`));
    if (!response.ok) {
      await readApiFailure(response, "Could not load game state.");
    }
    return (await response.json()) as GameState;
  }, [gameId]);

  useEffect(() => {
    openingEngineHandledRef.current = false;
  }, [gameId]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setErrorMessage(null);
    setGameState(null);

    const loadGame = async () => {
      try {
        const body = await loadGameState();
        if (!active) {
          return;
        }
        setGameState(body);
      } catch (error) {
        if (!active) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : "Could not load game state.");
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadGame();

    return () => {
      active = false;
    };
  }, [loadGameState]);

  const submitHumanResign = async (): Promise<void> => {
    const response = await fetch(apiUrl(`/api/games/${gameId}/resign`), {
      method: "POST",
    });
    if (!response.ok) {
      await readApiFailure(response, "Could not resign game.");
    }
    setGameState(await loadGameState());
  };

  const submitHumanMove = async (move: string): Promise<void> => {
    const response = await fetch(apiUrl(`/api/games/${gameId}/move`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ move }),
    });
    if (!response.ok) {
      await readApiFailure(response, "Could not submit move.");
    }
    setGameState(await loadGameState());
  };

  const requestEngineMove = useCallback(async (): Promise<void> => {
    const response = await fetch(apiUrl(`/api/games/${gameId}/engine-move`), {
      method: "POST",
    });
    if (!response.ok) {
      await readApiFailure(response, "Could not request engine move.");
    }
    const body = (await response.json()) as EngineMoveResponse;
    setReasoning({
      survivalScore: body.survival_score,
      metrics: body.metrics,
      candidates: body.candidates,
      selectedMove: body.resigned ? undefined : body.move,
    });
    setGameState(await loadGameState());
  }, [gameId, loadGameState]);

  useEffect(() => {
    if (isLoading || !gameState || openingEngineHandledRef.current) {
      return;
    }

    const needsOpeningEngine =
      gameState.moves_played === 0 &&
      gameState.next_to_move === gameState.engine_side;
    if (!needsOpeningEngine) {
      openingEngineHandledRef.current = true;
      return;
    }

    const requestId = ++openingEngineRequestRef.current;
    setErrorMessage(null);
    setIsTurnInProgress(true);
    void (async () => {
      try {
        await requestEngineMove();
        if (requestId === openingEngineRequestRef.current) {
          openingEngineHandledRef.current = true;
        }
      } catch (error) {
        if (requestId === openingEngineRequestRef.current) {
          setErrorMessage(
            error instanceof Error ? error.message : "Could not complete opening engine move.",
          );
        }
      } finally {
        if (requestId === openingEngineRequestRef.current) {
          setIsTurnInProgress(false);
        }
      }
    })();

    return () => {
      openingEngineRequestRef.current += 1;
    };
  }, [isLoading, gameState, requestEngineMove]);

  const handleGtpClick = async (coordinate: string) => {
    if (!gameState || gameState.next_to_move !== gameState.human_side || isTurnInProgress) {
      return;
    }
    const move = coordinate.trim().toUpperCase();
    if (move.length === 0) {
      return;
    }
    setErrorMessage(null);
    setIsTurnInProgress(true);
    try {
      await submitHumanMove(move);
      await requestEngineMove();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not complete turn.",
      );
    } finally {
      setIsTurnInProgress(false);
    }
  };

  const handleResign = async () => {
    if (!gameState || isGameFinished) {
      return;
    }
    if (!window.confirm("Resign this game? The engine will win.")) {
      return;
    }
    setErrorMessage(null);
    setIsTurnInProgress(true);
    try {
      await submitHumanResign();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not resign game.");
    } finally {
      setIsTurnInProgress(false);
    }
  };

  const handleAnalyze = async () => {
    setErrorMessage(null);
    setIsAnalyzing(true);
    try {
      const response = await fetch(apiUrl(`/api/games/${gameId}/analyze`), {
        method: "POST",
      });
      if (!response.ok) {
        await readApiFailure(response, "Could not analyze position.");
      }
      const body = (await response.json()) as AnalyzeResponse;
      setReasoning({
        survivalScore: body.survival_score,
        metrics: body.metrics,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not analyze position.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const signMap = useMemo(() => {
    if (!gameState) {
      return undefined;
    }
    return signMapFromStones(gameState.stones, gameState.board_size);
  }, [gameState]);

  const markerMap = useMemo(() => {
    if (!gameState) {
      return undefined;
    }
    return markerMapFromLastMove(gameState.last_move, gameState.board_size);
  }, [gameState]);

  const turnStatusLabel = gameState
    ? formatTurnStatusLabel(
        gameState.next_to_move,
        gameState.human_side,
        gameState.status,
        isTurnInProgress,
      )
    : null;

  const isGameFinished = gameState?.status === "finished";
  const humanWon =
    isGameFinished &&
    gameState?.winner !== null &&
    gameState.winner === gameState.human_side;
  const humanLost =
    isGameFinished &&
    gameState?.winner !== null &&
    gameState.winner === gameState.engine_side;
  const showGameOverDialog = humanWon || humanLost;
  const gameOverOutcome = humanWon ? "human_win" : "human_loss";
  const canHumanPlay =
    gameState !== null &&
    !isGameFinished &&
    gameState.next_to_move === gameState.human_side &&
    !isTurnInProgress;

  if (isLoading) {
    return <p role="status">Loading board...</p>;
  }

  return (
    <section aria-label="Board view">
      {errorMessage && <p role="alert">{errorMessage}</p>}
      {showGameOverDialog && gameState && (
        <GameOverDialog
          outcome={gameOverOutcome}
          onTryAgain={() =>
            onTryAgain({
              preset_id: gameState.preset_id,
              human_side: gameState.human_side,
              difficulty: gameState.difficulty,
            })
          }
        />
      )}
      {gameState && signMap && (
        <div className="play-surface">
          <div className="board-area" aria-label="Board area">
            {turnStatusLabel && (
              <p className="turn-indicator" role="status" aria-live="polite">
                {turnStatusLabel}
              </p>
            )}
            <GobanBoard
              signMap={signMap}
              markerMap={markerMap}
              onGtpClick={canHumanPlay ? handleGtpClick : undefined}
            />
          </div>
          <aside className="analysis-panel" aria-label="Analysis panel">
            <div className="board-controls" aria-label="Move controls">
              <button
                type="button"
                onClick={() => void handleAnalyze()}
                disabled={isAnalyzing || isTurnInProgress || isGameFinished}
              >
                Analyze position
              </button>
              <button
                type="button"
                onClick={() => void handleResign()}
                disabled={isTurnInProgress || isGameFinished}
              >
                Resign
              </button>
              <button type="button" onClick={onNewGame}>
                New game
              </button>
            </div>
            {reasoning ? (
              <EngineReasoning
                survivalScore={reasoning.survivalScore}
                metrics={reasoning.metrics}
                candidates={reasoning.candidates}
                selectedMove={reasoning.selectedMove}
              />
            ) : (
              <p className="analysis-placeholder">
                Analyze a position or play a move to see candidate comparison.
              </p>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
