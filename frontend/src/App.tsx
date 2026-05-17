import { useEffect, useState } from "react";

import BoardView from "./components/BoardView";
import GameSetup from "./components/GameSetup";
import { apiUrl } from "./lib/api";
import type { CreateGamePayload, DifficultyPreset, PresetMetadata } from "./types/api";

const GITHUB_REPO_URL = "https://github.com/Pythonimous/survival-go";

export default function App() {
  const [presets, setPresets] = useState<readonly PresetMetadata[]>([]);
  const [difficultyPresets, setDifficultyPresets] = useState<readonly DifficultyPreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadPresets = async () => {
      try {
        const [presetsResponse, difficultyResponse] = await Promise.all([
          fetch(apiUrl("/api/presets")),
          fetch(apiUrl("/api/difficulty-presets")),
        ]);
        if (!presetsResponse.ok || !difficultyResponse.ok) {
          throw new Error("failed to load presets");
        }
        const body = (await presetsResponse.json()) as PresetMetadata[];
        const difficultyBody = (await difficultyResponse.json()) as DifficultyPreset[];
        if (!active) {
          return;
        }
        setPresets(body);
        setDifficultyPresets(difficultyBody);
      } catch {
        if (!active) {
          return;
        }
        setSetupError("Could not load presets. Please try again.");
      } finally {
        if (active) {
          setPresetsLoading(false);
        }
      }
    };

    void loadPresets();

    return () => {
      active = false;
    };
  }, []);

  const endGameSession = async (activeGameId: string) => {
    try {
      await fetch(apiUrl(`/api/games/${activeGameId}`), { method: "DELETE" });
    } catch {
      // Backend may already be unavailable; still allow leaving the session.
    }
  };

  const handleStart = async (payload: CreateGamePayload) => {
    setSetupError(null);
    if (gameId !== null) {
      await endGameSession(gameId);
    }
    try {
      const response = await fetch(apiUrl("/api/games"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error("failed to create game");
      }
      const body = (await response.json()) as { game_id: string };
      setGameId(body.game_id);
    } catch {
      setSetupError("Could not create game. Please review your setup and try again.");
    }
  };

  const isInSetup = gameId === null;

  return (
    <div className="app-shell">
      <main className={`app ${isInSetup ? "app--setup" : "app--playing"}`}>
        {isInSetup ? (
          <section className="setup-foreground" aria-label="Game setup">
            <h1>Survival KataGo</h1>
            <p>Go training variant focused on total board ownership.</p>
            {presetsLoading ? (
              <p role="status">Loading presets...</p>
            ) : (
              <GameSetup
                presets={presets}
                difficultyPresets={difficultyPresets}
                onStart={handleStart}
              />
            )}
            {setupError && <p role="alert">{setupError}</p>}
          </section>
        ) : (
          <section className="play-foreground" aria-label="Game board stage">
            <h1>Survival KataGo</h1>
            <BoardView
              gameId={gameId}
              onTryAgain={handleStart}
              onNewGame={async () => {
                if (gameId !== null) {
                  await endGameSession(gameId);
                }
                setGameId(null);
              }}
            />
          </section>
        )}
      </main>
      <footer className="app-footer">
        <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
          Source on GitHub
        </a>
      </footer>
    </div>
  );
}
