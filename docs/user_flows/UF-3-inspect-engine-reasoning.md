---
id: UF-3
name: Inspect engine reasoning
last_updated: 2026-05-21
status: ready
---

# UF-3 — Inspect engine reasoning

## Goal

After analysis or an engine move, understand **why** the engine chose a move: position-level evaluation plus a ranked list of alternative candidates.

## Actors

- **Primary:** Human player reviewing the analysis panel
- **Secondary:** `BrowserOnnxProvider` (Kaya `OnnxEngine` + MCTS), backend semantic mapping for analyze/engine-move

## Preconditions

- An active game (`game_id` set) or a loaded position on the board.
- ONNX inference and backend mapping succeed for the current position.

## Steps

### After an engine move (default path)

1. Complete a turn (human click or opening engine move) so `requestEngineMove` runs.
2. The right-hand **Engine reasoning** panel populates automatically.
3. Read **Your win rate** and **Score** (labels are relative to your human color).
4. Review the **candidate comparison** table: rank, GTP move, win rate after that move, score after that move (engine’s perspective).
5. The row matching the played move is marked selected (`data-selected="true"`).

### On demand (no new stone)

1. During an active game, click **Analyze position**.
2. The browser runs a single-position analyze (`OnnxEngine.analyze` → `POST /api/games/{id}/analyze` with raw tensors).
3. The panel shows position win rate and score; candidate rows appear only when the analyze response includes ranked candidates (engine-move path always fills the table).

## Edge Cases

- **Empty panel:** Before any analyze/engine move, placeholder text prompts you to play or analyze.
- **Buttons disabled during turns:** Analyze and Resign are disabled while a human/engine pair is in flight or the game is finished.
- **Engine resignation:** Selected move may be absent; table may still list candidates from the last successful engine response.
- **Timeouts / API errors:** Alert on the board view; reasoning panel may show stale data from the previous turn.

## Expected Results

| UI element | Source |
|------------|--------|
| Your win rate / Score | Kaya value heads + `processAnalysis`, shown from human perspective |
| Candidate table headers | Engine side (`candidatePerspectiveSide` = `engine_side`) |
| Row ordering | `sortCandidatesForDisplay` — best Survival/MCTS outcome first for the engine color |
| Selected move highlight | Matches `selectedMove` from engine-move response |

**API-only metrics:** `POST /analyze` and engine-move responses still include `survival_score`, `metrics.unresolved_count`, and `metrics.min_black_probability` from the ownership head. These are **not** rendered in the default React panel today; integrators and curl clients can read them from JSON (see [api-reference.md](../api-reference.md)).

## Related Tests

- Unit: `frontend/src/features/game/EngineReasoning.test.tsx`, `frontend/src/lib/go/analysisDisplay.test.ts`
- Integration: `tests/integration/test_api_lifecycle.py` (analyze metrics shape), `tests/integration/test_onnx_engine_move_fixtures.py`
- Frontend: `frontend/src/lib/analysis/providers/BrowserOnnxProvider.integration.test.ts` (MCTS panel populated)

## Notes

- Original MVP spec called out `unresolved_count` and `min_black_probability` in the UI; current product surfaces **win rate / score lead** for readability under extreme-komi MCTS. Ownership metrics remain available for API consumers and future UI work.
