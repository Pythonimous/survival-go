# Survival Scoring, Thresholds, and Difficulty

This page explains the **two ways** Survival Go can steer KataGo/ONNX play, which path the **browser app uses today**, and how ownership metrics still matter for API semantics, resign logic, and future faster inference.

## Two approaches (read this first)

Survival Go reuses a normal Go model without retraining. The project can align that model to the Survival objective in two different ways. They are complementary, not interchangeable labels for the same code path.

| | **Ownership-heavy** | **Komi-heavy** |
|---|---------------------|----------------|
| **Core signal** | Per-position **ownership head** → `p_black` per point → `min_black_probability` (bottleneck) and `unresolved_count` | **Value heads** under **extreme komi** (`345.5`) → MCTS **winrate** and **score lead** per candidate |
| **Typical move ranking** | Rank candidates by side-aware Survival on **each candidate’s** ownership (raise floor for Black, lower for White) | Rank candidates by **MCTS child winrate** (and optional score/policy anchors); komi already baked into search |
| **Inference cost** | **High** — one full inference (or more) per candidate you want to score | **Lower** — one MCTS search returns many children with winrate/score; no second pass per move for ownership |
| **Where it lives today** | Analyze API payloads, resign checks, `move_selector` **fallback** when `winrate` is absent, tests/fixtures | **Production browser** engine-move path (`BrowserOnnxProvider` + backend rerank) and the current reasoning panel display |
| **Best fit** | Server/desktop when latency and compute are cheap; augmenting or validating KataGo suggestions; faithful “weakest point” semantics | Browser ONNX where per-candidate ownership reranking is too slow |

```text
Ownership-heavy (original design)
  policy top-N → for each move: infer → ownership → min p_black → rank → pick

Komi-heavy (current browser default)
  MCTS @ komi 345.5 → children expose winrate/score_lead → backend rank → pick
  (root ownership once for metrics / resign only)
```

**Do not mix them up in one sentence:** the live site’s **engine move** is komi-heavy for ranking, and the current metrics panel (`EngineReasoning`) is also komi-heavy in presentation (`winrate` + `score_lead`). Ownership-heavy values are still produced in API responses and used for root resign checks.

---

## Ownership-heavy approach

### Idea

KataGo already predicts who will own each intersection. Survival Go treats the **minimum Black ownership** on the board as the strategic bottleneck:

- **Black (Survival attacker):** prefer moves that **raise** `min_black_probability`.
- **White (defender):** prefer moves that **lower** it.

`unresolved_count` counts points with `p_black < SURVIVAL_THRESHOLD` (default `0.95`). **`survival_score` equals that count** (lower is better for Black in this framing). See `backend/app/engine/evaluator.py`.

This matches the product description in `README.md` and is the most direct encoding of “own every point vs keep one point alive.”

### Historical browser path (superseded for engine-move)

Early browser ONNX (phases 7.2–7.3) ran **root inference + per-candidate child inference**, posted each child’s raw `ownership` to the backend, and reranked by Survival metrics. That loop was removed when Kaya MCTS landed (§ 7.7): too many sequential runs for acceptable latency.

### What still uses ownership-heavy semantics today

| Use | Path |
|-----|------|
| **Position metrics / debug API** | `POST .../analyze` — full board `p_black`, `survival_score`, `metrics` |
| **Engine resign** | Root ownership only — `min_black_probability < 1%` (Black engine) or `> 99%` (White engine); `backend/app/engine/resignation.py` |
| **Candidate ranking fallback** | `move_selector._ranking_term` uses `_survival_term` when a candidate has **no** `winrate` (unit tests, legacy payloads) |
| **Frontend wiring (not rendered panel)** | `transport.ts` and provider mappings still carry `survival_score` + `metrics`, but `EngineReasoning.tsx` currently renders winrate/score only |

### When to prefer it again

- **Desktop / native** (e.g. future Tauri with GPU): enough throughput to restore per-candidate ownership evaluation or hybrid scoring.
- **Augmenting KataGo:** use ownership as a **second opinion** on policy/MCTS shortlists (e.g. penalize moves that leave a very low `min_black_probability` even if winrate looks good under extreme komi).
- **Composite difficulty:** ownership Survival term can stay in `move_selector` as an explicit `_survival_term` alongside winrate/score anchors when per-candidate `min_black_probability` is available again.

Implementation hooks already exist: `CandidateMove.min_black_probability`, `_survival_term`, and `evaluate_survival_position` — production engine-move payloads today leave candidate `min_black_probability` at placeholders because children are not ownership-scored.

### `SURVIVAL_THRESHOLD` (ownership-heavy tuning)

Environment variable: `SURVIVAL_THRESHOLD` (default `0.95`, range `(0, 1]`). Loaded in `backend/app/config.py`; exposed on `/health`.

| Controls | Does **not** control |
|----------|----------------------|
| `unresolved_count` / `survival_score` on analyze | Engine-move **ranking** in the browser (MCTS winrate) |
| Strictness of ownership semantics in API outputs | Resign thresholds (fixed `0.01` / `0.99` on `min_black_probability`) |

| Raise threshold (e.g. `0.98`) | Lower threshold (e.g. `0.90`) |
|-------------------------------|-------------------------------|
| Fewer unresolved points; stricter bar | More unresolved points; softer bar |

Deploy notes: [environment.md](environment.md).

---

## Komi-heavy approach (current browser inference)

### Idea

