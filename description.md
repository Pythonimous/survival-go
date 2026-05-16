Below is a **draft `specification.md`** for the project. I’m writing it as a real architecture/spec-driven-development document, not as a tiny coding prompt.

You can later split this into:

```text
docs/specification.md
docs/TODO.md
docs/katago-notes.md
docs/presets.md
```

---

# Survival Go Engine — Specification

## 1. Project Summary

This project is a local-first web prototype for a Go variant/training tool built around a “total board ownership” objective.

The core idea is to use KataGo’s existing Go understanding, especially its ownership predictions, and reinterpret them for a custom objective:

```text
Black succeeds if Black can eventually own/control 100% of the board.
White succeeds if White can prevent Black from achieving 100% board ownership.
```

In normal 19x19 Go terms:

```text
Black win condition: all 361 points are Black-owned.
White win condition: at least one point remains not Black-owned.
```

The project is not intended to train a new neural network initially. Instead, it will wrap KataGo in analysis mode, extract candidate moves and ownership estimates, and apply a custom Survival Go evaluator on top.

The first version is a local web app where a human can play either side against an engine.

---

# 2. Product Goals

## 2.1 Primary Goal

Build a working local-first prototype that allows a user to play from one of several predefined 19x19 positions under the Survival Go objective.

The prototype should answer:

```text
Can a human survive as White?
Can a human kill as Black?
How does KataGo’s normal Go understanding behave when re-scored through the Survival Go objective?
```

## 2.2 Secondary Goal

Create a prototype that can later be shown to Go players, teachers, or Nihon Ki-in contacts for feedback.

The application should eventually be understandable and usable by non-developer Go players, but the first milestone prioritizes correctness and local functionality over polish.

## 2.3 Non-Goals for MVP

The MVP does **not** include:

```text
- training or fine-tuning KataGo
- custom neural networks
- public cloud deployment
- multiplayer
- SGF database management
- user accounts
- persistent game history
- mobile optimization
- custom MCTS from scratch
- multi-board-size support
- 9x9 or 13x13
- arbitrary board editor
```

These can be considered later only after the local prototype works.

---

# 3. Core Game Concept

## 3.1 Standard Board

Only 19x19 is supported.

```text
Board size: 19x19
Total points: 361
```

No other board size should be implemented in v1.

## 3.2 Survival Go Objective

The game is interpreted as an asymmetric control problem.

```text
Black objective:
    Force eventual ownership of every board point.

White objective:
    Prevent Black from owning every board point.
```

In evaluator terms:

```text
Black wants unresolved_count == 0.
White wants unresolved_count > 0.
```

Where `unresolved_count` means the number of board points whose predicted Black ownership probability is below a configured threshold.

## 3.3 Important Interpretation

This is not normal score maximization.

In normal Go, winning by 0.5 points and winning by 200 points are both wins.

In this variant, Black winning almost everything is still failure if White preserves even one alive point, seki-like unresolved point, or unsettled region.

Therefore, KataGo’s standard winrate/scoreLead should not be trusted as the primary objective.

Instead, the engine should primarily rely on ownership-derived metrics.

---

# 4. User Modes

The first version supports human-vs-engine only.

## 4.1 Human as White: “Can You Survive?”

```text
Human: White
Engine: Black
Human goal: keep at least one point not Black-owned
Engine goal: force total Black ownership
```

This is likely the main training mode.

## 4.2 Human as Black: “Can You Kill?”

```text
Human: Black
Engine: White
Human goal: force total Black ownership
Engine goal: preserve at least one non-Black-owned point
```

This mode is also important because players need to practice both sides of the concept.

## 4.3 Excluded for MVP

```text
- human vs human
- engine vs engine
- online play
- ranked play
- full review mode
```

---

# 5. Presets

## 5.1 Preset Philosophy

The game does not start from an empty board in MVP.

Instead, the user selects from three predefined 19x19 starting positions.

Each preset represents a different estimated survival difficulty.

Example conceptual categories:

```text
Preset 1: White survival likely with correct play
Preset 2: unclear / balanced
Preset 3: Black kill likely with correct play
```

Exact positions will be defined later.

## 5.2 Preset Storage Format

Presets should be stored as JSON files.

Example path:

```text
backend/app/presets/preset_easy_white_survival.json
backend/app/presets/preset_balanced.json
backend/app/presets/preset_black_favored.json
```

