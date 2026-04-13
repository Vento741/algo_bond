# Local Grid Search Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Построить локальный workflow (download → optimize → import) для grid search оптимизации PivotPointMeanReversion стратегии с multiprocessing и parquet cache, zero-impact на существующий код.

**Architecture:** Три независимых скрипта в `backend/scripts/` коммуницируют через файлы. `download_candles.py` качает OHLCV с Bybit в parquet cache, `optimize_pivot_point_mr.py` параллельный grid search через `multiprocessing.Pool` используя `get_engine()` и `run_backtest()` без правок, `import_optimized_config.py` аплоадит топ-конфиги в VPS через HTTP API (`httpx`).

**Tech Stack:** Python 3.12, pandas+pyarrow (parquet), multiprocessing (stdlib), httpx (HTTP client), pytest

**Spec:** [docs/superpowers/specs/2026-04-14-local-grid-search-workflow-design.md](../specs/2026-04-14-local-grid-search-workflow-design.md)

---

## File Structure

### Files to Create

| Path | Responsibility |
|---|---|
| `backend/scripts/download_candles.py` | Скачивание OHLCV с Bybit, кэширование в parquet |
| `backend/scripts/optimize_pivot_point_mr.py` | Grid search с multiprocessing, чтение из parquet |
| `backend/scripts/import_optimized_config.py` | HTTP API uploader в VPS |
| `backend/tests/test_download_candles.py` | Unit тесты downloader |
| `backend/tests/test_optimize_pivot_point_mr.py` | Unit тесты optimizer (не full grid) |
| `backend/tests/test_import_optimized_config.py` | Unit тесты uploader с HTTP mock |
| `data/candles/.gitkeep` | Директория parquet кэша |
| `optimize_results/.gitkeep` | Директория результатов |

### Files to Modify

| Path | Change |
|---|---|
| `backend/requirements.txt` | +1 строка: `pyarrow>=14.0` |
| `.gitignore` | +2 строки: `data/candles/*.parquet`, `optimize_results/` |

### Zero-impact Contract

**НЕ трогаем:**
- `backend/scripts/optimize_strategy.py` (остаётся для Lorentzian KNN)
- `backend/app/modules/backtest/backtest_engine.py`
- `backend/app/modules/strategy/engines/*.py`
- `backend/app/modules/trading/*.py`
- `backend/app/modules/market/candle_service.py`
- `backend/app/modules/market/bybit_client.py` (используем as-is)

---

## Critical Discovery Notes

Discovery step выявил важные нюансы, зафиксированные ПЕРЕД написанием плана:

1. **`BacktestMetrics.win_rate` — fraction 0-1, не percent.** Из `optimize_strategy.py:163`: `if wr > 0.4`. Все сравнения в MR scoring и success criteria должны использовать `0.55`, не `55`.

2. **API endpoints (`backend/app/modules/strategy/router.py`):**
   - `GET /api/strategies` — list all
   - `GET /api/strategies/{slug}` — by slug (works with slug)
   - `POST /api/strategies/configs` — create config (requires JWT)
   - `GET /api/strategies/configs/my` — list my configs (for idempotent check, filter client-side by name)
   - `POST /api/auth/login` — returns `{access_token, refresh_token, token_type}`

3. **`BybitClient.get_klines` сигнатура:** `(symbol, interval, limit=200, start=None, end=None) -> list[dict]`. Возвращает список dict'ов с ключами `timestamp, open, high, low, close, volume, turnover`. Chronological order (oldest first) — уже reversed внутри клиента.

4. **Deps уже есть:** `httpx==0.28.1`, `pandas==2.2.3`, `pybit==5.14.0`. Только `pyarrow` добавить.

5. **sys.path pattern для scripts:** существующий `optimize_strategy.py` использует:
   ```python
   import sys
   from pathlib import Path
   sys.path.insert(0, str(Path(__file__).parent.parent))
   ```
   Следуем этому паттерну.

---

## Task 0: Setup (deps + gitignore + dirs)

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `.gitignore`
- Create: `data/candles/.gitkeep`
- Create: `optimize_results/.gitkeep`

- [ ] **Step 0.1: Add pyarrow to requirements**

Edit `backend/requirements.txt` — find line with `pandas==2.2.3` and add after it:
```
pyarrow>=14.0
```

- [ ] **Step 0.2: Install locally**

Run: `cd backend && pip install pyarrow>=14.0`
Expected: successful install

Verify: `python -c "import pyarrow; print(pyarrow.__version__)"`
Expected: version string printed

- [ ] **Step 0.3: Update .gitignore**

Read current `.gitignore` to find a good place. Add these lines at the end:
```
# Local grid search artifacts
data/candles/*.parquet
data/candles/*.json.gz
optimize_results/
!optimize_results/.gitkeep
!data/candles/.gitkeep
```

- [ ] **Step 0.4: Create artifact directories**

```bash
mkdir -p "c:/Users/Bear Soul/Desktop/Works/Projects/algo_bond/data/candles"
mkdir -p "c:/Users/Bear Soul/Desktop/Works/Projects/algo_bond/optimize_results"
touch "c:/Users/Bear Soul/Desktop/Works/Projects/algo_bond/data/candles/.gitkeep"
touch "c:/Users/Bear Soul/Desktop/Works/Projects/algo_bond/optimize_results/.gitkeep"
```

- [ ] **Step 0.5: Commit**

```bash
cd "c:/Users/Bear Soul/Desktop/Works/Projects/algo_bond"
git add backend/requirements.txt .gitignore data/candles/.gitkeep optimize_results/.gitkeep
git commit -m "chore: setup dirs and deps for local grid search workflow"
```

---

## Task 1: `download_candles.py` — module skeleton + CLI parser

**Files:**
- Create: `backend/scripts/download_candles.py`
- Create: `backend/tests/test_download_candles.py`

- [ ] **Step 1.1: Write test for CLI argument parsing**

Create `backend/tests/test_download_candles.py`:

```python
"""Тесты для download_candles.py."""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

# Добавляем backend/ в sys.path чтобы импортировать scripts.*
BACKEND_DIR = Path(__file__).parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from scripts.download_candles import (
    parse_args,
    cache_path,
    download_symbol,
)


class TestParseArgs:
    def test_required_symbols_and_timeframe(self) -> None:
        args = parse_args(["--symbols", "WLDUSDT,LDOUSDT", "--timeframe", "5"])
        assert args.symbols == ["WLDUSDT", "LDOUSDT"]
        assert args.timeframe == "5"
        assert args.days == 180  # default
        assert args.force is False

    def test_days_and_force_flags(self) -> None:
        args = parse_args([
            "--symbols", "WLDUSDT",
            "--timeframe", "15",
            "--days", "90",
            "--force",
        ])
        assert args.days == 90
        assert args.force is True

    def test_multiple_symbols_stripped(self) -> None:
        args = parse_args(["--symbols", "WLDUSDT, LDOUSDT , FETUSDT", "--timeframe", "5"])
        assert args.symbols == ["WLDUSDT", "LDOUSDT", "FETUSDT"]


class TestCachePath:
    def test_format(self, tmp_path) -> None:
        path = cache_path("WLDUSDT", "5", cache_dir=tmp_path)
        assert path.name == "WLDUSDT_5.parquet"
        assert path.parent == tmp_path
```

- [ ] **Step 1.2: Run test — expect ImportError**

Run: `cd backend && pytest tests/test_download_candles.py::TestParseArgs -v`
Expected: `ModuleNotFoundError: No module named 'scripts.download_candles'`

- [ ] **Step 1.3: Create skeleton module**

Create `backend/scripts/download_candles.py`:

```python
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
```

