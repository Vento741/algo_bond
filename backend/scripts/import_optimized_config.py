"""Import optimized configs to VPS via HTTP API.

Reads JSON output from optimize_pivot_point_mr.py, creates StrategyConfig
records on the target server via POST /api/strategies/configs.

Usage:
    python backend/scripts/import_optimized_config.py \
        --results optimize_results/pivot_mr_WLDUSDT_5_20260414_1830.json \
        --top-n 3 \
        --target https://algo.dev-james.bond
"""

from __future__ import annotations

import argparse
import getpass
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import httpx

logger = logging.getLogger(__name__)

STRATEGY_SLUG = "pivot-point-mr"
HTTP_TIMEOUT = 30.0
MAX_RETRIES = 3


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import optimized configs to VPS via HTTP API",
    )
    parser.add_argument("--results", type=Path, required=True, help="JSON results from optimizer")
    parser.add_argument("--top-n", type=int, default=3)
    parser.add_argument("--target", required=True, help="Target API base URL (e.g. https://algo.dev-james.bond)")
    parser.add_argument("--login", help="Email for login (password prompted)")
    parser.add_argument("--dry-run", action="store_true", help="Don't POST, just print payloads")
    parser.add_argument("--name-prefix", default="Optimized")
    return parser.parse_args(argv)


def generate_config_name(prefix: str, results: dict, entry: dict, rank: int) -> str:
    """Generate a unique readable name for StrategyConfig.

    Example: "Optimized #1 WLDUSDT 5m PF2.34 DD8.1 2026-04-14"
    """
    m = entry.get("metrics", {})
    pf = m.get("profit_factor", 0.0)
    dd = m.get("max_drawdown", 0.0)
    date = results.get("timestamp", "")[:10]
    return (
        f"{prefix} #{rank} {results['symbol']} {results['timeframe']}m "
        f"PF{pf:.2f} DD{dd:.1f} {date}"
    )


def get_token(args: argparse.Namespace) -> str:
    """Get JWT token — from env var or login prompt."""
    token = os.environ.get("ALGOBOND_TOKEN")
    if token:
        logger.info("Using ALGOBOND_TOKEN from environment")
        return token

    if not args.login:
        raise RuntimeError(
            "No auth token. Set ALGOBOND_TOKEN env var or pass --login EMAIL"
        )

    password = getpass.getpass(f"Password for {args.login}: ")
    with httpx.Client(timeout=HTTP_TIMEOUT) as client:
        response = client.post(
            f"{args.target}/api/auth/login",
            json={"email": args.login, "password": password},
        )
        response.raise_for_status()
        data = response.json()
        return data["access_token"]


def _request_with_retry(
    method: str,
    url: str,
    token: str,
    json_body: dict | None = None,
) -> httpx.Response:
    """HTTP request with exponential backoff retry on 5xx and network errors."""
    headers = {"Authorization": f"Bearer {token}"}
    backoff = 1.0
    last_exc: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            with httpx.Client(timeout=HTTP_TIMEOUT) as client:
                response = client.request(method, url, headers=headers, json=json_body)
                if response.status_code < 500:
                    return response
                logger.warning("HTTP %d on %s, retry %d/%d", response.status_code, url, attempt + 1, MAX_RETRIES)
        except httpx.NetworkError as e:
            last_exc = e
            logger.warning("Network error on %s: %s, retry %d/%d", url, e, attempt + 1, MAX_RETRIES)
        time.sleep(backoff)
        backoff *= 2
    if last_exc:
        raise last_exc
    raise RuntimeError(f"Max retries exceeded for {url}")


def get_strategy_id(target: str, token: str, slug: str) -> str:
    """Resolve strategy UUID from slug."""
    response = _request_with_retry("GET", f"{target}/api/strategies/{slug}", token)
    if response.status_code != 200:
        raise RuntimeError(f"Failed to get strategy {slug}: HTTP {response.status_code} {response.text}")
    return response.json()["id"]


def list_my_configs(target: str, token: str) -> list[dict]:
    """List current user's strategy configs."""
    response = _request_with_retry("GET", f"{target}/api/strategies/configs/my", token)
    if response.status_code != 200:
        raise RuntimeError(f"Failed to list configs: HTTP {response.status_code}")
    return response.json()


def create_config(target: str, token: str, payload: dict) -> dict:
    """Create one StrategyConfig. Returns response dict or raises on error."""
    response = _request_with_retry(
        "POST",
        f"{target}/api/strategies/configs",
        token,
        json_body=payload,
    )
    if response.status_code == 401:
        raise RuntimeError("401 Unauthorized — JWT token invalid or expired")
    if response.status_code == 409:
        raise RuntimeError(f"409 Conflict — config already exists")
    if response.status_code not in (200, 201):
        raise RuntimeError(f"HTTP {response.status_code}: {response.text}")
    return response.json()


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )
    args = parse_args()

    if not args.results.exists():
        logger.error("Results file not found: %s", args.results)
        return 1

    with args.results.open("r", encoding="utf-8") as f:
        results = json.load(f)

    final_top = results.get("final_top_10", [])[:args.top_n]
    if not final_top:
        logger.error("No configs in final_top_10 — nothing to import")
        return 1

    logger.info("Importing %d configs from %s to %s", len(final_top), args.results.name, args.target)

    if args.dry_run:
        for i, entry in enumerate(final_top, 1):
            name = generate_config_name(args.name_prefix, results, entry, i)
            payload = {
                "strategy_id": "<lookup-at-runtime>",
                "name": name,
                "symbol": results["symbol"],
                "timeframe": results["timeframe"],
                "config": entry["config"],
            }
            print(f"\n--- DRY RUN [{i}] ---")
            print(f"Name: {name}")
            print(f"Payload size: {len(json.dumps(payload))} bytes")
            print(f"Config keys: {list(entry['config'].keys())}")
        return 0

    try:
        token = get_token(args)
    except Exception as e:
        logger.error("Auth failed: %s", e)
        return 1

    try:
        strategy_id = get_strategy_id(args.target, token, STRATEGY_SLUG)
        logger.info("Resolved strategy_id for %s: %s", STRATEGY_SLUG, strategy_id)
    except Exception as e:
        logger.error("Failed to resolve strategy: %s", e)
        return 1

    existing_configs = list_my_configs(args.target, token)
    existing_names = {c["name"] for c in existing_configs}

    created = skipped = errors = 0
    for i, entry in enumerate(final_top, 1):
        name = generate_config_name(args.name_prefix, results, entry, i)
        if name in existing_names:
            logger.info("[%d] SKIP (exists): %s", i, name)
            skipped += 1
            continue

        payload = {
            "strategy_id": strategy_id,
            "name": name,
            "symbol": results["symbol"],
            "timeframe": results["timeframe"],
            "config": entry["config"],
        }
        try:
            response = create_config(args.target, token, payload)
            logger.info("[%d] CREATED: %s -> %s", i, name, response.get("id"))
            created += 1
        except Exception as e:
            logger.error("[%d] ERROR on %s: %s", i, name, e)
            errors += 1

    logger.info("Summary: %d created, %d skipped, %d errors", created, skipped, errors)
    return 0 if errors == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