## 5.3 Preset JSON Schema

Initial schema:

```json
{
  "id": "easy_white_survival_001",
  "name": "Easy White Survival",
  "description": "White is expected to survive with correct play.",
  "board_size": 19,
  "initial_player_to_move": "W",
  "difficulty_label": "white_favored",
  "expected_result": "white_survival_likely",
  "stones": [
    { "color": "B", "point": "D4" },
    { "color": "W", "point": "Q16" }
  ],
  "notes": "Optional human-readable notes about the intended lesson."
}
```

## 5.4 Preset Requirements

Each preset must satisfy:

```text
- board_size must be 19
- all points must be legal Go coordinates
- no duplicate occupied points
- colors must be B or W
- initial_player_to_move must be B or W
- expected_result must be metadata only, not hardcoded game logic
```

---

# 6. KataGo Integration

## 6.1 KataGo as Local Dependency

KataGo is not a paid API.

It is a local open-source engine binary.

The app will launch KataGo as a subprocess and communicate with it through stdin/stdout using KataGo’s analysis mode.

Conceptually:

```text
FastAPI backend
    ↓
Python subprocess wrapper
    ↓
KataGo binary
    ↓
JSON analysis response
```

## 6.2 Expected Local Dependencies

The developer machine should have:

```text
- WSL2
- Ubuntu inside WSL
- Python 3.11+
- Node.js LTS
- KataGo Linux binary
- KataGo neural net model file
- KataGo analysis config file
```

## 6.3 WSL Development Model

Recommended development setup:

```text
Windows host
VS Code UI
Remote - WSL extension
Project repo inside WSL filesystem
Python backend running inside WSL
React frontend running inside WSL
KataGo Linux binary running inside WSL
```

Avoid placing the repo under `/mnt/c/...` if possible, because file I/O is usually smoother inside the Linux filesystem.

Recommended location:

```text
~/projects/survival-go
```

## 6.4 KataGo Wrapper Responsibilities

The backend should isolate all KataGo communication behind a wrapper module.

Suggested module:

```text
backend/app/katago/client.py
```

Responsibilities:

```text
- launch KataGo subprocess
- send JSON analysis requests
- receive JSON responses
- parse ownership arrays
- parse candidate move information
- handle startup errors
- handle timeout errors
- restart KataGo if subprocess dies
- expose a clean Python interface to the rest of the app
```

## 6.5 Important Ownership Sign Convention

The project must not assume ownership semantics blindly.

A setup validation task must empirically confirm how KataGo’s ownership array maps to Black/White ownership for the chosen analysis mode and config.

Acceptance test:

```text
Given a simple board position with an obviously Black-controlled corner,
when KataGo returns ownership values,
then the wrapper must correctly convert them into p_black values in [0, 1].
```

The internal evaluator should only consume:

```python
p_black: list[float]  # length 361, each value in [0.0, 1.0]
```

It should not consume raw KataGo ownership values directly.

---

# 7. Survival Evaluator

## 7.1 Purpose

The Survival evaluator converts KataGo ownership estimates into metrics relevant to the custom objective.

Suggested module:

```text
backend/app/engine/evaluator.py
```

## 7.2 Input

```python
class OwnershipEvaluationInput:
    board_size: int
    p_black: list[float]
    threshold: float
```

For v1:

```text
board_size must always be 19
len(p_black) must always be 361
```

## 7.3 Core Metrics

The evaluator should compute:

```text
min_black_probability
unresolved_count
resolved_count
mean_black_probability
ownership_entropy
largest_uncertain_region_size
```

## 7.4 Definitions

### `min_black_probability`

The weakest point of Black ownership.

```python
min(p_black)
```

This is useful because Black needs every point.

### `unresolved_count`

Number of points below the Black ownership threshold.

```python
sum(p < threshold for p in p_black)
```

Example:

```text
threshold = 0.95
unresolved_count = number of points where Black ownership confidence is below 95%
```

### `resolved_count`

```python
361 - unresolved_count
```

### `mean_black_probability`

Average predicted Black ownership over all points.

Useful as a coarse metric, but not sufficient by itself.

### `ownership_entropy`

Measures uncertainty.

For each point:

```python
entropy(p) = -p*log(p) - (1-p)*log(1-p)
```

Then sum or average across board points.

### `largest_uncertain_region_size`

Create a mask:

```python
uncertain = p_black < threshold
```