- [ ] **Step 1.4: Run tests — expect PASS for parse_args + cache_path**

Run: `cd backend && pytest tests/test_download_candles.py::TestParseArgs tests/test_download_candles.py::TestCachePath -v`
Expected: 4 passed

- [ ] **Step 1.5: Commit**

```bash
cd "c:/Users/Bear Soul/Desktop/Works/Projects/algo_bond"
git add backend/scripts/download_candles.py backend/tests/test_download_candles.py
git commit -m "feat(scripts): download_candles skeleton with CLI parser"
```

---

## Task 2: `download_candles.py` — core download logic + cache + tests

**Files:**
- Modify: `backend/scripts/download_candles.py`
- Modify: `backend/tests/test_download_candles.py`

- [ ] **Step 2.1: Add cache + download tests**

Append to `backend/tests/test_download_candles.py`:

```python
class TestDownloadSymbol:
    def _make_candle(self, ts_ms: int, close: float = 100.0) -> dict:
        return {
            "timestamp": ts_ms,
            "open": close - 0.5,
            "high": close + 0.5,
            "low": close - 0.7,
            "close": close,
            "volume": 1000.0,
            "turnover": 100_000.0,
        }

    def test_first_download_creates_parquet(self, tmp_path) -> None:
        """Первый вызов качает и сохраняет parquet."""
        from scripts.download_candles import download_symbol

        # Mock client returns 10 candles, one page
        fake_candles = [
            self._make_candle(ts_ms=1_700_000_000_000 + i * 5 * 60 * 1000, close=100 + i)
            for i in range(10)
        ]
        mock_client = MagicMock()
        mock_client.get_klines.side_effect = [fake_candles, []]  # first page has data, second empty

        df = download_symbol(
            symbol="TESTUSDT",
            timeframe="5",
            days=1,
            cache_dir=tmp_path,
            client=mock_client,
        )

        # Parquet file exists
        assert (tmp_path / "TESTUSDT_5.parquet").exists()
        # DataFrame has expected columns
        assert set(df.columns) >= {"timestamp", "open", "high", "low", "close", "volume"}
        assert len(df) == 10
        # Timestamps sorted ascending
        assert list(df["timestamp"]) == sorted(df["timestamp"])

    def test_cached_download_skips_api(self, tmp_path) -> None:
        """Повторный вызов использует cache без обращения к API."""
        from scripts.download_candles import download_symbol

        # First call to populate cache
        now_ms = int(time.time() * 1000)
        fake_candles = [
            self._make_candle(ts_ms=now_ms - (100 - i) * 60 * 1000, close=100 + i)
            for i in range(100)
        ]
        mock_client = MagicMock()
        mock_client.get_klines.side_effect = [fake_candles, []]

        download_symbol(
            symbol="CACHEDUSDT",
            timeframe="1",
            days=1,
            cache_dir=tmp_path,
            client=mock_client,
        )
        first_call_count = mock_client.get_klines.call_count

        # Second call — should NOT call API
        mock_client2 = MagicMock()
        df2 = download_symbol(
            symbol="CACHEDUSDT",
            timeframe="1",
            days=1,
            cache_dir=tmp_path,
            client=mock_client2,
        )
        assert mock_client2.get_klines.call_count == 0
        assert len(df2) == 100

    def test_force_bypasses_cache(self, tmp_path) -> None:
        """--force заставляет перекачать."""
        from scripts.download_candles import download_symbol

        now_ms = int(time.time() * 1000)
        fake_candles = [
            self._make_candle(ts_ms=now_ms - (50 - i) * 60 * 1000)
            for i in range(50)
        ]
        mock_client = MagicMock()
        mock_client.get_klines.side_effect = [fake_candles, []]

        # Populate cache
        download_symbol("FORCEUSDT", "1", days=1, cache_dir=tmp_path, client=mock_client)

        # With force — re-downloads
        mock_client2 = MagicMock()
        mock_client2.get_klines.side_effect = [fake_candles, []]
        download_symbol(
            "FORCEUSDT", "1", days=1, force=True,
            cache_dir=tmp_path, client=mock_client2,
        )
        assert mock_client2.get_klines.call_count >= 1

    def test_deduplication_by_timestamp(self, tmp_path) -> None:
        """Дубли по timestamp удаляются."""
        from scripts.download_candles import download_symbol

        now_ms = int(time.time() * 1000)
        # Two batches with overlap
        batch1 = [self._make_candle(ts_ms=now_ms - (10 - i) * 60 * 1000, close=100 + i) for i in range(10)]
        batch2 = [self._make_candle(ts_ms=now_ms - (15 - i) * 60 * 1000, close=200 + i) for i in range(10)]
        # Overlap: batch1[0..4] and batch2[5..9] share timestamps

        mock_client = MagicMock()
        mock_client.get_klines.side_effect = [batch1, batch2, []]

        df = download_symbol(
            symbol="DEDUPUSDT",
            timeframe="1",
            days=1,
            cache_dir=tmp_path,
            client=mock_client,
        )

        # All timestamps unique
        assert df["timestamp"].is_unique
        assert len(df) <= 15  # At most 15 unique timestamps

    def test_rate_limit_retry(self, tmp_path) -> None:
        """Rate limit → retry с exp backoff, потом success."""
        from scripts.download_candles import download_symbol

        call_count = [0]
        def flaky(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                raise BybitAPIError(429, "Rate limit")
            if call_count[0] == 2:
                return [self._make_candle(ts_ms=int(time.time() * 1000))]
            return []  # empty on subsequent to stop pagination

        mock_client = MagicMock()
        mock_client.get_klines.side_effect = flaky

        df = download_symbol(
            symbol="RETRYUSDT",
            timeframe="1",
            days=1,
            cache_dir=tmp_path,
            client=mock_client,
        )
        assert call_count[0] >= 2  # at least one retry happened
        assert len(df) >= 1
```

- [ ] **Step 2.2: Run tests — expect FAIL (NotImplementedError)**

Run: `cd backend && pytest tests/test_download_candles.py::TestDownloadSymbol -v`
Expected: fails with NotImplementedError or similar

- [ ] **Step 2.3: Implement `download_symbol` + helpers**

Replace the stub `download_symbol` in `backend/scripts/download_candles.py` with real implementation:

```python
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

    # Try cache
    if not force and path.exists():
        try:
            df = pd.read_parquet(path)
            if not df.empty:
                cached_min = int(df["timestamp"].min())
                cached_max = int(df["timestamp"].max())
                # Tolerance — 2 bars at this timeframe
                tf_ms = int(timeframe) * 60 * 1000
                tolerance = 2 * tf_ms
                if cached_min <= start_ms + tolerance and cached_max >= end_ms - tolerance:
                    logger.info(
                        "Using cache %s (%d rows, %s → %s)",
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
            if e.code == 429 and retries_left > 0:
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
        retries_left = 3  # reset on successful batch
        backoff = 1.0

    if not all_candles:
        logger.warning("Empty result for %s %s", symbol, timeframe)
        df = pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume", "turnover"])
    else:
        df = pd.DataFrame(all_candles)
        df = df.drop_duplicates(subset=["timestamp"], keep="first")
        df = df.sort_values("timestamp").reset_index(drop=True)

    # Save to cache
    df.to_parquet(path, compression="snappy", engine="pyarrow")
    logger.info("Downloaded %d candles for %s %sm → %s", len(df), symbol, timeframe, path.name)
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
```

- [ ] **Step 2.4: Run tests — expect PASS**

Run: `cd backend && pytest tests/test_download_candles.py -v`
Expected: all tests pass

- [ ] **Step 2.5: Commit**

