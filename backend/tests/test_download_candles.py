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