Then compute connected components using 4-neighbor grid connectivity.

The largest component size estimates the largest surviving/unresolved region.

## 7.5 Main Evaluation Score

The MVP should start with a simple scalar score:

```text
survival_score = unresolved_count
```

Interpretation:

```text
Higher survival_score is better for White.
Lower survival_score is better for Black.
```

Therefore:

```text
Black engine chooses move minimizing survival_score.
White engine chooses move maximizing survival_score.
```

## 7.6 Future Evaluation Improvements

Later versions may include a weighted score:

```text
survival_score =
    unresolved_count_weight * unresolved_count
  + largest_region_weight * largest_uncertain_region_size
  + entropy_weight * ownership_entropy
  - min_black_probability_weight * min_black_probability
```

But MVP should avoid overengineering.

Start with unresolved count.

---

# 8. Engine Move Selection

## 8.1 Engine Strategy

The engine does not initially implement its own deep MCTS.

Instead, it asks KataGo for candidate moves, then reranks those candidates using the Survival evaluator.

Conceptually:

```text
Current position
    ↓
Ask KataGo for candidate moves
    ↓
For each candidate:
    estimate resulting ownership
    compute Survival score
    ↓
Choose move according to side objective
```

## 8.2 Engine Side Logic

When engine plays Black:

```text
choose candidate with lowest survival_score
```

When engine plays White:

```text
choose candidate with highest survival_score
```

## 8.3 Candidate Move Source

KataGo candidate moves should be taken from analysis output.

The exact implementation depends on the response shape, but the wrapper should expose normalized candidate objects.

Suggested internal model:

```python
class CandidateMove:
    move: str
    katago_policy: float | None
    katago_order: int | None
    katago_score_lead: float | None
    katago_winrate: float | None
    p_black_after: list[float] | None
    survival_score: float | None
    survival_metrics: dict
```

## 8.4 First Implementation Approach

For MVP, use a simple and robust approach:

```text
1. Ask KataGo for top N candidate moves.
2. For each candidate:
   - apply candidate to internal board state
   - ask KataGo for ownership after that candidate
   - evaluate ownership
3. Pick best candidate under Survival objective.
```

This is slower than using deeper integrated analysis, but easier to reason about and debug.

## 8.5 Candidate Limit

Initial candidate limit:

```text
top_n = 8
```

Configurable later.

## 8.6 Pass Handling

Pass should be supported eventually, but MVP can treat pass conservatively.

Initial behavior:

```text
- allow pass if KataGo returns pass as candidate
- do not force pass before game conclusion
- log pass candidates clearly
```

A later rules layer can decide formal game termination.

---

# 9. Game State and Rules

## 9.1 Internal Board State

Suggested module:

```text
backend/app/engine/board.py
```

The backend should maintain the current game state independently of KataGo.

The board state should include:

```python
class GameState:
    board_size: int
    stones: dict[str, str]  # point -> color
    player_to_move: str     # "B" or "W"
    move_history: list[MoveRecord]
    preset_id: str
```

## 9.2 Coordinates

Use standard Go coordinates externally:

```text
A1 through T19, skipping I
```

Internal representation can use row/column indexes, but API responses should use human-readable Go coordinates.

## 9.3 Captures and Legality

The backend should not rely on the frontend for legal move enforcement.

The backend must validate:

```text
- point is on board
- point is empty
- move is legal under basic Go capture rules
- suicide is handled according to selected rule config
- ko is handled or explicitly postponed
```

## 9.4 MVP Rule Simplification

For the first working version, it is acceptable to use a minimal legal move implementation, but the spec must make limitations explicit.

Recommended MVP rule target:

```text
- 19x19 board
- stone placement
- group liberty detection
- captures
- suicide prevention
- simple ko tracking if feasible
```

Superko can be postponed.

## 9.5 Rule Set

Use Chinese-style area intuition for conceptual framing, but the engine’s actual move legality should be simple and explicit.

MVP does not need full scoring under Chinese/Japanese rules because the Survival objective is based on ownership estimates, not final territory scoring.

---

# 10. Backend API

## 10.1 Backend Stack

```text
FastAPI
Python 3.11+
Pydantic
pytest
```

## 10.2 Suggested Backend Structure

