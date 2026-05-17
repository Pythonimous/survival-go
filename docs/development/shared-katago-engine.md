# Shared KataGo engine and game sessions

Survival Go uses **one** KataGo analysis subprocess for the whole backend. Every `POST /api/games/{id}/analyze` and `POST /api/games/{id}/engine-move` call goes through the same `KataGoClient`, which holds a `threading.Lock` around stdin/stdout so concurrent HTTP requests cannot interleave queries or mis-match responses.

This applies to local dev, Docker, and any small shared host — not only containers.

## Requests queue under load

Only one KataGo query is in flight at a time. If two browser tabs (or two games) trigger analyze or engine-move at once, the second request **waits in the backend** until the first finishes.

Wall-clock time for a call is roughly:

```text
(queue wait) + (KataGo analysis time)
```

If queue wait plus analysis exceeds **`KATAGO_ANALYSIS_TIMEOUT_SECONDS`**, the API returns a timeout error even though KataGo is still healthy. Under light concurrent load, increase that env var before raising KataGo thread counts in `analysis.cfg`.

Integration tests in `tests/integration/test_shared_katago_games.py` cover two games and concurrent analyze/engine-move on one client without cross-talk.

## One model footprint in RAM

Only **one model** load stays in process memory for all games. The neural network is loaded once when the shared client starts (lazy on first game that needs KataGo). **`delete_game` does not stop KataGo** — it only removes in-memory board state for that `game_id`. The subprocess and model stay loaded so the next game reuses them.

KataGo stops only on **app shutdown** (`shutdown()` on the game service), for example when the uvicorn process exits.

## In-memory games and browser sessions

Game state (board, moves, preset) lives in an in-memory map on the backend. It is **not** tied to a browser tab or WebSocket.

| Action | Effect on server |
|--------|------------------|
| **New game** in the UI | Frontend calls `DELETE /api/games/{id}` for the previous session, then `POST /api/games` for a new one. |
| **Close tab** without New game | No request to the server; the old `game_id` stays in memory as an idle session. |
| **`DELETE /api/games/{id}`** | Drops that game from memory; KataGo keeps running. |
| **Restart backend** (server restart) | Clears all games and stops KataGo. |

Closing a tab without starting a new game does **not** free RAM used by that game’s board state. For long-running shared servers, operators may want periodic restarts or a future cleanup policy; for local dev this is usually negligible.

## API reference

```bash
# End a session explicitly (204 No Content)
curl -X DELETE "http://127.0.0.1:8000/api/games/$GAME_ID"
```

## Related configuration

| Topic | Doc |
|-------|-----|
| Local `analysis.cfg` and install | [katago-wsl-linux.md](katago-wsl-linux.md) |
| Docker thread/timeout tuning | [katago-docker.md](katago-docker.md) |
| Run backend + frontend | [local-run.md](local-run.md) |