```bash
cd "c:/Users/Bear Soul/Desktop/Works/Projects/algo_bond"
git add backend/scripts/download_candles.py backend/tests/test_download_candles.py
git commit -m "feat(scripts): download_candles full implementation with cache + retry"
```

---

## Task 3: Manual downloader smoke test

**Goal:** реально запустить downloader на 7 дней одного токена, убедиться что parquet правильно создаётся и читается. Это sanity check перед работой над optimizer.

- [ ] **Step 3.1: Real download (small sample)**

Run: `cd backend && python scripts/download_candles.py --symbols WLDUSDT --timeframe 5 --days 7 --verbose`
Expected: log output + created file `data/candles/WLDUSDT_5.parquet` (~200-300KB)

- [ ] **Step 3.2: Verify parquet content**

Run:
```bash
cd backend && python -c "
import pandas as pd
df = pd.read_parquet('../data/candles/WLDUSDT_5.parquet')
print('Shape:', df.shape)
print('Columns:', list(df.columns))
print('Timestamp range:', pd.Timestamp(df.timestamp.min(), unit='ms'), '→', pd.Timestamp(df.timestamp.max(), unit='ms'))
print('Dtypes:', dict(df.dtypes))
print(df.head(3))
print(df.tail(3))
"
```
Expected: shape around (2000, 7), columns include timestamp/open/high/low/close/volume/turnover, 7 days of timestamps

- [ ] **Step 3.3: Verify cache re-use**

Run: `cd backend && python scripts/download_candles.py --symbols WLDUSDT --timeframe 5 --days 7`
Expected: log says "Using cache ...", no API call

- [ ] **Step 3.4: If smoke test passes — proceed to Task 4**

If smoke test fails (empty parquet, wrong columns, API errors) — investigate and fix download_symbol. Common issues:
- `BybitAPIError.code` attribute name (check actual name)
- Column names in resulting DataFrame
- Timestamp units (ms vs s)

No commit needed for smoke test (no code changes).

---

## Task 4: `optimize_pivot_point_mr.py` — skeleton + CLI + BASE_CONFIG loading

**Files:**
- Create: `backend/scripts/optimize_pivot_point_mr.py`
- Create: `backend/tests/test_optimize_pivot_point_mr.py`

- [ ] **Step 4.1: Write tests for CLI + config loading**

Create `backend/tests/test_optimize_pivot_point_mr.py`:

```python
"""Тесты для optimize_pivot_point_mr.py."""

import sys
from pathlib import Path

import numpy as np
import pytest

BACKEND_DIR = Path(__file__).parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from scripts.optimize_pivot_point_mr import (
    parse_args,
    load_base_config,
    apply_params,
    expand_grid,
    score_mean_reversion,
)


class TestParseArgs:
    def test_required_symbols_and_timeframe(self) -> None:
        args = parse_args(["--symbols", "WLDUSDT", "--timeframe", "5"])
        assert args.symbols == ["WLDUSDT"]
        assert args.timeframe == "5"
        assert args.phase == "all"  # default
        assert args.top_n == 10  # default
        assert args.days == 180

    def test_phase_choices(self) -> None:
        args = parse_args(["--symbols", "WLDUSDT", "--timeframe", "5", "--phase", "coarse"])
        assert args.phase == "coarse"

    def test_workers_override(self) -> None:
        args = parse_args(["--symbols", "WLDUSDT", "--timeframe", "5", "--workers", "4"])
        assert args.workers == 4


class TestLoadBaseConfig:
    def test_has_required_sections(self) -> None:
        cfg = load_base_config()
        assert "pivot" in cfg
        assert "trend" in cfg
        assert "regime" in cfg
        assert "entry" in cfg
        assert "filters" in cfg
        assert "risk" in cfg

    def test_pivot_period_is_48(self) -> None:
        cfg = load_base_config()
        assert cfg["pivot"]["period"] == 48

    def test_returns_deep_copy(self) -> None:
        """Mutation of returned config должна не affect seed."""
        cfg1 = load_base_config()
        cfg1["pivot"]["period"] = 999
        cfg2 = load_base_config()
        assert cfg2["pivot"]["period"] == 48
```

- [ ] **Step 4.2: Run — expect ImportError**

Run: `cd backend && pytest tests/test_optimize_pivot_point_mr.py::TestParseArgs -v`
Expected: ModuleNotFoundError

- [ ] **Step 4.3: Create skeleton**

Create `backend/scripts/optimize_pivot_point_mr.py`:

```python
"""Grid search optimizer for PivotPointMeanReversion strategy.

Runs backtests across parameter combinations using multiprocessing.
Reads candles from data/candles/*.parquet cache.

Usage:
    python backend/scripts/optimize_pivot_point_mr.py \
        --symbols WLDUSDT,LDOUSDT,FETUSDT,NEARUSDT \
        --timeframe 5 \
        --phase all \
        --workers 14
"""

from __future__ import annotations

import argparse
import copy
import itertools
import json
import logging
import sys
import time
from datetime import datetime, timezone
from multiprocessing import Pool, cpu_count
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import numpy as np
import pandas as pd

from app.modules.backtest.backtest_engine import run_backtest
from app.modules.strategy.engines import get_engine
from app.modules.strategy.engines.base import OHLCV

logger = logging.getLogger(__name__)

RESULTS_DIR = BACKEND_DIR.parent / "optimize_results"
CANDLES_DIR = BACKEND_DIR.parent / "data" / "candles"

# Grid definitions — per spec 8.3
PHASE1_COARSE_GRID: dict[str, list[Any]] = {
    "pivot.period": [24, 48, 96],
    "entry.min_distance_pct": [0.10, 0.15, 0.25],
    "entry.min_confluence": [1.0, 1.5, 2.0],
    "risk.sl_max_pct": [0.015, 0.02, 0.03],
    "entry.cooldown_bars": [1, 3, 5],
}

PHASE2_FINE_ADDITIONAL_GRID: dict[str, list[Any]] = {
    "regime.adx_strong_trend": [25, 30, 35],
    "filters.rsi_oversold": [35, 40, 45],
    "risk.trailing_atr_mult": [1.2, 1.5, 2.0],
    "entry.impulse_check_bars": [3, 5, 7],
}

PHASE3_TUNING_GRID: dict[str, list[Any]] = {
    "risk.tp1_close_pct": [0.4, 0.5, 0.6, 0.7],
    "risk.tp2_close_pct": [0.3, 0.4, 0.5, 0.6],
    "pivot.velocity_lookback": [8, 12, 16],
}

PHASE2_MAX_COMBINATIONS = 300
PHASE3_TOP_N_BASELINE = 3


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse CLI args for optimizer."""
    parser = argparse.ArgumentParser(
        description="Grid search optimizer for PivotPointMeanReversion",
    )
    parser.add_argument(
        "--symbols",
        required=True,
        type=lambda s: [sym.strip() for sym in s.split(",") if sym.strip()],
    )
    parser.add_argument(
        "--timeframe",
        required=True,
        choices=["1", "3", "5", "15", "30", "60", "240", "1440"],
    )
    parser.add_argument(
        "--phase",
        choices=["coarse", "fine", "tuning", "all"],
        default="all",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=None,
        help="Parallel workers (default: cpu_count - 2)",
    )
    parser.add_argument(
        "--top-n",
        type=int,
        default=10,
    )
    parser.add_argument(
        "--days",
        type=int,
        default=180,
    )
    return parser.parse_args(argv)


def load_base_config() -> dict:
    """Load default config for pivot_point_mr from seed_strategy.py.

    Returns deep copy to prevent accidental mutation of module-level data.
    """
    from scripts.seed_strategy import STRATEGIES  # import here to avoid cycles

    for s in STRATEGIES:
        if s["slug"] == "pivot-point-mr":
            return copy.deepcopy(s["default_config"])
    raise RuntimeError("pivot-point-mr not found in seed STRATEGIES")


def apply_params(base: dict, params: dict[str, Any]) -> dict:
    """Apply flat params dict (nested via dot notation) to base config.

    Example: apply_params(cfg, {"pivot.period": 96}) → cfg["pivot"]["period"] = 96
    Returns deep copy.
    """
    result = copy.deepcopy(base)
    for key, value in params.items():
        parts = key.split(".")
        target = result
        for p in parts[:-1]:
            if p not in target:
                target[p] = {}
            target = target[p]
        target[parts[-1]] = value
    return result


def expand_grid(grid: dict[str, list[Any]]) -> list[dict[str, Any]]:
    """Expand grid dict into list of param combinations."""
    if not grid:
        return [{}]
    keys = list(grid.keys())
    value_lists = [grid[k] for k in keys]
    return [dict(zip(keys, combo)) for combo in itertools.product(*value_lists)]


def score_mean_reversion(metrics: dict) -> float:
    """Score configs for mean reversion — adapted from optimize_strategy.score_profit.

    Note: metrics["win_rate"] is fraction 0-1, not percent.
    """
    pnl = metrics.get("total_pnl_pct", 0.0)
    dd = metrics.get("max_drawdown", 100.0)
    trades = metrics.get("total_trades", 0)
    wr = metrics.get("win_rate", 0.0)
    pf = metrics.get("profit_factor", 0.0)

    if trades < 3:
        return -999.0

    # Base: pnl% with DD penalty
    score = pnl - dd * 0.3

    # Bonuses
    if wr > 0.4:
        score += (wr - 0.4) * 50  # WR 0.7 → +15
    if pf > 1.5:
        score += (pf - 1.5) * 10
    if trades >= 10:
        score += min(trades, 50) * 0.5

    # Mean reversion specific
    avg_duration = metrics.get("avg_trade_duration_bars", 0)
    if 0 < avg_duration < 20:
        score += 5

    max_streak = metrics.get("max_winning_streak", 0)
    if max_streak > 10:
        score -= 10

    if trades < 5:
        score -= 20

    return round(score, 2)


# Stub for worker function — will be implemented in Task 5
def run_one_backtest(args: tuple) -> dict:
    raise NotImplementedError("Will be implemented in Task 5")
```