```text
backend/
  app/
    main.py
    api/
      routes.py
      schemas.py
    engine/
      board.py
      evaluator.py
      move_selector.py
      coordinates.py
    katago/
      client.py
      config.py
      models.py
    presets/
      loader.py
      preset_easy_white_survival.json
      preset_balanced.json
      preset_black_favored.json
    settings.py
  tests/
    unit/
    integration/
```

## 10.3 API Endpoints

### `GET /health`

Checks backend availability.

Response:

```json
{
  "status": "ok"
}
```

### `GET /api/presets`

Returns available starting presets.

Response:

```json
{
  "presets": [
    {
      "id": "easy_white_survival_001",
      "name": "Easy White Survival",
      "description": "White is expected to survive with correct play.",
      "difficulty_label": "white_favored"
    }
  ]
}
```

### `POST /api/games`

Starts a new game from a preset.

Request:

```json
{
  "preset_id": "easy_white_survival_001",
  "human_color": "W",
  "engine_strength": "normal"
}
```

Response:

```json
{
  "game_id": "local-game-id",
  "board_size": 19,
  "player_to_move": "W",
  "human_color": "W",
  "engine_color": "B",
  "stones": [
    { "color": "B", "point": "D4" }
  ],
  "latest_evaluation": {
    "threshold": 0.95,
    "unresolved_count": 42,
    "min_black_probability": 0.31,
    "largest_uncertain_region_size": 18
  }
}
```

### `GET /api/games/{game_id}`

Returns current game state.

### `POST /api/games/{game_id}/move`

Applies a human move.

Request:

```json
{
  "move": "Q16"
}
```

Response:

```json
{
  "game_id": "local-game-id",
  "move_applied": {
    "color": "W",
    "move": "Q16"
  },
  "board": {
    "stones": []
  },
  "next_player_to_move": "B",
  "latest_evaluation": {
    "unresolved_count": 54,
    "min_black_probability": 0.22
  }
}
```

### `POST /api/games/{game_id}/engine-move`

Asks the engine to play its move.

Response:

```json
{
  "engine_move": {
    "color": "B",
    "move": "R17"
  },
  "candidate_moves": [
    {
      "move": "R17",
      "survival_score": 31,
      "katago_policy": 0.12
    },
    {
      "move": "C3",
      "survival_score": 44,
      "katago_policy": 0.09
    }
  ],
  "latest_evaluation": {
    "unresolved_count": 31,
    "min_black_probability": 0.41,
    "largest_uncertain_region_size": 9
  }
}
```

### `POST /api/games/{game_id}/analyze`

Returns current Survival evaluation without playing a move.

Useful for debugging and UI display.

---

# 11. Frontend

## 11.1 Frontend Stack

```text
React
TypeScript
Vite
```

## 11.2 Frontend Goals

The frontend should provide:

```text
- preset selection
- side selection: play as Black or White
- 19x19 board display
- clickable legal moves
- current player indicator
- engine move button or automatic engine response
- basic evaluation panel
- candidate move/debug panel for developer mode
```

## 11.3 Suggested Frontend Structure

```text
frontend/
  src/
    api/
      client.ts
    components/
      Board.tsx
      PresetSelector.tsx
      EvaluationPanel.tsx
      CandidateMovesPanel.tsx
      GameControls.tsx
    types/
      api.ts
    App.tsx
```

## 11.4 Board UI

The board should:

```text
- render a 19x19 grid
- show black and white stones
- allow clicking empty intersections
- prevent obvious invalid clicks client-side
- rely on backend for final validation
```

## 11.5 Evaluation Display

Show at minimum:

```text
Unresolved points
Minimum Black ownership
Largest uncertain region
Current interpretation:
    "White currently has survival chances"
    or
    "Black is close to total control"
```

Avoid overclaiming “perfect play” in the UI.

Use language like:

```text
Based on current KataGo ownership estimates...
```

not:

```text
Objectively winning
```

---

# 12. Configuration

## 12.1 Backend Config

Use environment variables or a `.env` file.

Example:

```env
KATAGO_BINARY_PATH=/home/kirill/tools/katago/katago
KATAGO_CONFIG_PATH=/home/kirill/tools/katago/analysis_config.cfg
KATAGO_MODEL_PATH=/home/kirill/tools/katago/model.bin.gz
SURVIVAL_THRESHOLD=0.95
KATAGO_TOP_N=8
KATAGO_ANALYSIS_TIMEOUT_SECONDS=20
```

## 12.2 Engine Strength Presets

