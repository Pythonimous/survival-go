import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { positionInputFromGameState } from "@/lib/analysis/positionInput";
import { getAnalysisProvider } from "@/lib/analysis/selection";
import { apiUrl } from "@/lib/api/client";
import { readApiFailure } from "@/lib/api/errors";
import {
  formatTurnStatusLabel,
  markerMapFromLastMove,
  signMapFromStones,
} from "@/lib/go/coordinates";
import type {
  CandidateSummary,
  CreateGamePayload,
  GameState,
  SurvivalMetrics,
} from "@/types/api";
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

export default function BoardView({ gameId, onTryAgain, onNewGame }: BoardViewProps) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isTurnInProgress, setIsTurnInProgress] = useState(false);
  const [turnProgressDetail, setTurnProgressDetail] = useState<string | null>(null);
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
    setTurnProgressDetail("Running local ONNX engine inference and candidate search…");
    const body = await getAnalysisProvider().requestEngineMove(gameId);
    setReasoning({
      survivalScore: body.survivalScore,
      metrics: body.metrics,
      candidates: body.candidates,
      selectedMove: body.resigned ? undefined : body.move,
    });
    setTurnProgressDetail("Refreshing board state from backend…");
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
    setTurnProgressDetail("Opening move: running local ONNX engine inference…");
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
          setTurnProgressDetail(null);
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
      setTurnProgressDetail("Submitting your move to backend and waiting for confirmation…");
      await submitHumanMove(move);
      setTurnProgressDetail("Move accepted. Running local ONNX engine response…");
      await requestEngineMove();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not complete turn.",
      );
    } finally {
      setIsTurnInProgress(false);
      setTurnProgressDetail(null);
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
      setTurnProgressDetail("Submitting resignation to backend…");
      await submitHumanResign();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not resign game.");
    } finally {
      setIsTurnInProgress(false);
      setTurnProgressDetail(null);
    }
  };

  const handleAnalyze = async () => {
    if (!gameState) {
      return;
    }
    setErrorMessage(null);
    setIsAnalyzing(true);
    try {
      const body = await getAnalysisProvider().analyzePosition(
        positionInputFromGameState(gameState),
      );
      setReasoning({
        survivalScore: body.survivalScore,
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
            {isTurnInProgress && turnProgressDetail && (
              <p className="turn-progress-detail" role="status" aria-live="polite">
                {turnProgressDetail}
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
                humanSide={gameState.human_side}
                boardSize={gameState.board_size}
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
