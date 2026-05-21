# AGENTS

Project operating guide for agentic development in `survival-go`.

## Mission and current state

- Survival Go is a local-first web app where Black tries to secure full-board ownership and White tries to prevent that.
- Browser ONNX inference (Kaya engine port) is the only inference path; server-side KataGo subprocess inference was removed.
- Backend Python remains the source of truth for game state, legality, API contracts, and Survival semantics.
- Repository license is AGPL-3.0-or-later because frontend ONNX engine modules are ported from `kaya-go/kaya`.

## Tech stack and key paths

- Backend: FastAPI + Python (`backend/app`).
- Frontend: React + TypeScript + Vite (`frontend/src`).
- ONNX engine path: `frontend/src/lib/analysis/onnx/kaya/`.
- Browser-provider adapter: `frontend/src/lib/analysis/providers/BrowserOnnxProvider.ts`.
- Backend game semantics: `backend/app/game_service.py`, `backend/app/engine/`.
- Presets: `backend/app/presets/`.
- Roadmap and active tasks: `TODO.md`.
- Durable dev history/decision log: `memory.md`.

## Non-negotiable boundaries

- Keep handlers thin and move orchestration into focused services/helpers (`docs/architecture.md`).
- TypeScript owns model input encoding + raw numeric transport only; backend Python owns semantic interpretation.
- Do not reintroduce server inference fallback paths.
- Keep functions under flake8 complexity limits (`max-complexity=10`).

## Delivery workflow

1. Confirm the next task in `TODO.md` and frame the smallest useful change.
2. For executable-code changes, follow test-first:
   - add/update failing tests,
   - implement minimal code to pass,
   - run targeted test slices.
3. Run quality gates for executable-code work:
   - `./.venv/bin/python -m mypy .`
   - `./.venv/bin/python -m pytest -m lint`
   - relevant `pytest` slice (plus frontend vitest when applicable)
4. Update docs affected by behavior changes (`README.md`, `docs/**`, `docs/user_flows/index.md` when flows change).
5. Capture durable context in `memory.md`.
6. Reconcile `TODO.md` checkboxes only after validation.

Notes:
- For documentation-only tasks, skip test-first and heavy validation unless executable code changed.
- Never add tests that assert markdown/doc string presence.

## Test command reference

- Backend fast checks: `./scripts/run_tests.sh fast`
- Backend lint gate: `./scripts/run_tests.sh lint` or `./.venv/bin/python -m pytest -m lint`
- Backend types: `./scripts/run_tests.sh types` or `./.venv/bin/python -m mypy .`
- Backend unit/integration slice: `./.venv/bin/python -m pytest -m "unit or integration"`
- Frontend tests: `npm --prefix frontend test -- --run <paths>`
- E2E: `./scripts/run_e2e_tests.sh` or `./scripts/run_tests.sh release`

## High-value docs map

- API reference: `docs/api-reference.md`
- Local run: `docs/development/local-run.md`
- Architecture: `docs/architecture.md`
- Browser inference design: `docs/development/browser-inference-design.md`
- ONNX artifacts + manifests: `docs/development/onnx-model-artifacts.md`
- Survival difficulty semantics: `docs/development/survival-difficulty-model.md`
- Release checklist: `docs/development/release-checklist.md`
- User flow index: `docs/user_flows/index.md`

## Current TODO focus (next open items)

- Cache busting for static assets (frontend deploy/CDN) so users pick up new builds reliably after releases.

## Maintenance expectations for this file

- Update this file when architecture boundaries, test workflows, inference/runtime policy, or release process changes.
- Keep path references current when files move.
- Reflect roadmap shifts from `TODO.md` in the "Current TODO focus" section.