Initial engine strength can be basic.

Example:

```python
ENGINE_STRENGTHS = {
    "fast": {
        "top_n": 4,
        "max_visits": 64,
        "threshold": 0.90
    },
    "normal": {
        "top_n": 8,
        "max_visits": 128,
        "threshold": 0.95
    },
    "strong": {
        "top_n": 12,
        "max_visits": 256,
        "threshold": 0.97
    }
}
```

Exact KataGo parameters may need adjustment after integration.

---

# 13. Testing Strategy

## 13.1 Unit Tests

Required unit test areas:

```text
- coordinate conversion
- preset validation
- board placement
- capture detection
- suicide detection
- ownership conversion
- unresolved_count calculation
- entropy calculation
- uncertain region connected components
- move selector side logic
```

## 13.2 Integration Tests

Integration tests should cover:

```text
- backend starts
- preset can be loaded
- game can be created
- human move can be applied
- KataGo subprocess can be launched
- KataGo can return ownership for a simple position
- engine can choose one legal move
```

KataGo integration tests may be marked separately because they require local binary/model setup.

Example:

```text
pytest tests/integration --katago
```

## 13.3 Manual Smoke Test

A full smoke test should verify:

```text
1. Start backend.
2. Start frontend.
3. Open local web app.
4. Select preset.
5. Choose human side.
6. Play legal move.
7. Engine responds.
8. Evaluation panel updates.
9. Candidate move panel shows engine reasoning.
```

---

# 14. Observability and Debugging

## 14.1 Logging

Backend should log:

```text
- KataGo startup
- KataGo request IDs
- analysis timeout/errors
- selected engine candidate
- rejected candidates if any
- survival metrics before and after move
```

## 14.2 Developer Debug Panel

The frontend should eventually expose a debug panel showing:

```text
- KataGo top candidate moves
- Survival score per candidate
- KataGo policy/winrate/scoreLead if available
- chosen move
- reason selected
```

This is important because the core project is experimental. The user needs to see whether the engine is making Survival-Go-relevant choices or just normal-Go-looking moves.

---

# 15. MVP Milestones

## Milestone 0 — Local KataGo Smoke Test

Goal:

```text
Python can launch KataGo and retrieve ownership for a 19x19 position.
```

Acceptance criteria:

```text
- KataGo binary path is configurable.
- Python subprocess starts KataGo successfully.
- Backend sends one analysis request.
- Backend receives one valid response.
- Ownership array is parsed.
- Ownership is converted into p_black format.
- A 19x19 ownership grid can be printed in terminal.
```

## Milestone 1 — Evaluator Library

Goal:

```text
Ownership estimates can be converted into Survival Go metrics.
```

Acceptance criteria:

```text
- p_black arrays are validated.
- unresolved_count works.
- min_black_probability works.
- entropy works.
- largest_uncertain_region_size works.
- tests cover artificial ownership arrays.
```

## Milestone 2 — Preset Loader and Board Rules

Goal:

```text
The backend can load fixed 19x19 starting positions and apply legal moves.
```

Acceptance criteria:

```text
- JSON presets load correctly.
- Invalid presets are rejected.
- Board state initializes from preset.
- Human moves can be applied.
- Captures work.
- Illegal occupied-point moves are rejected.
- Basic suicide prevention works.
```

## Milestone 3 — FastAPI Game API

Goal:

```text
The app exposes game creation, move, engine move, and analysis endpoints.
```

Acceptance criteria:

```text
- GET /health works.
- GET /api/presets works.
- POST /api/games works.
- POST /api/games/{game_id}/move works.
- POST /api/games/{game_id}/engine-move works.
- API schemas are typed and documented.
```

## Milestone 4 — Engine Move Reranking

Goal:

```text
The engine can choose moves according to the Survival objective.
```

Acceptance criteria:

```text
- KataGo provides candidate moves.
- Backend evaluates candidate resulting positions.
- Black chooses lowest survival_score.
- White chooses highest survival_score.
- Candidate diagnostics are returned.
```

## Milestone 5 — React Board UI

Goal:

```text
A user can play from a preset in the browser.
```

Acceptance criteria:

```text
- User can select preset.
- User can choose to play Black or White.
- Board renders initial position.
- User can click a legal move.
- Engine can respond.
- Evaluation panel updates.
- Basic errors are displayed clearly.
```

## Milestone 6 — Local Playtest Build

