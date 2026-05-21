# Command Index

Central catalog of project-specific Cursor commands in `.cursor/commands/`. Use these when running command-driven workflows from chat.

| Command file | Purpose | When to Run |
| --- | --- | --- |
| `.cursor/commands/git-init.md` | Re-initialize a derived repository and refresh project metadata for a fresh start. | First setup pass when creating a new project from this scaffold. |
| `.cursor/commands/make-specs.md` | Draft a concise `specification.md` for scope, flows, and risks. | Once goals are known but implementation details are not finalized. |
| `.cursor/commands/make-todo.md` | Generate a phase-ordered `TODO.md` roadmap from the spec. | After `specification.md` exists and before implementation starts. |
| `.cursor/commands/configure-tooling.md` | Adjust lint/test/type/e2e tooling configuration. | When project tooling needs to be changed from defaults. |
| `.cursor/commands/continue-development.md` | Execute the next open `TODO.md` item under development guardrails. | Any time implementation resumes during an active phase. |
| `.cursor/commands/architecture-audit.md` | Check recent work against architecture boundaries in `docs/architecture.md`. | After structural refactors or before major reviews. |
| `.cursor/commands/explain-code.md` | Produce a readable explanation for selected code paths. | When onboarding or clarifying unfamiliar code. |
| `.cursor/commands/close-phase.md` | Run close-out validation/docs workflow for a completed phase. | Before handoff or merge of a milestone. |
| `.cursor/commands/ml-eda.md` | Plan reproducible exploratory analysis and sync resulting tasks into `TODO.md`. | When starting an ML/data investigation track. |
| `.cursor/commands/ml-training.md` | Scaffold baseline model training/evaluation workflow and TODO integration. | After EDA when beginning model training work. |