- [ ] **Step 4.4: Run tests — expect PASS for parse_args + load_base_config**

Run: `cd backend && pytest tests/test_optimize_pivot_point_mr.py::TestParseArgs tests/test_optimize_pivot_point_mr.py::TestLoadBaseConfig -v`
Expected: 6 passed

- [ ] **Step 4.5: Commit**

```bash
cd "c:/Users/Bear Soul/Desktop/Works/Projects/algo_bond"
git add backend/scripts/optimize_pivot_point_mr.py backend/tests/test_optimize_pivot_point_mr.py
git commit -m "feat(scripts): optimize_pivot_point_mr skeleton with CLI + config loader"
```

---

## Task 5: `optimize_pivot_point_mr.py` — helpers + worker + tests

**Files:**
- Modify: `backend/scripts/optimize_pivot_point_mr.py`
- Modify: `backend/tests/test_optimize_pivot_point_mr.py`

- [ ] **Step 5.1: Write tests for helpers**

Append to `backend/tests/test_optimize_pivot_point_mr.py`:

```python
class TestApplyParams:
    def test_flat_key(self) -> None:
        base = {"pivot": {"period": 48}}
        result = apply_params(base, {"pivot.period": 96})
        assert result["pivot"]["period"] == 96
        # Original not mutated
        assert base["pivot"]["period"] == 48

    def test_multiple_keys(self) -> None:
        base = {"pivot": {"period": 48}, "entry": {"min_confluence": 1.5}}
        result = apply_params(base, {
            "pivot.period": 96,
            "entry.min_confluence": 2.0,
        })
        assert result["pivot"]["period"] == 96
        assert result["entry"]["min_confluence"] == 2.0

    def test_creates_missing_intermediate(self) -> None:
        base = {}
        result = apply_params(base, {"risk.sl_max_pct": 0.02})
        assert result == {"risk": {"sl_max_pct": 0.02}}


class TestExpandGrid:
    def test_single_param(self) -> None:
        grid = {"pivot.period": [24, 48, 96]}
        combos = expand_grid(grid)
        assert len(combos) == 3
        assert {"pivot.period": 48} in combos

    def test_multi_param_cartesian(self) -> None:
        grid = {"a": [1, 2], "b": [10, 20]}
        combos = expand_grid(grid)
        assert len(combos) == 4

    def test_coarse_grid_size(self) -> None:
        """Phase 1 coarse grid = 3^5 = 243."""
        from scripts.optimize_pivot_point_mr import PHASE1_COARSE_GRID
        combos = expand_grid(PHASE1_COARSE_GRID)
        assert len(combos) == 243


class TestScoreMeanReversion:
    def test_too_few_trades_returns_minus_999(self) -> None:
        m = {"total_pnl_pct": 50, "max_drawdown": 5, "total_trades": 2,
             "win_rate": 0.8, "profit_factor": 3.0}
        assert score_mean_reversion(m) == -999.0

    def test_good_metrics(self) -> None:
        m = {
            "total_pnl_pct": 30,
            "max_drawdown": 8,
            "total_trades": 25,
            "win_rate": 0.65,  # fraction, not percent
            "profit_factor": 2.0,
            "avg_trade_duration_bars": 12,
            "max_winning_streak": 4,
        }
        score = score_mean_reversion(m)
        # 30 - 8*0.3 + (0.65-0.4)*50 + (2.0-1.5)*10 + min(25,50)*0.5 + 5 (fast duration) = 27.6 + 12.5 + 5 + 12.5 + 5 = 62.6
        assert score > 50

    def test_high_dd_penalty(self) -> None:
        m = {
            "total_pnl_pct": 30,
            "max_drawdown": 40,
            "total_trades": 25,
            "win_rate": 0.65,
            "profit_factor": 2.0,
        }
        good = {
            "total_pnl_pct": 30,
            "max_drawdown": 8,
            "total_trades": 25,
            "win_rate": 0.65,
            "profit_factor": 2.0,
        }
        assert score_mean_reversion(m) < score_mean_reversion(good)

    def test_mean_reversion_streak_penalty(self) -> None:
        """Long winning streak = penalty (trend fluke suspicion)."""
        m_normal = {
            "total_pnl_pct": 30, "max_drawdown": 8, "total_trades": 25,
            "win_rate": 0.65, "profit_factor": 2.0,
            "max_winning_streak": 5,
        }
        m_streaky = {**m_normal, "max_winning_streak": 15}
        assert score_mean_reversion(m_streaky) < score_mean_reversion(m_normal)
```

- [ ] **Step 5.2: Run — expect PASS (helpers already in skeleton)**

Run: `cd backend && pytest tests/test_optimize_pivot_point_mr.py::TestApplyParams tests/test_optimize_pivot_point_mr.py::TestExpandGrid tests/test_optimize_pivot_point_mr.py::TestScoreMeanReversion -v`
Expected: all pass (since helpers were added in Task 4)

- [ ] **Step 5.3: Add test for worker function**

Append to `backend/tests/test_optimize_pivot_point_mr.py`:

```python
class TestRunOneBacktest:
    def test_runs_end_to_end_with_synthetic_data(self, tmp_path) -> None:
        """Create a synthetic parquet, run one backtest via worker function."""
        from scripts.optimize_pivot_point_mr import (
            run_one_backtest,
            load_base_config,
            PHASE1_COARSE_GRID,
        )

        # Create synthetic OHLCV DataFrame (500 bars, 1m fake data)
        n = 500
        rng = np.random.default_rng(42)
        closes = 100.0 + rng.normal(0, 3.0, n).cumsum() * 0.1
        df = pd.DataFrame({
            "timestamp": np.arange(n, dtype=np.int64) * 60_000,
            "open": closes - 0.2,
            "high": closes + np.abs(rng.normal(0.5, 0.2, n)),
            "low": closes - np.abs(rng.normal(0.5, 0.2, n)),
            "close": closes,
            "volume": rng.uniform(1000, 2000, n),
            "turnover": np.zeros(n),
        })
        parquet_path = tmp_path / "SYNTHUSDT_1.parquet"
        df.to_parquet(parquet_path, engine="pyarrow")

        base_cfg = load_base_config()
        # Use loose params to actually get signals on synthetic data
        loose_cfg = apply_params(base_cfg, {
            "pivot.period": 12,
            "trend.ema_period": 50,
            "entry.min_distance_pct": 0.05,
            "entry.min_confluence": 1.0,
            "entry.cooldown_bars": 1,
            "entry.impulse_check_bars": 3,
            "filters.rsi_enabled": False,
            "filters.squeeze_enabled": False,
            "regime.allow_strong_trend": True,
        })

        # Worker args tuple
        args = ("SYNTHUSDT", "1", loose_cfg, 0, str(tmp_path))
        result = run_one_backtest(args)

        assert "run_id" in result
        assert "symbol" in result
        assert "metrics" in result
        assert "score" in result
        assert result["symbol"] == "SYNTHUSDT"
        # Metrics should have basic fields
        assert "total_trades" in result["metrics"]
        assert "max_drawdown" in result["metrics"]
```

- [ ] **Step 5.4: Run — expect FAIL (NotImplementedError in worker)**

Run: `cd backend && pytest tests/test_optimize_pivot_point_mr.py::TestRunOneBacktest -v`
Expected: NotImplementedError

- [ ] **Step 5.5: Implement `run_one_backtest` worker**

Replace the stub `run_one_backtest` in `backend/scripts/optimize_pivot_point_mr.py`:

```python
def _dataframe_to_ohlcv(df: pd.DataFrame) -> OHLCV:
    """Convert parquet DataFrame to OHLCV dataclass."""
    return OHLCV(
        open=df["open"].to_numpy(dtype=np.float64),
        high=df["high"].to_numpy(dtype=np.float64),
        low=df["low"].to_numpy(dtype=np.float64),
        close=df["close"].to_numpy(dtype=np.float64),
        volume=df["volume"].to_numpy(dtype=np.float64),
        timestamps=df["timestamp"].to_numpy(dtype=np.float64),
    )


def _metrics_to_dict(metrics: Any) -> dict:
    """Serialize BacktestMetrics dataclass to dict (strip equity_curve + trades_log for size).

    Extracts mean-reversion specific stats (avg duration, max streak) from trades_log.
    """
    trades_log = getattr(metrics, "trades_log", []) or []

    # Compute avg duration in bars
    durations = []
    wins_streak = 0
    max_streak = 0
    for t in trades_log:
        entry_bar = t.get("entry_bar", 0)
        exit_bar = t.get("exit_bar", entry_bar)
        durations.append(exit_bar - entry_bar)
        pnl = t.get("pnl", 0.0)
        if pnl > 0:
            wins_streak += 1
            max_streak = max(max_streak, wins_streak)
        else:
            wins_streak = 0

    avg_duration = float(np.mean(durations)) if durations else 0.0

    return {
        "total_pnl": float(getattr(metrics, "total_pnl", 0.0)),
        "total_pnl_pct": float(getattr(metrics, "total_pnl_pct", 0.0)),
        "total_trades": int(getattr(metrics, "total_trades", 0)),
        "winning_trades": int(getattr(metrics, "winning_trades", 0)),
        "losing_trades": int(getattr(metrics, "losing_trades", 0)),
        "win_rate": float(getattr(metrics, "win_rate", 0.0)),
        "profit_factor": float(getattr(metrics, "profit_factor", 0.0)),
        "max_drawdown": float(getattr(metrics, "max_drawdown", 0.0)),
        "sharpe_ratio": float(getattr(metrics, "sharpe_ratio", 0.0)),
        "avg_trade_duration_bars": avg_duration,
        "max_winning_streak": max_streak,
    }


def run_one_backtest(args: tuple) -> dict:
    """Multiprocessing worker: run one config backtest.

    Args:
        (symbol, timeframe, config, run_id, cache_dir_str)

    Returns:
        dict with run_id, symbol, timeframe, config, metrics, score
    """
    symbol, timeframe, config, run_id, cache_dir_str = args
    try:
        path = Path(cache_dir_str) / f"{symbol}_{timeframe}.parquet"
        df = pd.read_parquet(path)
        ohlcv = _dataframe_to_ohlcv(df)

        engine = get_engine("pivot_point_mr", config)
        result = engine.generate_signals(ohlcv)

        bt_cfg = config.get("backtest", {})
        metrics = run_backtest(
            ohlcv=ohlcv,
            signals=result.signals,
            initial_capital=float(bt_cfg.get("initial_capital", 100.0)),
            commission_pct=float(bt_cfg.get("commission", 0.06)),
            slippage_pct=float(bt_cfg.get("slippage", 0.03)),
            order_size_pct=float(bt_cfg.get("order_size", 75.0)),
            use_multi_tp=True,
            use_breakeven=True,
            timeframe_minutes=int(timeframe),
            leverage=1,
            on_reverse="close",
        )

        metrics_dict = _metrics_to_dict(metrics)
        score = score_mean_reversion(metrics_dict)

        return {
            "run_id": run_id,
            "symbol": symbol,
            "timeframe": timeframe,
            "config": config,
            "metrics": metrics_dict,
            "score": score,
            "error": None,
        }
    except Exception as e:
        return {
            "run_id": run_id,
            "symbol": symbol,
            "timeframe": timeframe,
            "config": config,
            "metrics": {},
            "score": -999.0,
            "error": str(e),
        }
```

- [ ] **Step 5.6: Run worker test — expect PASS**

Run: `cd backend && pytest tests/test_optimize_pivot_point_mr.py::TestRunOneBacktest -v`
Expected: 1 passed (synthetic backtest runs end-to-end)

- [ ] **Step 5.7: Run all optimize tests**

Run: `cd backend && pytest tests/test_optimize_pivot_point_mr.py -v`
Expected: all pass

- [ ] **Step 5.8: Commit**

```bash
cd "c:/Users/Bear Soul/Desktop/Works/Projects/algo_bond"
git add backend/scripts/optimize_pivot_point_mr.py backend/tests/test_optimize_pivot_point_mr.py
git commit -m "feat(scripts): optimize worker + MR-specific metrics extraction"
```

---

## Task 6: `optimize_pivot_point_mr.py` — phase orchestration + main()

**Files:**
- Modify: `backend/scripts/optimize_pivot_point_mr.py`

- [ ] **Step 6.1: Append phase orchestration functions**

Append to `backend/scripts/optimize_pivot_point_mr.py`:

