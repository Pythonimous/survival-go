# Release checklist

Use this checklist before tagging a release, merging a release branch, or publishing a deployable build. It mirrors CI (`.github/workflows/ci.yml`) and the local test runner (`./scripts/run_tests.sh`).

## Prerequisites

From the repo root:

1. **Python venv** with dependencies installed:
   ```bash
   python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
   ```
2. **ONNX model artifacts** in `frontend/public/models/` for manual browser smoke. See [onnx-model-artifacts.md](onnx-model-artifacts.md).
3. **Frontend dependencies** (only if you run browser E2E with a live UI stack):
   ```bash
   cd frontend && npm install && cd ..
   ```

## Automated regression gate (recommended)

One command runs lint, type checks, unit tests, integration tests, and E2E (same order as `full` in the test runner):

```bash
source .venv/bin/activate
./scripts/run_tests.sh full
```

Equivalent:

```bash
make test-full
./scripts/run_tests.sh release
```

**Pass criteria:** all five steps exit 0.

### What each step runs

| Step | Command | Marker / tool |
|------|---------|----------------|
| 1. Lint | `./scripts/run_tests.sh lint` | `pytest -m lint` (flake8 via pytest) |
| 2. Types | `./scripts/run_tests.sh types` | `mypy .` |
| 3. Unit | `./scripts/run_tests.sh unit` | `pytest -m unit` |
| 4. Integration | `./scripts/run_tests.sh integration` | `pytest -m integration` |
| 5. E2E | `./scripts/run_tests.sh e2e` | `pytest -m e2e` via `./scripts/run_e2e_tests.sh` |

CI runs the same commands in parallel jobs; locally, `full` / `release` runs them sequentially.

### Faster pre-release check (no E2E)

When you only need backend regression without browser tests:

```bash
./scripts/run_tests.sh all
# or: make test-all
```

This runs lint, types, unit, and integration only.

### Optional coverage report

```bash
./scripts/run_tests.sh coverage
```

Opens `htmlcov/index.html` after unit + integration with coverage.

## E2E notes

- `./scripts/run_e2e_tests.sh` can start the API with `uvicorn` when nothing is listening on port 8000.
- Set `E2E_SERVER_COMMAND` to override the start command.
- Set `E2E_SERVER_DISABLED=true` when tests do not need a managed server (CI uses this).
- If no E2E tests are collected, the script exits 0 (pytest exit code 5 is treated as skip).

## Manual smoke (after automated gate)

With backend and frontend running ([local-run.md](local-run.md)):

| Check | How |
|-------|-----|
| API health | `curl -s http://127.0.0.1:8000/health` → `{"status":"ok",...}` |
| API lifecycle | `pytest tests/integration/test_api_lifecycle.py -m integration -v` |
| UI turn flow | Open http://127.0.0.1:5173 — preset, human move, browser ONNX engine response, metrics |

## Docker packaging smoke (optional)

If the release includes container images:

```bash
docker compose up --build -d
curl -s http://127.0.0.1:8080/health
```

See [docker-compose.md](docker-compose.md). Tear down with `docker compose down`.

## Before you tag or deploy

- [ ] `./scripts/run_tests.sh full` (or `all` + separate `e2e` if you prefer) passes locally
- [ ] CI is green on the release commit (lint, types, unit, integration, e2e jobs)
- [ ] `GET /health` succeeds against the build you will ship
- [ ] Changelog / version bump committed (if your process uses them)
- [ ] `.env` / secrets are **not** committed; use [environment.md](environment.md) for production values

## Troubleshooting

Release-time test failures:

| Failure | Likely cause |
|---------|----------------|
| Integration API tests fail | Backend not starting; check `curl http://127.0.0.1:8000/health` |
| `mypy` errors | Fix reported paths before release; do not skip with `# type: ignore` unless justified |
| Lint fails | Run `pytest -m lint -v` for file/line details |
| E2E cannot reach API | Port 8000 in use or wrong `E2E_SERVER_COMMAND`; try `E2E_SERVER_DISABLED=true` if tests self-host |
| Broken venv shebangs | Recreate `.venv` from repo root; see [local-run.md](local-run.md) |

Local app / browser setup issues (CORS, ONNX, presets, timeouts): [troubleshooting.md](troubleshooting.md).

## References

- [Test commands](../../tests/README.md)
- [Local run guide](local-run.md)
- [Environment variables](environment.md)
- CI workflow: `.github/workflows/ci.yml`
