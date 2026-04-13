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
    )
    parser.add_argument("--top-n", type=int, default=10)
    parser.add_argument("--days", type=int, default=180)
    return parser.parse_args(argv)


def load_base_config() -> dict:
    """Load default config for pivot_point_mr from seed_strategy.py."""
    from scripts.seed_strategy import STRATEGIES

    for s in STRATEGIES:
        if s["slug"] == "pivot-point-mr":
            return copy.deepcopy(s["default_config"])
    raise RuntimeError("pivot-point-mr not found in seed STRATEGIES")


def apply_params(base: dict, params: dict[str, Any]) -> dict:
    """Apply flat params dict (nested via dot notation) to base config."""
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
    """Score configs for mean reversion. Note: win_rate is 0-1 fraction."""
    pnl = metrics.get("total_pnl_pct", 0.0)
    dd = metrics.get("max_drawdown", 100.0)
    trades = metrics.get("total_trades", 0)
    wr = metrics.get("win_rate", 0.0)
    pf = metrics.get("profit_factor", 0.0)

    if trades < 3:
        return -999.0

    score = pnl - dd * 0.3

    if wr > 0.4:
        score += (wr - 0.4) * 50
    if pf > 1.5:
        score += (pf - 1.5) * 10
    if trades >= 10:
        score += min(trades, 50) * 0.5

    avg_duration = metrics.get("avg_trade_duration_bars", 0)
    if 0 < avg_duration < 20:
        score += 5

    max_streak = metrics.get("max_winning_streak", 0)
    if max_streak > 10:
        score -= 10

    if trades < 5:
        score -= 20

    return round(score, 2)


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
    """Serialize BacktestMetrics dataclass to dict, extract MR-specific stats."""
    trades_log = getattr(metrics, "trades_log", []) or []

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
    """Multiprocessing worker: run one config backtest."""
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
