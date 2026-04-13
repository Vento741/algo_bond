"""Тесты для download_candles.py."""

import sys
import time
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
from app.modules.market.bybit_client import BybitAPIError


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

        fake_candles = [
            self._make_candle(ts_ms=1_700_000_000_000 + i * 5 * 60 * 1000, close=100 + i)
            for i in range(10)
        ]
        mock_client = MagicMock()
        mock_client.get_klines.side_effect = [fake_candles, []]

        df = download_symbol(
            symbol="TESTUSDT",
            timeframe="5",
            days=1,
            cache_dir=tmp_path,
            client=mock_client,
        )

        assert (tmp_path / "TESTUSDT_5.parquet").exists()
        assert set(df.columns) >= {"timestamp", "open", "high", "low", "close", "volume"}
        assert len(df) == 10
        assert list(df["timestamp"]) == sorted(df["timestamp"])

    def test_cached_download_skips_api(self, tmp_path) -> None:
        """Повторный вызов использует cache без обращения к API."""
        from scripts.download_candles import download_symbol

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

        download_symbol("FORCEUSDT", "1", days=1, cache_dir=tmp_path, client=mock_client)

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
        batch1 = [self._make_candle(ts_ms=now_ms - (10 - i) * 60 * 1000, close=100 + i) for i in range(10)]
        batch2 = [self._make_candle(ts_ms=now_ms - (15 - i) * 60 * 1000, close=200 + i) for i in range(10)]

        mock_client = MagicMock()
        mock_client.get_klines.side_effect = [batch1, batch2, []]

        df = download_symbol(
            symbol="DEDUPUSDT",
            timeframe="1",
            days=1,
            cache_dir=tmp_path,
            client=mock_client,
        )

        assert df["timestamp"].is_unique
        assert len(df) <= 15

    def test_rate_limit_retry(self, tmp_path) -> None:
        """Rate limit → retry with backoff, затем success."""
        from scripts.download_candles import download_symbol

        call_count = [0]
        def flaky(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                raise BybitAPIError(429, "Rate limit")
            if call_count[0] == 2:
                return [self._make_candle(ts_ms=int(time.time() * 1000))]
            return []

        mock_client = MagicMock()
        mock_client.get_klines.side_effect = flaky

        df = download_symbol(
            symbol="RETRYUSDT",
            timeframe="1",
            days=1,
            cache_dir=tmp_path,
            client=mock_client,
        )
        assert call_count[0] >= 2
        assert len(df) >= 1
