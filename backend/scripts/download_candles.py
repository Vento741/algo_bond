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
    """Download OHLCV candles for one symbol, using parquet cache.

    Args:
        symbol: Bybit symbol (e.g., "WLDUSDT")
        timeframe: Kline interval in minutes (e.g., "5")
        days: How many days of history to fetch
        force: Ignore cache, re-download
        cache_dir: Directory for parquet files (default: data/candles/)
        client: BybitClient instance (optional, creates new if None)

    Returns:
        DataFrame with columns: timestamp, open, high, low, close, volume, turnover
    """
    cache_dir = cache_dir or DEFAULT_CACHE_DIR
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_path(symbol, timeframe, cache_dir)

    end_ms = int(time.time() * 1000)
    start_ms = end_ms - days * MS_PER_DAY

    # Try cache: if parquet exists and non-empty, use it (unless --force)
    if not force and path.exists():
        try:
            df = pd.read_parquet(path)
            if not df.empty:
                cached_min = int(df["timestamp"].min())
                cached_max = int(df["timestamp"].max())
                logger.info(
                    "Using cache %s (%d rows, %s -> %s)",
                    path.name, len(df),
                    pd.Timestamp(cached_min, unit="ms"),
                    pd.Timestamp(cached_max, unit="ms"),
                )
                return df
        except Exception as e:
            logger.warning("Cache read failed for %s, re-downloading: %s", path, e)

    # Download via pagination
    if client is None:
        client = BybitClient()

    all_candles: list[dict] = []
    current_end = end_ms
    retries_left = 3
    backoff = 1.0

    while current_end > start_ms:
        try:
            batch = client.get_klines(
                symbol=symbol,
                interval=timeframe,
                limit=BYBIT_BATCH_LIMIT,
                start=start_ms,
                end=current_end,
            )
        except BybitAPIError as e:
            if getattr(e, "code", None) == 429 and retries_left > 0:
                logger.warning("Rate limit hit for %s, retrying in %.1fs", symbol, backoff)
                time.sleep(backoff)
                backoff *= 2
                retries_left -= 1
                continue
            raise

        if not batch:
            break

        all_candles = batch + all_candles
        first_ts = int(batch[0]["timestamp"])
        if first_ts <= start_ms:
            break
        current_end = first_ts - 1
        retries_left = 3
        backoff = 1.0

    if not all_candles:
        logger.warning("Empty result for %s %s", symbol, timeframe)
        df = pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume", "turnover"])
    else:
        df = pd.DataFrame(all_candles)
        df = df.drop_duplicates(subset=["timestamp"], keep="first")
        df = df.sort_values("timestamp").reset_index(drop=True)

    df.to_parquet(path, compression="snappy", engine="pyarrow")
    logger.info("Downloaded %d candles for %s %sm -> %s", len(df), symbol, timeframe, path.name)
    return df


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )
    args = parse_args()
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    errors = 0
    for symbol in args.symbols:
        try:
            download_symbol(
                symbol=symbol,
                timeframe=args.timeframe,
                days=args.days,
                force=args.force,
            )
        except Exception as e:
            logger.error("Failed to download %s: %s", symbol, e)
            errors += 1

    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
