"""Download OHLCV candles from Bybit and cache as parquet files.

Usage:
    python backend/scripts/download_candles.py \
        --symbols WLDUSDT,LDOUSDT,FETUSDT,NEARUSDT \
        --timeframe 5 \
        --days 180
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path
from typing import Any

# Setup sys.path для импорта из backend/
BACKEND_DIR = Path(__file__).parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import pandas as pd

from app.modules.market.bybit_client import BybitAPIError, BybitClient

logger = logging.getLogger(__name__)

DEFAULT_CACHE_DIR = BACKEND_DIR.parent / "data" / "candles"
BYBIT_BATCH_LIMIT = 1000
MS_PER_DAY = 86_400_000


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse CLI args for downloader."""
    parser = argparse.ArgumentParser(
        description="Download OHLCV candles from Bybit to local parquet cache",
    )
    parser.add_argument(
        "--symbols",
        required=True,
        type=lambda s: [sym.strip() for sym in s.split(",") if sym.strip()],
        help="Comma-separated Bybit symbols (e.g., WLDUSDT,LDOUSDT)",
    )
    parser.add_argument(
        "--timeframe",
        required=True,
        choices=["1", "3", "5", "15", "30", "60", "240", "1440"],
        help="Kline interval (Bybit: 1,3,5,15,30,60,240,1440 minutes)",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=180,
        help="How many days of history to download (default 180)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-download even if cache exists",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Verbose pagination logs",
    )
    return parser.parse_args(argv)


def cache_path(symbol: str, timeframe: str, cache_dir: Path | None = None) -> Path:
    """Compute parquet cache file path for symbol+timeframe."""
    base = cache_dir or DEFAULT_CACHE_DIR
    return base / f"{symbol}_{timeframe}.parquet"


def download_symbol(
    symbol: str,
    timeframe: str,
    days: int,
    force: bool = False,
    cache_dir: Path | None = None,
    client: BybitClient | None = None,
) -> pd.DataFrame:
    """Download candles for one symbol, using parquet cache if available.

    This is a stub — real implementation in Task 2.
    """
    raise NotImplementedError("Will be implemented in Task 2")