Goal:

```text
The prototype is usable enough for local playtesting and feedback.
```

Acceptance criteria:

```text
- Setup instructions exist.
- One command starts backend.
- One command starts frontend.
- Three presets are available.
- Basic play loop works reliably.
- Known limitations are documented.
```

---

# 16. Technical Risks

## 16.1 KataGo Integration Complexity

Risk:

```text
KataGo analysis mode may require careful request formatting, config paths, and subprocess handling.
```

Mitigation:

```text
Start with Milestone 0 only.
Do not build frontend before KataGo smoke test works.
Keep wrapper isolated.
```

## 16.2 Ownership Semantics Confusion

Risk:

```text
Raw KataGo ownership values may be misinterpreted.
```

Mitigation:

```text
Add explicit ownership conversion tests.
Validate using simple known positions.
Never let evaluator consume raw ownership directly.
```

## 16.3 Normal-Go Policy Bias

Risk:

```text
KataGo’s candidate moves may omit strange Survival-Go moves because its policy was trained for normal Go.
```

Mitigation:

```text
Use larger top_n if needed.
Add optional legal move probing later.
Expose candidate diagnostics.
Treat MVP as experimental.
```

## 16.4 Runtime Performance

Risk:

```text
Evaluating multiple candidate moves may be slow because each candidate may require a separate KataGo analysis call.
```

Mitigation:

```text
Use small top_n initially.
Cache analysis for repeated positions.
Start local-first.
Delay public deployment.
```

## 16.5 Rule Implementation Bugs

Risk:

```text
Go rules are easy to implement incorrectly.
```

Mitigation:

```text
Keep rule scope small.
Write tests for captures/liberties.
Consider using an existing Python Go rules library later if needed.
```

---

# 17. Initial Repository Layout

Recommended:

```text
survival-go/
  README.md
  docs/
    specification.md
    TODO.md
    katago-setup.md
  backend/
    pyproject.toml
    app/
      main.py
      settings.py
      api/
        __init__.py
        routes.py
        schemas.py
      engine/
        __init__.py
        board.py
        coordinates.py
        evaluator.py
        move_selector.py
      katago/
        __init__.py
        client.py
        config.py
        models.py
      presets/
        loader.py
        preset_white_favored.json
        preset_balanced.json
        preset_black_favored.json
    tests/
      unit/
      integration/
  frontend/
    package.json
    vite.config.ts
    src/
      App.tsx
      api/
        client.ts
      components/
        Board.tsx
        PresetSelector.tsx
        EvaluationPanel.tsx
        CandidateMovesPanel.tsx
      types/
        api.ts
```

---

# 18. Development Order

The project should be developed in this order:

```text
1. KataGo smoke test
2. Ownership conversion
3. Survival evaluator
4. Preset loader
5. Board/rules engine
6. FastAPI API
7. Engine move reranking
8. React board UI
9. Local playtest
```

Do not start with UI.

Do not start with deployment.

Do not start with full game rules.

The first serious success condition is:

```text
A Python script prints a 19x19 ownership map from KataGo.
```

Everything else depends on that.

---

# 19. MVP Definition of Done

The MVP is done when:

```text
- the app runs locally in WSL
- the backend can talk to KataGo
- three JSON presets can be loaded
- the user can play as either Black or White
- the engine responds using Survival objective reranking
- the board updates correctly
- the evaluation panel shows Survival metrics
- the app is usable enough for a Go player to test locally or via screen share
```

The MVP does not need to prove perfect play.

The MVP needs to prove that the architecture works and that the Survival objective produces interesting move choices.

---

# 20. Recommended First Implementation Target

Before creating the full app, implement this script:

```text
backend/scripts/katago_smoke_test.py
```

It should:

```text
1. Read KataGo paths from config/env.
2. Launch KataGo.
3. Send an empty or preset board position.
4. Request analysis.
5. Parse ownership.
6. Convert to p_black.
7. Print:
   - min_black_probability
   - unresolved_count
   - largest_uncertain_region_size
   - ASCII 19x19 heatmap
```

This is the true first milestone.

Once this works, the project becomes much less mysterious.

---

The main thing I’d emphasize to your future self in `README.md` is:

```text
This project is not "build a Go AI."

This project is:
"Use KataGo as a local world model, then reinterpret ownership through a custom Survival Go objective."
```

That framing keeps the scope sane.
