# architecture-audit

# Architecture Audit Checklist

Goal: Confirm that the current branch respects the modular design principles defined in `docs/architecture.md`.

## Preparation
1. Read `docs/architecture.md` to refresh the guardrails.
2. Review the latest changes (diff vs. main) with special attention to:
   - Handlers/controllers (HTTP, CLI, event consumers).
   - Service and helper modules that contain significant logic.
   - Integration boundaries (repositories, API clients, external adapters).

## Evaluation Steps
- Verify that boundary layers remain thin (input validation + delegation only).
- Ensure orchestration code composes smaller helpers rather than re-implementing logic.
- Check that functions stay short and cohesive; flag any that exceed ~30 lines or mix concerns.
- Confirm separations between domain logic, I/O, and formatting remain clear.
- Identify shared utilities that should be extracted or deduplicated.
- Note any missing automated tests for new helpers/services.

## Reporting
Summarize findings in markdown:
- **Strengths**: Call out improvements or good patterns.
- **Concerns**: List issues with file references, recommended refactors, and whether they block merge.
- **Follow-ups**: Actions for future iterations (for example, add interface, split module, improve tests).

Close with a one-line verdict: `Verdict: pass`, `Verdict: changes requested`, or `Verdict: follow-up needed`.
