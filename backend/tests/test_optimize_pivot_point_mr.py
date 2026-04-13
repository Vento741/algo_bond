"""Тесты для optimize_pivot_point_mr.py."""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
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
        assert args.phase == "all"
        assert args.top_n == 10
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
        cfg1 = load_base_config()
        cfg1["pivot"]["period"] = 999
        cfg2 = load_base_config()
        assert cfg2["pivot"]["period"] == 48
