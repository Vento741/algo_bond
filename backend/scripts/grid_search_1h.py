"""One-off grid search for PivotPointMeanReversion on 1h timeframe.

Starts from hypothesis_fix base (tp1=100%, trailing=0) and explores parameters
focused on improving hit rate and R/R ratio.
"""

from __future__ import annotations

import copy
import itertools
import json
import logging
import sys
import time
from datetime import datetime, timezone
from multiprocessing import Pool, cpu_count
from pathlib import Path

BACKEND_DIR = Path(__file__).parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import numpy as np
import pandas as pd

from scripts.optimize_pivot_point_mr import (
    load_base_config,
    apply_params,
    expand_grid,
    run_one_backtest,
    score_mean_reversion,
    _save_progress,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

CANDLES_DIR = BACKEND_DIR.parent / "data" / "candles"
RESULTS_DIR = BACKEND_DIR.parent / "optimize_results"

# Base config — hypothesis_fix transform applied
HYPOTHESIS_OVERRIDE = {
    "risk.tp1_close_pct": 1.0,
    "risk.tp2_close_pct": 0.0,
    "risk.trailing_atr_mult": 0.0,
}

# Grid focused on improving 1h economics from marginal PF 1.10 to >1.30
GRID_1H = {
    "pivot.period": [24, 48, 96],
    "entry.min_distance_pct": [0.20, 0.35, 0.50, 0.75],
    "entry.min_confluence": [2.0, 2.5, 3.0, 3.5],
    "risk.sl_max_pct": [0.01, 0.015, 0.02, 0.03],
    "entry.cooldown_bars": [3, 5, 10],
    "filters.rsi_oversold": [30, 35, 40],
}
# Total: 3 * 4 * 4 * 4 * 3 * 3 = 1728 per token

SYMBOLS = ["WLDUSDT", "LDOUSDT", "NEARUSDT", "INJUSDT"]
TIMEFRAME = "60"


def main() -> None:
    base = load_base_config()
    base = apply_params(base, HYPOTHESIS_OVERRIDE)

    grid_combos = expand_grid(GRID_1H)
    workers = max(1, cpu_count() - 2)
    logger.info("Grid size: %d combos per token, %d workers", len(grid_combos), workers)

    all_token_results = {}

    for symbol in SYMBOLS:
        path = CANDLES_DIR / f"{symbol}_{TIMEFRAME}.parquet"
        if not path.exists():
            logger.error("Missing cache: %s", path)
            continue

        logger.info("=" * 60)
        logger.info("Optimizing %s 1h", symbol)
        logger.info("=" * 60)

        tasks = [
            (symbol, TIMEFRAME, apply_params(base, combo), run_id, str(CANDLES_DIR))
            for run_id, combo in enumerate(grid_combos)
        ]

        start = time.time()
        with Pool(workers) as pool:
            results = pool.map(run_one_backtest, tasks)
        elapsed = time.time() - start
        logger.info("  %d backtests in %.1fs (%.2fs per backtest)", len(tasks), elapsed, elapsed / len(tasks))

        # Sort all by score, then filter to realistic trade count (>=20 for stat significance)
        results.sort(key=lambda r: r.get("score", -999.0), reverse=True)
        all_token_results[symbol] = results

        realistic = [r for r in results if r["metrics"].get("total_trades", 0) >= 20]
        top = realistic[:5] if realistic else results[:5]
        logger.info("  Top 5 for %s (min 20 trades):", symbol)
        for i, r in enumerate(top, 1):
            m = r["metrics"]
            c = r["config"]
            logger.info(
                "    #%d score=%.1f pnl=%.1f%% wr=%.2f pf=%.2f dd=%.1f%% trades=%d | period=%s min_dist=%s min_conf=%s sl=%s cooldown=%s rsi=%s",
                i, r["score"], m.get("total_pnl_pct", 0),
                m.get("win_rate", 0), m.get("profit_factor", 0),
                m.get("max_drawdown", 0), m.get("total_trades", 0),
                c["pivot"]["period"], c["entry"]["min_distance_pct"],
                c["entry"]["min_confluence"], c["risk"]["sl_max_pct"],
                c["entry"]["cooldown_bars"], c["filters"]["rsi_oversold"],
            )

        # Save per-token results
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        out = RESULTS_DIR / f"pivot_mr_{symbol}_60_grid1h_{ts}.json"
        with out.open("w", encoding="utf-8") as f:
            json.dump({
                "symbol": symbol,
                "timeframe": TIMEFRAME,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "grid_combos_tested": len(tasks),
                "top_20": results[:20],
            "top_20_filtered": realistic[:20],
                "base_config": base,
            }, f, indent=2, default=str)
        logger.info("  Saved: %s", out.name)

    # Summary
    logger.info("=" * 60)
    logger.info("SUMMARY — best per token")
    logger.info("=" * 60)
    for symbol, results in all_token_results.items():
        if not results:
            continue
        best = results[0]
        m = best["metrics"]
        logger.info(
            "  %s: score=%.1f pnl=%.1f%% wr=%.2f pf=%.2f dd=%.1f%% trades=%d",
            symbol, best["score"],
            m.get("total_pnl_pct", 0), m.get("win_rate", 0),
            m.get("profit_factor", 0), m.get("max_drawdown", 0),
            m.get("total_trades", 0),
        )


if __name__ == "__main__":
    main()