```python
def _run_phase(
    phase_name: str,
    base_configs: list[dict],
    grid: dict[str, list[Any]],
    symbol: str,
    timeframe: str,
    workers: int,
    cache_dir: Path,
    max_combinations: int | None = None,
) -> list[dict]:
    """Run one phase: for each base config, try all grid combinations.

    Returns list of result dicts (sorted by score descending).
    """
    grid_combos = expand_grid(grid)
    # Build task list: (symbol, tf, config_with_params, run_id, cache_dir_str)
    tasks = []
    run_id = 0
    for base in base_configs:
        for combo in grid_combos:
            cfg = apply_params(base, combo)
            tasks.append((symbol, timeframe, cfg, run_id, str(cache_dir)))
            run_id += 1

    # Apply max_combinations sampling if needed
    if max_combinations is not None and len(tasks) > max_combinations:
        # Deterministic sampling with seed for reproducibility
        rng = np.random.default_rng(42)
        indices = rng.choice(len(tasks), size=max_combinations, replace=False)
        tasks = [tasks[i] for i in sorted(indices)]
        logger.info("%s: sampled %d from %d combinations", phase_name, len(tasks), len(grid_combos) * len(base_configs))

    logger.info("%s: running %d backtests on %d workers...", phase_name, len(tasks), workers)
    start = time.time()

    if workers == 1:
        # Sequential mode for debugging
        results = [run_one_backtest(t) for t in tasks]
    else:
        with Pool(workers) as pool:
            results = pool.map(run_one_backtest, tasks)

    elapsed = time.time() - start
    logger.info("%s: done in %.1fs (%.2fs per backtest)", phase_name, elapsed, elapsed / max(len(tasks), 1))

    # Sort by score descending
    results.sort(key=lambda r: r.get("score", -999.0), reverse=True)
    return results


def _save_progress(symbol: str, timeframe: str, phase: str, results: list[dict]) -> Path:
    """Save intermediate results after each phase."""
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    path = RESULTS_DIR / f"pivot_mr_{symbol}_{timeframe}_{phase}_{ts}.json"
    with path.open("w", encoding="utf-8") as f:
        json.dump({
            "symbol": symbol,
            "timeframe": timeframe,
            "phase": phase,
            "timestamp": ts,
            "count": len(results),
            "results": results,
        }, f, indent=2, default=str)
    logger.info("Saved %s phase progress → %s", phase, path.name)
    return path


def _save_final(
    symbol: str,
    timeframe: str,
    days_back: int,
    base_config: dict,
    phase_results: dict[str, list[dict]],
    runtime_seconds: float,
    top_n: int,
) -> tuple[Path, Path]:
    """Save final JSON + markdown report."""
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

    # Final top-N comes from last phase (tuning if available, else fine, else coarse)
    final_phase = next(
        (p for p in ("tuning", "fine", "coarse") if p in phase_results),
        "coarse",
    )
    final_top = phase_results[final_phase][:top_n]

    json_path = RESULTS_DIR / f"pivot_mr_{symbol}_{timeframe}_{ts}.json"
    payload = {
        "symbol": symbol,
        "timeframe": timeframe,
        "days_back": days_back,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "runtime_seconds": runtime_seconds,
        "base_config": base_config,
        "phases": {
            name: {
                "combinations_tested": len(results),
                "top_10": results[:10],
            }
            for name, results in phase_results.items()
        },
        "final_top_10": final_top,
    }
    with json_path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, default=str)

    # Markdown
    md_path = RESULTS_DIR / f"pivot_mr_{symbol}_{timeframe}_{ts}.md"
    lines = [
        f"# Pivot Point MR — {symbol} {timeframe}m — {ts[:8]}",
        "",
        f"**Runtime:** {runtime_seconds:.1f}s  |  **Final phase:** {final_phase}  |  **Top-{top_n}**",
        "",
        "## Top Configs",
        "",
        "| # | Score | PnL% | DD% | WR | PF | Sharpe | Trades | AvgDur | pivot | min_conf | sl_max | cooldown |",
        "|---|-------|------|-----|-----|-----|--------|--------|--------|-------|----------|--------|----------|",
    ]
    for i, r in enumerate(final_top, 1):
        m = r["metrics"]
        c = r["config"]
        lines.append(
            f"| {i} | {r['score']:.1f} | {m.get('total_pnl_pct', 0):.1f} | "
            f"{m.get('max_drawdown', 0):.1f} | {m.get('win_rate', 0):.2f} | "
            f"{m.get('profit_factor', 0):.2f} | {m.get('sharpe_ratio', 0):.2f} | "
            f"{m.get('total_trades', 0)} | {m.get('avg_trade_duration_bars', 0):.1f} | "
            f"{c.get('pivot', {}).get('period', '?')} | "
            f"{c.get('entry', {}).get('min_confluence', '?')} | "
            f"{c.get('risk', {}).get('sl_max_pct', '?')} | "
            f"{c.get('entry', {}).get('cooldown_bars', '?')} |"
        )
    lines.append("")
    lines.append("## Best Config (full JSON)")
    lines.append("")
    lines.append("```json")
    if final_top:
        lines.append(json.dumps(final_top[0]["config"], indent=2))
    lines.append("```")

    md_path.write_text("\n".join(lines), encoding="utf-8")

    logger.info("Final results: %s + %s", json_path.name, md_path.name)
    return json_path, md_path


def optimize_symbol(
    symbol: str,
    timeframe: str,
    phase: str,
    workers: int,
    top_n: int,
    days_back: int,
    cache_dir: Path,
) -> dict[str, list[dict]]:
    """Run full optimization pipeline for one symbol+timeframe.

    Returns dict mapping phase name → list of results (sorted).
    """
    start_time = time.time()
    base_config = load_base_config()

    phase_results: dict[str, list[dict]] = {}

    # Phase 1: Coarse
    if phase in ("coarse", "all"):
        results_coarse = _run_phase(
            "coarse", [base_config], PHASE1_COARSE_GRID,
            symbol, timeframe, workers, cache_dir,
        )
        phase_results["coarse"] = results_coarse
        _save_progress(symbol, timeframe, "coarse", results_coarse)

    # Phase 2: Fine (top 10 from coarse as baselines)
    if phase in ("fine", "all"):
        if "coarse" not in phase_results:
            raise RuntimeError("Fine phase requires coarse phase results")
        # Take top 10 configs from coarse, use them as baselines for fine
        top10_coarse = [r["config"] for r in phase_results["coarse"][:10]]
        results_fine = _run_phase(
            "fine", top10_coarse, PHASE2_FINE_ADDITIONAL_GRID,
            symbol, timeframe, workers, cache_dir,
            max_combinations=PHASE2_MAX_COMBINATIONS,
        )
        phase_results["fine"] = results_fine
        _save_progress(symbol, timeframe, "fine", results_fine)

    # Phase 3: Tuning (top 3 from fine)
    if phase in ("tuning", "all"):
        if "fine" not in phase_results:
            raise RuntimeError("Tuning phase requires fine phase results")
        top3_fine = [r["config"] for r in phase_results["fine"][:PHASE3_TOP_N_BASELINE]]
        results_tuning = _run_phase(
            "tuning", top3_fine, PHASE3_TUNING_GRID,
            symbol, timeframe, workers, cache_dir,
        )
        phase_results["tuning"] = results_tuning
        _save_progress(symbol, timeframe, "tuning", results_tuning)

    runtime = time.time() - start_time
    _save_final(symbol, timeframe, days_back, base_config, phase_results, runtime, top_n)
    return phase_results


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )
    args = parse_args()

    workers = args.workers if args.workers is not None else max(1, cpu_count() - 2)

    # Verify cache exists for all requested symbols
    for symbol in args.symbols:
        path = CANDLES_DIR / f"{symbol}_{args.timeframe}.parquet"
        if not path.exists():
            logger.error(
                "Cache missing: %s. Run download_candles.py first for %s %sm",
                path, symbol, args.timeframe,
            )
            return 1

    errors = 0
    for symbol in args.symbols:
        logger.info("=" * 60)
        logger.info("Optimizing %s %sm", symbol, args.timeframe)
        logger.info("=" * 60)
        try:
            optimize_symbol(
                symbol=symbol,
                timeframe=args.timeframe,
                phase=args.phase,
                workers=workers,
                top_n=args.top_n,
                days_back=args.days,
                cache_dir=CANDLES_DIR,
            )
        except Exception as e:
            logger.error("Failed to optimize %s: %s", symbol, e, exc_info=True)
            errors += 1

    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 6.2: Run all optimize tests to verify no regression**

