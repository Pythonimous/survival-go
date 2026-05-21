# User Flow Index

End-to-end user journeys for Survival Go. Each flow file uses the `UF-###` naming convention so automation and release checks can discover, diff, and test them.

Load the specific flow file before implementing or updating behavior. When adding Playwright coverage, align `@pytest.mark.e2e` scenarios with these IDs (see `.cursor/rules/testing.mdc`).

| ID | Name | Path | Summary | Status | Last Updated |
|----|------|------|---------|--------|--------------|
| UF-1 | Survive as White | [UF-1-survive-as-white.md](UF-1-survive-as-white.md) | Human White vs engine Black; click-to-play with automatic engine replies. | ready | 2026-05-21 |
| UF-2 | Kill as Black | [UF-2-kill-as-black.md](UF-2-kill-as-black.md) | Human Black vs engine White; ownership attack practice. | ready | 2026-05-21 |
| UF-3 | Inspect engine reasoning | [UF-3-inspect-engine-reasoning.md](UF-3-inspect-engine-reasoning.md) | Win rate, score, and candidate table after engine move or analyze. | ready | 2026-05-21 |
| UF-4 | Start and resume local sessions | [UF-4-start-resume-local-session.md](UF-4-start-resume-local-session.md) | Create game, `GET` state refresh, API lifecycle, `DELETE` on new game. | ready | 2026-05-21 |
| UF-000 | Template | [UF-000-template.md](UF-000-template.md) | Copy this file to seed additional user flows. | draft | 2025-10-14 |

## How to use

- Start here to locate the relevant flow ID and file path.
- Cross-check [local-run.md](../development/local-run.md) when validating flows manually.
- Update this table whenever you add, rename, or retire a flow. Keep rows ordered by Flow ID.
