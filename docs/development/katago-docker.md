# KataGo in Docker (shared engine, light concurrent load)

Survival Go runs **one** KataGo analysis subprocess for all games. The backend serializes analyze/engine-move traffic on stdin/stdout, so only one KataGo query is in flight at a time regardless of how many HTTP clients are connected.

Use this guide when packaging the backend for Docker or a small shared host where a few users may hit analyze/engine-move at once.

## Config files

| File | Use case |
|------|----------|
| `third_party/katago/analysis.cfg` | Local WSL/Linux dev (minimal CPU/RAM) |
| `third_party/katago/analysis.docker.cfg` | Container / light multi-user deploy |

Set the backend env var:

```bash
KATAGO_CONFIG_PATH=/absolute/path/to/analysis.docker.cfg
```

Copy or mount the same `katago` binary and `.bin.gz` model paths as for local dev (`KATAGO_BINARY_PATH`, `KATAGO_MODEL_PATH`).

## Thread settings (`analysis.docker.cfg`)

| Setting | Docker value | Why |
|---------|--------------|-----|
| `numAnalysisThreads` | `1` | Matches serialized `KataGoClient`; extra analysis threads do not speed up our API and increase memory. |
| `numSearchThreadsPerAnalysisThread` | `4` | Slightly higher than local dev (`2`) so each queued request finishes sooner once it reaches KataGo. |
| `nnCacheSizePowerOfTwo` | `18` | Smaller NN cache than dev (`20`) to keep one model footprint smaller in RAM-limited containers. |
| `nnMaxBatchSize` | `4` | Aligned with lower thread count on CPU-only deploys. |

Do **not** raise `numAnalysisThreads` expecting better behavior when several browser tabs call the API. Concurrent requests **queue in the backend**; KataGo still sees one query at a time.

For heavier batch workloads (many positions in one KataGo session without our lock), see upstream [analysis_example.cfg](https://github.com/lightvector/KataGo/blob/master/cpp/configs/analysis_example.cfg) and KataGo’s comments on `numAnalysisThreads` vs `numSearchThreadsPerAnalysisThread`.

## Timeouts (backend env, not `analysis.cfg`)

Per-request timeout is **`KATAGO_ANALYSIS_TIMEOUT_SECONDS`** (default `30` local, `45` in Docker Compose). See [environment.md](environment.md).

Under light concurrent load, wall-clock time for a call is roughly:

```text
(queue wait) + (KataGo analysis time)
```

Example: two users each trigger engine-move at once; the second may wait for the first analysis to finish. If the wait plus analysis exceeds the timeout, the API returns a timeout error even though KataGo is healthy.

Suggested starting points for a **single-container** backend with 2–4 casual testers:

| Variable | Suggested value | Notes |
|----------|-----------------|-------|
| `KATAGO_ANALYSIS_TIMEOUT_SECONDS` | `45`–`60` | Increase before raising KataGo thread counts. |
| `KATAGO_TOP_N` | `8` (default) | Unchanged; engine-move still requests top-N candidates per query. |

Tune timeout first; only then adjust `numSearchThreadsPerAnalysisThread` if individual analyses are still too slow on your CPU.

## Expected behavior under load

See **[shared-katago-engine.md](shared-katago-engine.md)** for the full model (queueing, one model in RAM, idle games after tab close). Summary:

- **Requests queue** when analyze/engine-move overlap; responses stay correct (integration tests cover two games + concurrent calls on one client).
- **One model load** in RAM: deleting a game does not stop KataGo; only app shutdown does.
- **Idle games** remain in memory until `DELETE /api/games/{id}` or server restart (closing a browser tab without “New game” does not free the session).

## Logs inside containers

`logDir = analysis_logs` writes under the process working directory. Mount a volume or set `WORKDIR` so logs are not lost on container restart, or redirect via your orchestrator.

## Overrides

To experiment without editing the shipped file:

1. Copy `analysis.docker.cfg` to a writable path.
2. Adjust thread or cache keys.
3. Point `KATAGO_CONFIG_PATH` at the copy.

Keep `reportAnalysisWinratesAs = BLACK` unless you change ownership parsing assumptions in the backend.

## Verify

With real KataGo paths in `.env`:

```bash
export KATAGO_CONFIG_PATH="$PWD/third_party/katago/analysis.docker.cfg"
pytest tests/integration/test_katago_smoke.py -m integration
pytest tests/integration/test_shared_katago_games.py -m integration
```

Unit checks for both config files:

```bash
pytest tests/unit/test_katago_analysis_configs.py -m unit
```

## See also

- [katago-wsl-linux.md](katago-wsl-linux.md) — install binary, model, and local `analysis.cfg`
- [local-run.md](local-run.md) — run backend + frontend locally
- [docker-compose.md](docker-compose.md) — optional container packaging
