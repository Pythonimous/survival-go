---
id: UF-2
name: Kill as Black
last_updated: 2026-05-21
status: ready
---

# UF-2 — Kill as Black

## Goal

Practice driving toward full-board ownership: the human plays **Black** while the engine plays **White** and tries to maximize unresolved points (Survival defender).

## Actors

- **Primary:** Human player (Black)
- **Secondary:** Browser ONNX engine (White), FastAPI backend (rules and game state)

## Preconditions

Same as UF-1: healthy backend, reachable API, ONNX runtime ready, presets loaded.

## Steps

1. Open the app and confirm the ONNX model is ready (setup screen is not blocking **Start game**).
2. Choose a **Preset** (e.g. `black-flavoured` or `balanced`).
3. Under **Your side**, select **Black: take the whole board**.
4. Select **Difficulty** (and optional advanced tuning).
5. Click **Start game** (`POST /api/games` with `human_side: "B"`).
6. If the preset starts with White to move, wait for the automatic opening engine move before clicking.
7. On your turn, click the board to play; each human move triggers an automatic engine response.
8. Continue until game end, **Resign**, or **New game**; use **Analyze position** when you want a static evaluation without advancing the game.

## Edge Cases

- Same runtime/setup failures as UF-1.
- **Engine resignation (White):** White engine resigns when root `min_black_probability` exceeds 99% (position hopeless for White); human Black win dialog.
- Preset default side: changing preset may reset the suggested human side to the preset’s `initial_player_to_move`; override to Black explicitly for this flow.

## Expected Results

- Human moves apply only on Black’s turn; engine replies as White.
- Engine move selection favors candidates that **increase** unresolved ownership / defend Survival (via backend reranking on MCTS outputs).
- Analysis panel updates after each engine move with win rate, score, and candidate rows from the engine’s perspective (UF-3).
- Black “wins” when White cannot preserve unresolved points or White resigns.

## Related Tests

- Unit: `frontend/src/features/game/GameSetup.test.tsx`, `frontend/src/features/game/BoardView.test.tsx` (opening engine move, turn gating)
- Integration: `tests/integration/test_api_lifecycle.py::test_create_game_human_black_starts_with_white_to_move`
- E2E: None yet

## Notes

- Difficulty `max_visits` and `top_n` directly affect engine strength and candidate breadth; see [survival-difficulty-model.md](../development/survival-difficulty-model.md).
