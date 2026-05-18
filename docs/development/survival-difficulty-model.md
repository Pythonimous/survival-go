# Survival Difficulty Model (Quick Guide)

This page explains how engine move selection worked before, what it does now, and how to tune it without getting lost.

## Before (v1): simple and intuitive

Previous engine move selection was:

1. Rank candidate moves by the Survival objective.
2. Usually pick rank #1.
3. Sometimes skip rank #1 and choose from the rest using `randomness`.

This was easy to reason about and worked well for coarse Easy/Hard separation.

## Now (v2): controlled variety without obvious blunders

Current selection pipeline:

1. **Rank** all candidates by a composite score.
2. **Filter** candidates below `best_score - blunder_margin`.
3. **Select**:
   - deterministic top candidate when `temperature == 0`
   - softmax sampling over filtered candidates when `temperature > 0`

Implementation: `backend/app/engine/move_selector.py`.

## Composite score (what is being optimized)

For each candidate, the scorer combines:

- **Survival term** (side-aware core objective)
  - Black prefers higher `min_black_probability`
  - White prefers lower `min_black_probability` (implemented as `1 - min_black_probability`)
- **Policy term** (KataGo prior plausibility)
  - normalized by the best policy among current candidates
- **Score term** (stability anchor from KataGo `scoreLead`)
  - normalized into `[0, 1]` around `0.5`

Then anchors and awareness are blended:

- `policy_anchor` and `score_anchor` control how much policy/score terms pull the ranking.
- `variant_awareness` controls how strongly pure Survival dominates vs anchored behavior.

Difficulty schema lives in `backend/app/difficulty.py`.

## Why we changed

Goal: make difficulty levels feel like different player profiles, not only "best move with random mistakes."

- **Easy/Normal**: plausible but imperfect, with variation.
- **Hard**: more objective-focused, less variety.
- **Impossible**: near-pure Survival objective.

The v2 model keeps variation but prevents obviously bad moves via `blunder_margin`.

## Practical tuning (recommended mental model)

Use these three knobs first:

- `variant_awareness`: objective focus vs human-like anchors.
- `blunder_margin`: how far from best score a move can be and still be considered.
- `temperature`: how much variety appears among non-blunder candidates.

Secondary knobs:

- `policy_anchor`: increase for "more plausible KataGo-like move choice."
- `score_anchor`: increase for globally stable/score-aware behavior.
- `max_visits`: more search strength, more latency.
- `top_n`: larger candidate pool for ranking/filtering.

## Threshold and Survival semantics

Survival evaluation uses `SURVIVAL_THRESHOLD` (env var) to count unresolved points:

- unresolved if `p_black < threshold`
- `survival_score = unresolved_count`
- `min_black_probability` is the bottleneck metric used by selector side logic

Changing threshold changes the strictness of "resolved ownership" across all evaluations.

## Glossary

- **Candidate**: a move from KataGo `moveInfos` considered by the engine.
- **Survival term**: side-aware objective component derived from `min_black_probability`.
- **Policy term**: normalized KataGo prior probability for a move.
- **Score term**: normalized `scoreLead` anchor.
- **Composite score**: blended utility used for ranking candidates.
- **Blunder filter**: removes candidates below `best - blunder_margin`.
- **Temperature**: softmax randomness over filtered candidates (`0` = deterministic).
- **Variant awareness**: weight of pure Survival objective in composite scoring.
- **Top N**: number of highest-ranked candidates kept before final selection.

## Old-to-new mapping

- Old `randomness` maps to new `temperature` for backward compatibility.
- If old payloads omit new fields, backend compatibility mapping fills defaults.

