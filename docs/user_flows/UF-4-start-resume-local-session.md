---
id: UF-4
name: Start and resume local sessions
last_updated: 2026-05-21
status: ready
---

# UF-4 — Start and resume local sessions

## Goal

Create an in-memory game from a preset, advance it turn-by-turn through the HTTP API, and **re-fetch** authoritative state at any time—whether from the React UI or an external client (curl, script, integration test).

## Actors

- **Primary:** Developer or player using the web UI or API directly
- **Secondary:** `InMemoryGameService` (no database persistence)

## Preconditions

- Backend ready (`GET /health` with `checks.preset_bundle.status: ok`).
- For UI sessions: frontend loaded and ONNX ready before `POST /api/games`.
- Valid `preset_id` and `human_side` (`B` or `W`).

## Steps

### Start (UI)

1. Load presets: `GET /api/presets` and `GET /api/difficulty-presets` (done automatically on app mount).
2. Submit setup form → `POST /api/games` → receive `{ "game_id": "<uuid>" }`.
3. UI stores `game_id` in React state and navigates to the board stage.

### Start (API only)

```bash
curl -s -X POST http://127.0.0.1:8000/api/games \
  -H 'Content-Type: application/json' \
  -d '{"preset_id":"balanced","human_side":"W","difficulty":{"max_visits":6,"top_n":8,"randomness":0.35,"variant_awareness":0.6,"policy_anchor":0.45,"score_anchor":0.1,"temperature":0.35,"blunder_margin":0.04,"global_weight":1.0,"local_weight":0.0}}'
```

### Resume / refresh state

1. `GET /api/games/{game_id}` returns stones, `next_to_move`, `human_side`, `engine_side`, `moves_played`, `last_move`, `status`, and `winner` when finished.
2. **UI:** `BoardView` calls this on mount and after every human move, engine move, or resign.
3. **API client:** Poll or call `GET` after each `POST .../move` or `POST .../engine-move` to stay in sync with server rules.

### Advance play

| Action | Endpoint | Who |
|--------|----------|-----|
| Human stone | `POST /api/games/{id}/move` `{ "move": "Q16" }` | Human side only |
| Engine stone | `POST /api/games/{id}/engine-move` + ONNX body | Browser provider (UI) or test fixture |
| Static eval | `POST /api/games/{id}/analyze` + ONNX body | Optional |
| Human quit | `POST /api/games/{id}/resign` | Human |

### End session

- **UI New game:** `DELETE /api/games/{id}` then return to setup (new `POST /api/games` on next start).
- **Server restart:** All in-memory games are lost; there is no server-side resume after restart.

## Edge Cases

- **Unknown `game_id`:** `404` with `game_not_found`.
- **Wrong turn:** `wrong_turn_human` / `wrong_turn_engine` from API; UI disables clicks when `next_to_move !== human_side`.
- **Tab refresh mid-game:** UI state (`game_id`) is lost unless embedded elsewhere; user must start a new session. API-only clients keep playing if they retain `game_id` until `DELETE` or restart.
- **Stale browser tab:** Another tab’s moves are not synchronized; only one UI instance should own a `game_id`.

## Expected Results

- `POST /api/games` → **201** with UUID.
- `GET /api/games/{id}` reflects every applied move and terminal `status: "finished"` with `winner` when applicable.
- `DELETE /api/games/{id}` → **204**; subsequent `GET` returns 404.
- Full UI loop: setup → play → **New game** without leaking old sessions (best-effort `DELETE` even if backend is down).

## Related Tests

- Integration: `tests/integration/test_api_lifecycle.py`, `tests/integration/test_api_error_paths.py`, `tests/integration/conftest.py` (browser ONNX payloads)
- Unit: `tests/unit/test_game_service.py`
- Deploy smoke: `backend/app/deploy/smoke.py` (create + optional analyze)

## Notes

- “Resume” means **re-query server state**, not long-term save slots. Persistence, accounts, and multi-device sync are out of scope ([specification.md](../../specification.md)).
- See [local-run.md](../development/local-run.md) for the two-terminal startup checklist and [api-reference.md](../api-reference.md) for full request/response examples.