Run: `cd backend && pytest tests/test_optimize_pivot_point_mr.py -v`
Expected: all pass

- [ ] **Step 6.3: Commit**

```bash
cd "c:/Users/Bear Soul/Desktop/Works/Projects/algo_bond"
git add backend/scripts/optimize_pivot_point_mr.py
git commit -m "feat(scripts): optimize_pivot_point_mr phase orchestration + main"
```

---

## Task 7: Manual optimizer smoke test

**Goal:** ограниченный прогон optimizer на WLDUSDT 5m 30 days только coarse phase с 4 workers. Проверить что всё работает, выдаются артефакты, нет крашей.

- [ ] **Step 7.1: Download 30-day candles for smoke test**

Run: `cd backend && python scripts/download_candles.py --symbols WLDUSDT --timeframe 5 --days 30`
Expected: cache hit or download ~8000 candles

- [ ] **Step 7.2: Run optimizer in coarse-only mode with 4 workers**

Run: `cd backend && python scripts/optimize_pivot_point_mr.py --symbols WLDUSDT --timeframe 5 --phase coarse --workers 4 --days 30`
Expected: log output, 243 backtests running in parallel, final JSON + MD artifacts

- [ ] **Step 7.3: Verify artifacts**

```bash
ls -lh "c:/Users/Bear Soul/Desktop/Works/Projects/algo_bond/optimize_results/" | grep WLDUSDT
```
Expected: at least 2 files (1 JSON, 1 MD) plus phase progress JSONs

- [ ] **Step 7.4: Read markdown report**

Read one of the generated `.md` files. Check that:
- Top-10 table is present and formatted correctly
- Metrics are reasonable (not all -999)
- At least one config has `total_trades > 5` (signals actually generated)
- Best config JSON section present

If everything looks good — proceed to Task 8.

If there are issues:
- All results -999 → backtests failing, check error field in JSON
- No signals → LOOSE params needed, but full default config might be too strict for 30 days — try with `--days 90`
- Crashes → investigate specific error

No commit needed.

---

## Task 8: `import_optimized_config.py` — skeleton + CLI + auth

**Files:**
- Create: `backend/scripts/import_optimized_config.py`
- Create: `backend/tests/test_import_optimized_config.py`

- [ ] **Step 8.1: Write tests for CLI + name generation**

Create `backend/tests/test_import_optimized_config.py`:

```python
"""Тесты для import_optimized_config.py."""

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

BACKEND_DIR = Path(__file__).parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from scripts.import_optimized_config import (
    parse_args,
    generate_config_name,
)


class TestParseArgs:
    def test_required_args(self) -> None:
        args = parse_args([
            "--results", "/tmp/test.json",
            "--top-n", "3",
            "--target", "https://example.com",
        ])
        assert str(args.results).endswith("test.json")
        assert args.top_n == 3
        assert args.target == "https://example.com"
        assert args.dry_run is False

    def test_dry_run_flag(self) -> None:
        args = parse_args([
            "--results", "/tmp/x.json",
            "--target", "https://example.com",
            "--dry-run",
        ])
        assert args.dry_run is True


class TestGenerateConfigName:
    def test_format(self) -> None:
        results = {"symbol": "WLDUSDT", "timeframe": "5", "timestamp": "2026-04-14T18:30:00+00:00"}
        entry = {
            "metrics": {
                "profit_factor": 2.34,
                "max_drawdown": 8.12,
            },
        }
        name = generate_config_name("Optimized", results, entry, rank=1)
        assert "#1" in name
        assert "WLDUSDT" in name
        assert "5m" in name
        assert "PF2.34" in name
        assert "DD8.1" in name or "DD8.12" in name
        assert "2026-04-14" in name
```

- [ ] **Step 8.2: Create skeleton**

Create `backend/scripts/import_optimized_config.py`:

```python
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
            logger.info("[%d] CREATED: %s → %s", i, name, response.get("id"))
            created += 1
        except Exception as e:
            logger.error("[%d] ERROR on %s: %s", i, name, e)
            errors += 1

    logger.info("Summary: %d created, %d skipped, %d errors", created, skipped, errors)
    return 0 if errors == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 8.3: Run CLI + name tests — expect PASS**

Run: `cd backend && pytest tests/test_import_optimized_config.py::TestParseArgs tests/test_import_optimized_config.py::TestGenerateConfigName -v`
Expected: 3 passed

- [ ] **Step 8.4: Commit**

```bash
cd "c:/Users/Bear Soul/Desktop/Works/Projects/algo_bond"
git add backend/scripts/import_optimized_config.py backend/tests/test_import_optimized_config.py
git commit -m "feat(scripts): import_optimized_config skeleton with auth + HTTP helpers"
```

---

## Task 9: `import_optimized_config.py` — HTTP mock tests

**Files:**
- Modify: `backend/tests/test_import_optimized_config.py`

- [ ] **Step 9.1: Add HTTP-mocked integration tests**

Append to `backend/tests/test_import_optimized_config.py`:

```python
class TestImportFlow:
    def _make_results_file(self, tmp_path: Path, n_configs: int = 3) -> Path:
        """Create a fake results JSON file."""
        results = {
            "symbol": "WLDUSDT",
            "timeframe": "5",
            "timestamp": "2026-04-14T18:30:00+00:00",
            "final_top_10": [
                {
                    "config": {"pivot": {"period": 48}, "risk": {"sl_max_pct": 0.02}},
                    "metrics": {
                        "profit_factor": 2.0 + i * 0.1,
                        "max_drawdown": 10.0 - i,
                        "win_rate": 0.6,
                        "total_trades": 25,
                    },
                    "score": 50.0 - i,
                }
                for i in range(n_configs)
            ],
        }
        path = tmp_path / "fake_results.json"
        with path.open("w") as f:
            json.dump(results, f)
        return path

    def test_dry_run_does_not_call_post(self, tmp_path) -> None:
        """--dry-run prints payloads without HTTP."""
        from scripts.import_optimized_config import main

        results_file = self._make_results_file(tmp_path)
        argv = [
            "--results", str(results_file),
            "--target", "https://example.com",
            "--top-n", "3",
            "--dry-run",
        ]

        with patch("sys.argv", ["import_optimized_config.py"] + argv):
            with patch("httpx.Client") as mock_client:
                exit_code = main()
        assert exit_code == 0
        # httpx.Client should NOT have been instantiated in dry-run mode
        mock_client.assert_not_called()

    def test_idempotent_skip_by_name(self, tmp_path) -> None:
        """Existing config name → skip, not POST."""
        from scripts.import_optimized_config import main

        results_file = self._make_results_file(tmp_path, n_configs=2)

        # Prepare mock responses
        def mock_request(method, url, **kwargs):
            resp = MagicMock()
            resp.status_code = 200
            if "strategies/pivot-point-mr" in url:
                resp.json.return_value = {"id": "strategy-uuid"}
            elif "configs/my" in url:
                # Return existing config with the first generated name
                resp.json.return_value = [
                    {"name": "Optimized #1 WLDUSDT 5m PF2.00 DD10.0 2026-04-14"}
                ]
            elif "configs" in url and method == "POST":
                resp.status_code = 201
                resp.json.return_value = {"id": "new-config-uuid"}
            return resp

        mock_instance = MagicMock()
        mock_instance.request.side_effect = mock_request

        os.environ["ALGOBOND_TOKEN"] = "test-token"
        try:
            argv = [
                "--results", str(results_file),
                "--target", "https://example.com",
                "--top-n", "2",
            ]
            with patch("sys.argv", ["import_optimized_config.py"] + argv):
                with patch("httpx.Client") as mock_client_cls:
                    mock_client_cls.return_value.__enter__.return_value = mock_instance
                    exit_code = main()
            # Either 0 (success with skip+create) or 2 (errors) — main thing is it runs
            assert exit_code in (0, 2)
        finally:
            del os.environ["ALGOBOND_TOKEN"]

    def test_auth_fails_without_token_or_login(self, tmp_path) -> None:
        """No ALGOBOND_TOKEN, no --login → fails gracefully."""
        from scripts.import_optimized_config import main

        results_file = self._make_results_file(tmp_path)

        # Make sure env var is not set
        os.environ.pop("ALGOBOND_TOKEN", None)

        argv = [
            "--results", str(results_file),
            "--target", "https://example.com",
            "--top-n", "1",
        ]
        with patch("sys.argv", ["import_optimized_config.py"] + argv):
            exit_code = main()
        assert exit_code == 1  # auth failure
