# API Reference

FastAPI backend for Survival Go game state, rules, and Survival semantics. Default local base URL: `http://127.0.0.1:8000`. The React app calls these routes via `frontend/src/lib/api/client.ts` (`VITE_API_BASE_URL` in production builds).

**Source of truth:** route models and handlers in `backend/app/main.py`; stable error codes in `backend/app/errors.py`. Interactive OpenAPI is at `/docs` when the backend is running.

**Related docs:** [architecture](architecture.md), [browser inference design](development/browser-inference-design.md), [Survival difficulty model](development/survival-difficulty-model.md).

## Conventions

- **Coordinates:** GTP strings (`A1`–`T19`, column `I` skipped), row 1 at the bottom — same as sgfmill/Shudan.
- **Colors:** `"B"` (Black) or `"W"` (White).
- **Inference boundary:** `POST /analyze` and `POST /engine-move` require **browser ONNX raw tensors** in the JSON body. There is no server-side KataGo inference path.
- **Raw tensor shapes (19×19):** `policy` length `2172` (`362` moves × `6` heads), `ownership` length `361`, optional `value` length `3`, optional `miscvalue` length `10`. Ownership values are logits in `[-1, 1]` before the backend maps them to `p_black` in `[0, 1]`.
- **Errors:** Failures return `{"detail": {"code": "<machine_code>", "message": "<human text>"}}`. Stable codes include `game_not_found`, `illegal_move`, `wrong_turn_human`, `wrong_turn_engine`, `invalid_policy_length`, `validation_error`, and others in `backend/app/errors.py`.
- **Abuse limits (public deploys):** Write routes are rate-limited per client IP (nginx on Docker/VM, FastAPI middleware as safety net). Responses use **429** (`rate_limited`), **413** (`payload_too_large`), or **503** (`too_many_games`) when limits are exceeded. Tune via env vars in [environment.md](development/environment.md).

## `GET /health`

Readiness probe: settings validation and preset SGF bundle load. Returns **503** when not ready.

```json
{
  "status": "ok",
  "service": "survival-go",
  "ready": true,
  "checks": {
    "settings": { "status": "ok", "message": null, "detail": null },
    "preset_bundle": {
      "status": "ok",
      "message": null,
      "detail": { "preset_count": 3 }
    }
  }
}
```

## `GET /api/presets`

List opening positions (setup stones only, no moves in SGF).

```json
[
  {
    "id": "balanced",
    "name": "Balanced",
    "board_size": 19,
    "initial_player_to_move": "B"
  },
  {
    "id": "black-flavoured",
    "name": "Black-flavoured",
    "board_size": 19,
    "initial_player_to_move": "B"
  },
  {
    "id": "white-flavoured",
    "name": "White-flavoured",
    "board_size": 19,
    "initial_player_to_move": "W"
  }
]
```

## `GET /api/difficulty-presets`

Named difficulty bundles (`easy`, `normal`, `hard`, `impossible`) used by the UI and `POST /api/games`.

```json
[
  {
    "id": "normal",
    "name": "Normal",
    "description": "Balanced play blending objective strength and plausible variety.",
    "config": {
      "max_visits": 6,
      "top_n": 8,
      "randomness": 0.35,
      "variant_awareness": 0.6,
      "policy_anchor": 0.45,
      "score_anchor": 0.1,
      "temperature": 0.35,
      "blunder_margin": 0.04,
      "global_weight": 1.0,
      "local_weight": 0.0
    }
  }
]
```

(Response is a four-element array; example shows one preset.)

## `POST /api/games`

Create an in-memory game session. **201** on success.

**Request**

```json
{
  "preset_id": "balanced",
  "human_side": "W",
  "difficulty": {
    "max_visits": 6,
    "top_n": 8,
    "randomness": 0.35
  }
}
```

`difficulty` is optional; omitted fields use the `normal` preset defaults. `human_side` is the color the human plays; the engine takes the opposite side.

**Response**

```json
{ "game_id": "550e8400-e29b-41d4-a716-446655440000" }
```

## `GET /api/games/{game_id}`

Fetch current board, turn, legality, and outcome state.

```json
{
  "game_id": "550e8400-e29b-41d4-a716-446655440000",
  "preset_id": "balanced",
  "board_size": 19,
  "human_side": "W",
  "engine_side": "B",
  "next_to_move": "W",
  "moves_played": 0,
  "last_move": null,
  "status": "active",
  "winner": null,
  "difficulty": {
    "max_visits": 6,
    "top_n": 8,
    "randomness": 0.35,
    "variant_awareness": 0.6,
    "policy_anchor": 0.45,
    "score_anchor": 0.1,
    "temperature": 0.35,
    "blunder_margin": 0.04,
    "global_weight": 1.0,
    "local_weight": 0.0
  },
  "stones": [
    { "vertex": "D4", "color": "B" },
    { "vertex": "Q16", "color": "W" }
  ],
  "legal_moves": ["C3", "C4", "C5"]
}
```

