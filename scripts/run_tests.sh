#!/bin/bash
# Quick Test Runner

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -n "${VIRTUAL_ENV:-}" ] && [ -x "${VIRTUAL_ENV}/bin/python" ]; then
  PYTHON="${PYTHON:-${VIRTUAL_ENV}/bin/python}"
elif [ -x "$ROOT/.venv/bin/python" ]; then
  PYTHON="${PYTHON:-$ROOT/.venv/bin/python}"
else
  PYTHON="${PYTHON:-python3}"
fi

SOURCE_DIR="${SOURCE_DIR:-backend}"

function show_help() {
    cat << EOF
Test Runner
===========

Usage: $0 [COMMAND]

Commands:
  unit          Run unit tests only
  integration   Run integration tests only
  fast          Run unit + integration tests
  e2e           Run E2E tests (requires server)
  lint          Run lint checks
  types         Run mypy type checking
  coverage      Run tests with coverage report
  all           Run all checks (lint, types, unit, integration)
  full          Run everything including E2E (requires server)
  release       Same as full (pre-tag / pre-deploy regression gate)
  
EOF
}

case "${1:-}" in
    unit)
        echo "Running unit tests..."
        "$PYTHON" -m pytest -m unit
        ;;
    integration)
        echo "Running integration tests..."
        "$PYTHON" -m pytest -m integration
        ;;
    fast)
        echo "Running unit + integration tests..."
        "$PYTHON" -m pytest -m "unit or integration"
        ;;
    e2e)
        echo "Running E2E tests..."
        ./scripts/run_e2e_tests.sh
        ;;
    lint)
        echo "Running lint checks..."
        "$PYTHON" -m pytest -m lint
        ;;
    types)
        echo "Running type checks..."
        "$PYTHON" -m mypy .
        ;;
    coverage)
        echo "Running tests with coverage..."
        "$PYTHON" -m pytest -m "unit or integration" --cov="${SOURCE_DIR}" --cov-report=term-missing --cov-report=html
        echo ""
        echo "Coverage report generated in htmlcov/index.html"
        ;;
    all)
        echo "Running full validation suite (except E2E)..."
        echo ""
        echo "1/4 Running lint checks..."
        "$PYTHON" -m pytest -m lint
        echo ""
        echo "2/4 Running type checks..."
        "$PYTHON" -m mypy .
        echo ""
        echo "3/4 Running unit tests..."
        "$PYTHON" -m pytest -m unit
        echo ""
        echo "4/4 Running integration tests..."
        "$PYTHON" -m pytest -m integration
        echo ""
        echo "All checks passed!"
        ;;
    release|full)
        echo "Running FULL validation suite including E2E..."
        echo ""
        echo "1/5 Running lint checks..."
        "$PYTHON" -m pytest -m lint
        echo ""
        echo "2/5 Running type checks..."
        "$PYTHON" -m mypy .
        echo ""
        echo "3/5 Running unit tests..."
        "$PYTHON" -m pytest -m unit
        echo ""
        echo "4/5 Running integration tests..."
        "$PYTHON" -m pytest -m integration
        echo ""
        echo "5/5 Running E2E tests..."
        ./scripts/run_e2e_tests.sh
        echo ""
        echo "All checks passed!"
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo "Unknown command: ${1:-}"
        echo ""
        show_help
        exit 1
        ;;
esac
