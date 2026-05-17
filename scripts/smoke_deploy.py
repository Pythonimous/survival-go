#!/usr/bin/env python3
"""Post-deploy API smoke checks (health, presets, optional KataGo analyze)."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.deploy.smoke import DeploySmokeError, run_deploy_smoke_checks  # noqa: E402


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run post-deploy Survival Go API smoke checks.")
    parser.add_argument(
        "--api-base-url",
        default=os.environ.get("API_BASE_URL", "").strip(),
        help="API origin (default: API_BASE_URL env var), e.g. https://api.example.com",
    )
    parser.add_argument(
        "--with-analyze",
        action="store_true",
        help="Also create a game and POST /analyze (uses KataGo; slower)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=float(os.environ.get("SMOKE_TIMEOUT_SECONDS", "30")),
        help="Per-request timeout in seconds (default: 30, or SMOKE_TIMEOUT_SECONDS)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    if not args.api_base_url:
        parser.error("API base URL is required (--api-base-url or API_BASE_URL)")

    try:
        steps = run_deploy_smoke_checks(
            args.api_base_url,
            with_analyze=args.with_analyze,
            timeout_seconds=args.timeout,
        )
    except DeploySmokeError as exc:
        print(f"smoke failed: {exc}", file=sys.stderr)
        return 1
    except ValueError as exc:
        print(f"smoke failed: {exc}", file=sys.stderr)
        return 1

    print(f"smoke passed ({', '.join(steps)}) at {args.api_base_url.rstrip('/')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
