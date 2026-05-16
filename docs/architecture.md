# Architectural Guidelines

These conventions help downstream projects keep features modular, testable, and easy to evolve.

## Core Principles

- **Single responsibility**: Each module, class, or function should do one job. Split tasks such as input parsing, orchestration, and response formatting into dedicated helpers.
- **Explicit boundaries**: Separate domain logic from I/O. For example, keep API handlers thin and delegate work to services that can be unit-tested without HTTP context.
- **Orchestrate, don’t implement**: High-level flows should compose lower-level utilities rather than duplicate logic.
- **Prefer pure functions**: Where possible, design functions that return data without side effects, making them easier to test.
- **Short functions**: Keep functions short (roughly ≤ 30 lines) and break them apart when they start branching heavily.
- **Measured complexity**: Flake8 with the McCabe plugin enforces `max-complexity = 10`; refactor or adjust the threshold if your context demands it.
- **Configurable integrations**: Encapsulate external service calls behind interfaces so they can be mocked in tests and swapped in production.
- **Data contracts**: Define input/output schemas or dataclasses to clarify expectations between layers.

## Layering Pattern (Example)

1. **HTTP / CLI / UI layer**: Accepts requests, validates payloads at the boundary, and forwards to the domain.
2. **Domain services**: Encapsulate business logic; orchestrate repositories and integrations.
3. **Repositories / Integrations**: Wrap database or API calls; return normalized domain objects.
4. **Utilities**: Shared helpers (parsers, formatters, adapters) used across layers.

## Checklist During Development

- Does every function have a single reason to change?
- Is the module small enough to understand at a glance?
- Can the core logic run in isolation (no global state, easy to mock dependencies)?
- Are there unit tests per helper/service and higher-level tests per flow?
- Would a newcomer know where to extend the feature without modifying unrelated code?

Review this file whenever a feature spans multiple concerns. Add project-specific rules as your architecture evolves.
