#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PYTHONPATH="${PYTHONPATH:+$PYTHONPATH:}$ROOT"

if [ -n "${VIRTUAL_ENV:-}" ] && [ -x "${VIRTUAL_ENV}/bin/python" ]; then
  PYTHON="${PYTHON:-${VIRTUAL_ENV}/bin/python}"
elif [ -x "$ROOT/.venv/bin/python" ]; then
  PYTHON="${PYTHON:-$ROOT/.venv/bin/python}"
else
  PYTHON="${PYTHON:-python3}"
fi

exec "$PYTHON" -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
