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

- **Unit tests:**
  ```bash
  pytest -m unit
  ```
- **Integration tests:**
  ```bash
  pytest -m integration
  ```
- **E2E tests (requires server running):**
  ```bash
  pytest -m e2e
  # Or use the helper script:
  ./scripts/run_e2e_tests.sh [--headed] [--browser <chromium|firefox|webkit>]
  ```
- **All non-E2E tests:**
  ```bash
  pytest -m "unit or integration"
  ```
- **Lint checks:**
  ```bash
  pytest -m lint
  ```

## Markers
- `@pytest.mark.unit` for unit tests
- `@pytest.mark.integration` for integration tests
- `@pytest.mark.e2e` for end-to-end Playwright tests
- `@pytest.mark.lint` for code style checks
