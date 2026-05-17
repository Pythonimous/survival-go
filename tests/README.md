# Test Suite Structure

Tests are organized as follows:

```
tests/
├── unit/          # Isolated logic tests (no HTTP calls)
├── integration/   # API endpoint and multi-component tests
├── e2e/           # End-to-end browser tests (if applicable)
├── lint/          # Code style checks
└── conftest.py    # Shared fixtures
```

## Running Tests

Use `./scripts/run_tests.sh <command>` or equivalent `make` targets:

| Command / target | What it runs |
|------------------|--------------|
| `unit` / `make test-unit` | `pytest -m unit` |
| `integration` / `make test-integration` | `pytest -m integration` |
| `e2e` / `make test-e2e` | `./scripts/run_e2e_tests.sh` (skips if no E2E tests yet) |
| `lint` / `make test-lint` | `pytest -m lint` |
| `types` / `make test-types` | `mypy .` |
| `fast` / `make test-fast` | unit + integration |
| `all` / `make test-all` | lint, types, unit, integration |
| `full` / `make test-full` | `all` + e2e |

CI runs the same commands in `.github/workflows/ci.yml` (parallel jobs per check).

Direct `pytest` invocations still work, for example:

```bash
pytest -m unit
pytest -m "unit or integration"
```

## Markers
- `@pytest.mark.unit` for unit tests
- `@pytest.mark.integration` for integration tests
- `@pytest.mark.e2e` for end-to-end Playwright tests
- `@pytest.mark.lint` for code style checks