Under **Chinese area scoring**, the smallest corner White can live in is **8 points**. On 19×19, Black’s Survival goal maps to holding White to ≤ 7 points area-wide — modeled as **komi `345.5`** in KataGo featurization so the **existing value and score heads** optimize the asymmetric game without new weights. See [CONTRIBUTORS.md](../../CONTRIBUTORS.md).

Constant: `ENGINE_EVAL_KOMI = 345.5` in `frontend/src/lib/analysis/providers/BrowserOnnxProvider.ts` (not match komi).

### Pipeline (production engine-move)

1. **Featurization** — `onnx-featurization.ts` encodes `selfKomi = -pla * komi` (KataGo convention).
2. **Search** — `OnnxEngine` / `runMCTS` at that komi; children expose `winrate` and `score_lead` (`value` / `miscvalue` heads).
3. **Shortlist** — browser sends top **12** legal children by root visit/policy (`ENGINE_MOVE_POLICY_CANDIDATE_COUNT`).
4. **Backend rerank** — `rank_candidates_for_side` uses **`_ranking_term` → winrate first**, then composite blend with policy/score anchors (`move_selector.py`). Per-candidate ownership is **not** recomputed.

Root position still gets **one** ownership decode for metrics and resign; response `survival_score` / `metrics` describe the **root**, not the played child’s ownership rerank.

### What the panel actually shows today

The right-side reasoning panel in `frontend/src/features/game/EngineReasoning.tsx` renders:

- **Position analysis:** `"Your win rate"` and `"Score"` from `formatPositionAnalysis(...)`
- **Candidate table:** sorted/displayed by per-candidate `winrate` then `score_lead`

It does **not** currently render `survival_score`, `unresolved_count`, or `min_black_probability`, even though those values are available in API/provider payloads.

### Why the browser uses komi-heavy for moves

Contributor note: extreme komi **reduces reliance on expensive ownership-based candidate reranking** in the browser path while keeping standard ONNX+MCTS. One batched search replaces N extra inferences per candidate.

Tradeoff: move choice is only as Survival-faithful as the value heads are under `345.5`; ownership metrics remain the honest check for “weakest point” on the current board.

### Komi-heavy tuning (difficulty v2)

Same composite pipeline as before, but the **primary ranking term is MCTS winrate**, not ownership:

1. **Rank** by composite score (winrate + optional policy/score anchors + `variant_awareness`).
2. **Filter** `best - blunder_margin`.
3. **Select** — deterministic if `temperature == 0`, else softmax among survivors.

Knobs in `backend/app/difficulty.py` / setup UI:

| Knob | Role |
|------|------|
| `variant_awareness` | Objective focus vs anchored blend |
| `blunder_margin` | Drop clearly worse candidates |
| `temperature` | Variety among non-blunders |
| `policy_anchor` | Pull toward plausible KataGo priors |
| `score_anchor` | Stabilize under extreme-komi score head |
| `max_visits` | MCTS strength vs latency |
| `top_n` | Shortlist size returned to UI |

**v1 (ownership-ranked moves):** rank by Survival on each candidate → usually pick #1 → occasional `randomness`. **v2 (today):** composite + blunder filter + temperature; ranking term is winrate on the hot path.

---

## API paths side by side

### `POST .../analyze` — ownership-heavy metrics

1. Browser runs inference at `ENGINE_EVAL_KOMI` (same featurization as play).
2. Backend: policy softmax, ownership → `p_black`, `evaluate_survival_position` with `SURVIVAL_THRESHOLD`.
3. Response: `survival_score`, `metrics`, optional `winrate` / `score_lead` (informational).

Use for board-wide Survival semantics and debugging. Note: the current frontend panel does not display these ownership metrics yet.

### `POST .../engine-move` — komi-heavy ranking

1. Browser MCTS → root raw tensors + top children with `value` / `miscvalue`.
2. Backend: root ownership for **resign**; candidates from **winrate** / `score_lead`; composite rerank → play move.
3. Response metrics from **root** ownership; current UI panel displays winrate/score labels and winrate/score-based candidate ordering.

---

## Future: combining both (e.g. desktop)

Not implemented as a single “hybrid mode” switch today, but the codebase is structured for it:

```text
MCTS @ komi 345.5  →  shortlist
        +
Per-candidate ownership infer  →  min_black_probability per move
        →
Composite score: winrate + survival_term + policy/score anchors
```

When inference is no longer browser-bound, restoring ownership per candidate is the straightforward way to **augment** komi-heavy MCTS without abandoning either signal. `move_selector` already defines both `_survival_term` and winrate-based `_ranking_term`; wiring real `min_black_probability` on each `CandidateMove` is the main integration step.

---

## Glossary

- **Ownership-heavy:** rank/evaluate using `p_black` / `min_black_probability` / `unresolved_count`.
- **Komi-heavy:** steer search and ranking via extreme komi + value heads (winrate, score lead).
- **`p_black`:** per-point Black ownership probability after decoding `[-1, 1]` model output.
- **Survival term:** side-aware utility from `min_black_probability` (`_survival_term`).
- **Ranking term:** winrate-first on engine-move; falls back to Survival term without winrate.
- **Extreme komi (`345.5`):** featurization komi for Survival-aligned value optimization.
- **Composite score:** blended utility for final candidate order.
- **Top N:** ranked shortlist size after filtering (`DEFAULT_TOP_N` / game difficulty).

## Old-to-new mapping

- Old `randomness` → `temperature`.
- Omitted difficulty fields → backend defaults via compatibility mapping.

## See also

- [API reference](../api-reference.md)
- [Browser inference design](browser-inference-design.md)
- [environment.md](environment.md)
