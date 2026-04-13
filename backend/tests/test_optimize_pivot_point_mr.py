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


class TestApplyParams:
    def test_flat_key(self) -> None:
        base = {"pivot": {"period": 48}}
        result = apply_params(base, {"pivot.period": 96})
        assert result["pivot"]["period"] == 96
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
            "total_pnl_pct": 30, "max_drawdown": 8, "total_trades": 25,
            "win_rate": 0.65, "profit_factor": 2.0,
            "avg_trade_duration_bars": 12, "max_winning_streak": 4,
        }
        score = score_mean_reversion(m)
        assert score > 50

    def test_high_dd_penalty(self) -> None:
        bad = {"total_pnl_pct": 30, "max_drawdown": 40, "total_trades": 25,
               "win_rate": 0.65, "profit_factor": 2.0}
        good = {"total_pnl_pct": 30, "max_drawdown": 8, "total_trades": 25,
                "win_rate": 0.65, "profit_factor": 2.0}
        assert score_mean_reversion(bad) < score_mean_reversion(good)

    def test_mean_reversion_streak_penalty(self) -> None:
        m_normal = {"total_pnl_pct": 30, "max_drawdown": 8, "total_trades": 25,
                    "win_rate": 0.65, "profit_factor": 2.0, "max_winning_streak": 5}
        m_streaky = {**m_normal, "max_winning_streak": 15}
        assert score_mean_reversion(m_streaky) < score_mean_reversion(m_normal)


class TestRunOneBacktest:
    def test_runs_end_to_end_with_synthetic_data(self, tmp_path) -> None:
        from scripts.optimize_pivot_point_mr import (
            run_one_backtest,
            load_base_config,
        )

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

        args = ("SYNTHUSDT", "1", loose_cfg, 0, str(tmp_path))
        result = run_one_backtest(args)

        assert "run_id" in result
        assert "symbol" in result
        assert "metrics" in result
        assert "score" in result
        assert result["symbol"] == "SYNTHUSDT"
        assert "total_trades" in result["metrics"]
        assert "max_drawdown" in result["metrics"]