`stones` and `legal_moves` are abbreviated in the example. **404** if `game_id` is unknown.

## `DELETE /api/games/{game_id}`

Drop session state. **204** with empty body on success; **404** if missing.

## `POST /api/games/{game_id}/move`

Apply the human's move when it is their turn.

**Request**

```json
{ "move": "D4" }
```

**Response** — same fields as game state, plus the played move:

```json
{
  "game_id": "550e8400-e29b-41d4-a716-446655440000",
  "preset_id": "balanced",
  "board_size": 19,
  "human_side": "W",
  "engine_side": "B",
  "next_to_move": "B",
  "moves_played": 1,
  "last_move": "D4",
  "status": "active",
  "winner": null,
  "difficulty": { "max_visits": 6, "top_n": 8, "randomness": 0.35 },
  "stones": [],
  "legal_moves": [],
  "move": "D4"
}
```

**400** examples: `illegal_move` (occupied or ko/rule violation), `wrong_turn_human` (engine's turn), `game_finished`.

## `POST /api/games/{game_id}/resign`

Human resigns; game becomes `finished` with the engine as winner.

```json
{
  "game_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "finished",
  "winner": "B",
  "human_side": "W",
  "engine_side": "B"
}
```

(Other game-state fields are included as in `GET`.)

## `POST /api/games/{game_id}/analyze`

Interpret **raw ONNX outputs** for the current position. The browser runs inference; Python maps tensors to Survival metrics and optional decoded heads.

**Request** — arrays may be omitted in examples; production payloads must match the lengths above.

```json
{
  "raw_model_outputs": {
    "policy": [0.0],
    "ownership": [-0.2, 1.0, 1.0],
    "value": [0.1, -0.2, 0.3],
    "miscvalue": [0.0, 0.0, -0.02, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
  }
}
```

**Response**

```json
{
  "game_id": "550e8400-e29b-41d4-a716-446655440000",
  "survival_score": 1,
  "metrics": {
    "unresolved_count": 1,
    "min_black_probability": 0.4
  },
  "policy": [0.001, 0.002],
  "p_black": [0.4, 0.99, 0.99],
  "score_lead": -12.5,
  "winrate": 0.338
}
```

`policy` and `p_black` are full-length arrays in real responses (`2172` and `361`). `survival_score` equals `metrics.unresolved_count` (points with `p_black < SURVIVAL_THRESHOLD`, default `0.95`). See [survival-difficulty-model.md](development/survival-difficulty-model.md). Empty body → **422** `validation_error`.

## `POST /api/games/{game_id}/engine-move`

Select and apply the engine move from browser MCTS candidates. Each candidate carries its own raw tensors for reranking.

**Request**

```json
{
  "browser_engine_move": {
    "position_raw": {
      "policy": [0.0],
      "ownership": [-0.2, 1.0, 1.0],
      "value": [0.1, -0.2, 0.3],
      "miscvalue": [0.0, 0.0, -0.02, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    },
    "candidates": [
      {
        "move": "Q10",
        "policy_prob": 0.42,
        "raw_model_outputs": {
          "policy": [0.0],
          "ownership": [0.5, 1.0, 1.0],
          "value": [0.2, 0.0, 0.1],
          "miscvalue": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
        }
      }
    ]
  }
}
```

**Response** — game state after the engine move, plus analysis fields:

```json
{
  "game_id": "550e8400-e29b-41d4-a716-446655440000",
  "move": "Q10",
  "status": "active",
  "next_to_move": "W",
  "survival_score": 0,
  "metrics": {
    "unresolved_count": 0,
    "min_black_probability": 0.5
  },
  "candidates": [
    {
      "move": "Q10",
      "survival_score": 0,
      "min_black_probability": 0.5,
      "winrate": 0.55,
      "score_lead": -3.2
    }
  ],
  "resigned": false,
  "winrate": 0.55,
  "score_lead": -3.2
}
```

When the engine resigns (Black ownership floor below 1% for Black engine, or above 99% for White engine), `resigned` is `true`, `move` is `""`, `status` is `finished`, and `winner` reflects the outcome:

```json
{
  "move": "",
  "resigned": true,
  "status": "finished",
  "winner": "B",
  "candidates": []
}
```

## Typical session flow

```text
GET  /api/presets
GET  /api/difficulty-presets
POST /api/games
GET  /api/games/{id}
POST /api/games/{id}/move              # human
POST /api/games/{id}/analyze           # optional; browser ONNX → metrics
POST /api/games/{id}/engine-move       # browser MCTS + ONNX → apply engine move
… repeat move / engine-move …
POST /api/games/{id}/resign            # optional
DELETE /api/games/{id}                 # optional cleanup
```
