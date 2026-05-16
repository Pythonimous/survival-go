# Prompt Index

Central catalog of the automation prompts available in this scaffold. Use it to pick the right helper before kicking off a task.

| Prompt | Description | When to Run |
| --- | --- | --- |
| `.github/prompts/git-init.prompt.md` | Wipe template history and initialize fresh git repo for a derived project, then generate project-specific README. | First setup pass when creating a new project from this scaffold. |
| `.github/prompts/make-specs.prompt.md` | Generate a concise `specification.md` defining scope, flows, and risks. | Once stakeholders agree on project goals but details are loose. |
| `.github/prompts/make-todo.prompt.md` | Build a phase-ordered `TODO.md` roadmap from the specification. | After `specification.md` exists and before implementation starts. |
| `.github/prompts/configure-tooling.prompt.md` | Reconfigure linting, testing, typing, and E2E tooling. | When the default tooling needs to be swapped or tuned. |
| `.github/prompts/continue-development.prompt.md` | Pull the next task from `TODO.md` using the development guardrails. | Whenever you resume feature work during an active phase. |
| `.github/prompts/architecture-audit.prompt.md` | Audit recent changes against `docs/architecture.md` guardrails. | After significant structural work or ahead of reviews. |
| `.github/prompts/explain-code.prompt.md` | Produce a clear explanation and examples for a code snippet. | Any time code needs beginner-friendly documentation. |
| `.github/prompts/close-phase.prompt.md` | Wrap up a phase with final tests, docs, and commits. | Before handing off or merging a completed milestone. |
| `.github/prompts/ml-eda.prompt.md` | Plan reproducible exploratory data analysis and sync tasks into `TODO.md`. | When starting an ML project or new dataset investigation. |
| `.github/prompts/ml-training.prompt.md` | Scaffold baseline model training, tracking, and TODO integration. | After EDA when you are ready to train and evaluate models. |