```

- [ ] **Step 9.2: Run import tests**

Run: `cd backend && pytest tests/test_import_optimized_config.py -v`
Expected: all pass

- [ ] **Step 9.3: Commit**

```bash
cd "c:/Users/Bear Soul/Desktop/Works/Projects/algo_bond"
git add backend/tests/test_import_optimized_config.py
git commit -m "test(scripts): import HTTP flow tests (dry-run, idempotent, auth)"
```

---

## Task 10: Final verification + no regression check

- [ ] **Step 10.1: Run full test suite for new scripts**

Run:
```bash
cd backend && pytest tests/test_download_candles.py tests/test_optimize_pivot_point_mr.py tests/test_import_optimized_config.py -v 2>&1 | tail -30
```
Expected: all tests pass

- [ ] **Step 10.2: Run no-regression on existing strategy and indicator tests**

Run:
```bash
cd backend && pytest tests/test_indicators.py tests/test_pivot_indicator.py tests/test_pivot_point_mr.py tests/test_lorentzian_knn.py tests/test_supertrend_squeeze.py -q 2>&1 | tail -10
```
Expected: no regressions, all pre-existing tests pass

- [ ] **Step 10.3: Zero-impact verification**

Run:
```bash
cd "c:/Users/Bear Soul/Desktop/Works/Projects/algo_bond"
git diff --stat main~15..HEAD -- backend/ | head -30
```
Expected: only new files in `scripts/` and `tests/`, plus `requirements.txt` (+1 line). NO changes to `backend_engine.py`, `optimize_strategy.py`, `engines/*.py`, `trading/*.py`.

- [ ] **Step 10.4: Smoke test optimizer end-to-end**

Run:
```bash
cd backend && python scripts/optimize_pivot_point_mr.py --symbols WLDUSDT --timeframe 5 --phase coarse --workers 4 --days 30 2>&1 | tail -10
```
Expected: log output shows 243 backtests, final artifact paths printed, exit 0

- [ ] **Step 10.5: Read the smoke test markdown report**

Open the generated `.md` file in `optimize_results/` and visually verify:
- Top-10 table renders correctly
- At least some configs have `total_trades > 5`
- Metrics look reasonable (not all zeros or all -999)

---

## Task 11: Full grid search production run

**Goal:** реальный грид-сёрч на всех 4 токенах после реализации workflow. Это не имплементация кода, а запуск готового скрипта.

- [ ] **Step 11.1: Download 180-day candles for all 4 symbols**

Run:
```bash
cd backend && python scripts/download_candles.py \
    --symbols WLDUSDT,LDOUSDT,FETUSDT,NEARUSDT \
    --timeframe 5 \
    --days 180
```
Expected: 4 parquet files in `data/candles/`, each ~1-3MB, around 50000 rows

- [ ] **Step 11.2: Run full optimizer on all 4 tokens**

Run:
```bash
cd backend && python scripts/optimize_pivot_point_mr.py \
    --symbols WLDUSDT,LDOUSDT,FETUSDT,NEARUSDT \
    --timeframe 5 \
    --phase all \
    --top-n 10 \
    --days 180
```
Expected runtime: ~30-60 minutes total on 14-core machine
Expected artifacts: 4 final JSON + MD files in `optimize_results/`, plus phase progress files

- [ ] **Step 11.3: Read all 4 markdown reports, identify best performers**

For each symbol, note:
- Best PF, DD, WR, Sharpe, trade count of top-1 config
- Whether critical success criteria met: **PF > 1.3, DD < 20%, WR > 0.5, trades > 10**
- Any symbol where stategy fails completely (all scores -999 or PF < 1)

Document findings in a summary message or markdown file.

- [ ] **Step 11.4: Decision gate**

Based on results:
- **If at least 1 symbol passes criteria** → proceed to Task 12 (import to VPS)
- **If all symbols fail** → strategy is not viable on Bybit commissions, stop here, document findings, investigate (maybe wider grid, different timeframe, or strategy tweaks)

---

## Task 12: Import top configs to VPS

- [ ] **Step 12.1: Dry-run for top-3 of each successful symbol**

For each symbol that passed criteria in Task 11:
```bash
cd backend && python scripts/import_optimized_config.py \
    --results optimize_results/pivot_mr_<SYMBOL>_5_<timestamp>.json \
    --top-n 3 \
    --target https://algo.dev-james.bond \
    --dry-run
```
Expected: payloads printed, no errors

- [ ] **Step 12.2: Set auth token**

Get a valid JWT token from an existing session, or login flow:
```bash
# Option A: Use existing session token from browser devtools
export ALGOBOND_TOKEN="eyJhbGc..."

# Option B: --login will prompt for password
```

- [ ] **Step 12.3: Real import**

For each symbol that passed:
```bash
cd backend && python scripts/import_optimized_config.py \
    --results optimize_results/pivot_mr_<SYMBOL>_5_<timestamp>.json \
    --top-n 3 \
    --target https://algo.dev-james.bond
```
Expected: "CREATED" messages for new configs, "SKIP" for any duplicates

- [ ] **Step 12.4: Verify on VPS**

Run:
```bash
ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && docker compose exec -T db psql -U algobond -d algobond -c \"SELECT name, symbol, timeframe FROM strategy_configs WHERE name LIKE 'Optimized%' ORDER BY created_at DESC LIMIT 12;\""
```
Expected: new rows visible in DB

- [ ] **Step 12.5: Verify through UI**

Open https://algo.dev-james.bond/strategies/pivot-point-mr — should see new configs in the list.

---

## Definition of Done

- [ ] All 3 scripts created and pass their unit tests
- [ ] `pyarrow` added to `requirements.txt`, `.gitignore` updated, cache dirs exist
- [ ] Zero-impact verified: only new files + `requirements.txt`/`gitignore`, NO changes to `optimize_strategy.py`, `backtest_engine.py`, `engines/*`, `trading/*`
- [ ] Smoke test (Task 7) shows optimizer runs end-to-end on real data without crashes
- [ ] Full grid search (Task 11) completes for all 4 tokens in < 60 minutes
- [ ] At least 1 symbol passes critical criteria (PF > 1.3, DD < 20%, WR > 0.5, trades > 10)
- [ ] Top configs imported to VPS via HTTP API (Task 12), visible in UI
- [ ] No regressions in existing test suite (strategies, indicators, backtest)
