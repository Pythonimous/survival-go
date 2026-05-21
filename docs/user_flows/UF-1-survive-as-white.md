---
id: UF-1
name: Survive as White
last_updated: 2026-05-21
status: ready
---

# UF-1 — Survive as White

## Goal

Practice holding at least one point against Black’s full-board ownership objective: the human plays **White** while the engine plays **Black** and tries to minimize unresolved ownership (Survival attacker).

## Actors

- **Primary:** Human player (White)
- **Secondary:** Browser ONNX engine (Black), FastAPI backend (rules and game state)

## Preconditions

- Backend running (`GET /health` returns `ready: true`).
- Frontend running and able to reach the API (`VITE_API_BASE_URL` in production builds).
- ONNX model artifacts load successfully in the browser (see [onnx-model-artifacts.md](../development/onnx-model-artifacts.md)); **Start game** stays disabled until load/init completes.
- At least one preset is available via `GET /api/presets`.

## Steps

1. Open the app (local default: http://127.0.0.1:5173/).
2. Wait for the analysis runtime banner to show a ready model (or resolve a fallback variant if WebGPU is unavailable).
3. On the setup screen, choose a **Preset** suited to White practice (e.g. `white-flavoured` or `balanced`).
4. Under **Your side**, select **White: make a single living group**.
5. Pick a **Difficulty** preset (`easy`, `normal`, `hard`, `impossible`) or adjust advanced controls (`max_visits`, `top_n`, `variant_awareness`, `temperature`).
6. Click **Start game**. The UI calls `POST /api/games` with `human_side: "W"` and the chosen difficulty config.
7. If the preset’s `initial_player_to_move` is Black, the UI automatically requests an opening **engine move** (browser ONNX → `POST /api/games/{id}/engine-move`).
8. When the turn indicator shows it is your turn, click an empty intersection on the board. The UI posts `POST /api/games/{id}/move`, then immediately requests an engine reply.
9. Repeat human clicks and automatic engine responses until the game ends or you choose **Resign** / **New game**.
10. Optionally use **Analyze position** between turns to inspect the current position without playing a move.

## Edge Cases

- **Start game disabled:** ONNX model still downloading or initializing; pick another variant only if the model picker is shown and load failed for the recommended variant.
- **Opening engine move fails:** Network, timeout, or inference error surfaces in the board alert; game state may be partial until retry or **New game**.
- **Illegal click:** Clicks are ignored when it is not your turn, a turn is in progress, or the game is finished.
- **Engine resignation:** Black engine resigns when root `min_black_probability` falls below 1% (hopeless for Black); White human win dialog appears.
- **Human resignation:** Confirms, then `POST /api/games/{id}/resign`; engine wins.

## Expected Results

- Board shows preset setup stones and updates after each legal human/engine pair.
- Turn indicator alternates between your play and “White is thinking…” / “Black is thinking…” as appropriate.
- After each engine move, the analysis panel shows position win rate, score, and a ranked **candidate comparison** table (see UF-3).
- White “wins” locally when the engine cannot eliminate all unresolved points (or Black resigns); **Game over** dialog offers **Try again** (returns to setup and `DELETE`s the session).

## Related Tests

- Unit: `frontend/src/features/game/GameSetup.test.tsx`, `frontend/src/features/game/BoardView.test.tsx`
- Integration: `tests/integration/test_api_lifecycle.py` (human side follows preset `PL`)
- E2E: None yet (add `@pytest.mark.e2e` coverage when Playwright flows land).

## Notes

- Survival scoring semantics (`unresolved_count`, `min_black_probability`) are computed on the backend for analyze payloads; the default UI panel emphasizes MCTS **win rate** and **score lead** after moves. See [survival-difficulty-model.md](../development/survival-difficulty-model.md).
