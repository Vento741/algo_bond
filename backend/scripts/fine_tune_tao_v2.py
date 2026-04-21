"""Fine-grid вокруг TAO v2 best config.

Цель: сохранить частоту ~150+ сделок / 110-180 дней, повысить PnL / WR / PF.
Гипотеза: trailing_stop режет runners (-178 USDT на последнем бэктесте TAO).
Варианты: disable_trailing=True или очень широкий trailing.

Sweep/Confirmation/Filters НЕ трогаем (они контролируют частоту).
Варьируем только risk.* — TP distribution, SL buffer, trailing.

Usage (локально):
  python backend/scripts/fine_tune_tao_v2.py --symbol TAOUSDT --workers 12 --days 180
"""

from __future__ import annotations

import argparse
import copy
import itertools
import json
import logging
import sys
import time
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

CANDLES_DIR = BACKEND_DIR.parent / "data" / "candles"
RESULTS_DIR = BACKEND_DIR.parent / "optimize_results"

# Сетка поверх risk (sweep/confirmation/filters/entry не трогаем — они фиксируют частоту)
FINE_GRID: dict[str, list[Any]] = {
    "risk.disable_trailing": [True, False],
    "risk.trailing_atr_mult": [3.0, 5.0, 7.0, 10.0],
    "risk.tp1_r_mult": [0.75, 1.0, 1.25, 1.5],
    "risk.tp1_close_pct": [0.4, 0.5, 0.6],
    "risk.tp2_r_mult": [1.5, 2.0, 2.5],
    "risk.tp2_close_pct": [0.2, 0.3, 0.4],
    "risk.tp3_enabled": [True, False],
    "risk.tp3_r_mult": [3.0, 4.0, 5.0],
    "risk.tp3_close_pct": [0.1, 0.2],
    "risk.sl_atr_buffer": [0.2, 0.3, 0.5],
    "risk.sl_max_pct": [0.012, 0.015, 0.018],
}


def load_tao_base_config() -> dict:
    """Base = current best TAO v2 config from portfolio import_ready."""
    portfolio_path = RESULTS_DIR / "smc_scalper_v2_portfolio_import_ready.json"
    with portfolio_path.open("r", encoding="utf-8") as f:
        p = json.load(f)
    return copy.deepcopy(p["tokens"]["TAOUSDT"]["config"])


def apply_overrides(base: dict, overrides: dict) -> dict:
    cfg = copy.deepcopy(base)
    for dotted, val in overrides.items():
        section, field = dotted.split(".")
        cfg.setdefault(section, {})[field] = val
    # Обеспечить multi_tp + breakeven (celery-compatible)
    cfg.setdefault("risk", {})
    cfg["risk"].setdefault("use_multi_tp", True)
    cfg["risk"].setdefault("use_breakeven", True)
    return cfg


def load_ohlcv(symbol: str, days: int) -> OHLCV:
    """Загрузить последние N дней 5m свечей."""
    path = CANDLES_DIR / f"{symbol}_5.parquet"
    df = pd.read_parquet(path)
    bars = days * 24 * 12  # 5m bars/day
    df = df.tail(bars).reset_index(drop=True)
    return OHLCV(
        open=df["open"].values.astype(np.float64),
        high=df["high"].values.astype(np.float64),
        low=df["low"].values.astype(np.float64),
        close=df["close"].values.astype(np.float64),
        volume=df["volume"].values.astype(np.float64),
        timestamps=df["timestamp"].values.astype(np.float64),
    )


def run_one(args: tuple[dict, dict, OHLCV]) -> dict:
    base, overrides, ohlcv = args
    cfg = apply_overrides(base, overrides)
    engine = get_engine("smc_sweep_scalper_v2", cfg)
    res = engine.generate_signals(ohlcv)
    bt_cfg = cfg.get("backtest", {})
    live_cfg = cfg.get("live", {})
    metrics = run_backtest(
        ohlcv=ohlcv,
        signals=res.signals,
        initial_capital=100.0,
        commission_pct=float(bt_cfg.get("commission", 0.06)),
        slippage_pct=float(bt_cfg.get("slippage", 0.03)),
        order_size_pct=float(bt_cfg.get("order_size", 75)),
        use_multi_tp=True,
        use_breakeven=True,
        timeframe_minutes=5,
        leverage=int(live_cfg.get("leverage", 5)),
        on_reverse="close",
    )
    return {
        "overrides": overrides,
        "trades": metrics.total_trades,
        "pnl_pct": metrics.total_pnl_pct,
        "win_rate": metrics.win_rate,
        "profit_factor": metrics.profit_factor,
        "max_drawdown": metrics.max_drawdown,
        "sharpe_ratio": metrics.sharpe_ratio,
    }


def score(m: dict, min_trades: int) -> float:
    if m["trades"] < min_trades:
        return -999.0
    pnl = m["pnl_pct"]
    dd = m["max_drawdown"]
    pf = m["profit_factor"] if m["profit_factor"] != float("inf") else 5.0
    wr = m["win_rate"]
    s = pnl - dd * 0.3
    if wr > 0.55: s += (wr - 0.55) * 100
    if pf > 1.3: s += (pf - 1.3) * 30
    if pf < 1.0: s -= 50
    if dd > 40: s -= 20
    return round(s, 2)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--symbol", default="TAOUSDT")
    p.add_argument("--days", type=int, default=180)
    p.add_argument("--workers", type=int, default=None)
    p.add_argument("--min-trades", type=int, default=150, help="минимум сделок чтобы засчитать конфиг")
    p.add_argument("--top-n", type=int, default=15)
    return p.parse_args()


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    args = parse_args()

    base = load_tao_base_config()
    logger.info("Base TAO config loaded")

    ohlcv = load_ohlcv(args.symbol, args.days)
    logger.info("Loaded %d bars for %s", len(ohlcv), args.symbol)

    # Произведение всей сетки
    keys = list(FINE_GRID.keys())
    combos = list(itertools.product(*[FINE_GRID[k] for k in keys]))
    # Random sampling если слишком много
    if len(combos) > 3000:
        import random
        random.seed(42)
        combos = random.sample(combos, 3000)
    overrides_list = [dict(zip(keys, c)) for c in combos]
    logger.info("Testing %d combinations", len(overrides_list))

    workers = args.workers or max(1, cpu_count() - 2)
    t0 = time.time()
    tasks = [(base, ov, ohlcv) for ov in overrides_list]
    with Pool(workers) as pool:
        results = pool.map(run_one, tasks)
    logger.info("Done in %.1fs (%.3fs per bt)", time.time()-t0, (time.time()-t0)/len(results))

    # Score and sort
    for r in results:
        r["score"] = score(r, args.min_trades)
    results.sort(key=lambda r: r["score"], reverse=True)

    top = results[:args.top_n]
    print()
    print(f'{"#":>3} | {"trades":>6} | {"pnl%":>7} | {"WR":>5} | {"PF":>5} | {"DD":>5} | {"SR":>4} | {"score":>6} | overrides')
    print('-'*120)
    for i, r in enumerate(top, 1):
        ov_str = ', '.join(f"{k.split('.')[-1]}={v}" for k,v in r['overrides'].items())
        print(f"{i:>3} | {r['trades']:>6} | {r['pnl_pct']:>+6.1f} | {r['win_rate']*100:>4.1f} | {r['profit_factor']:>5.2f} | {r['max_drawdown']:>5.1f} | {r['sharpe_ratio']:>4.1f} | {r['score']:>+6.1f} | {ov_str[:80]}")

    # Save top
    out = RESULTS_DIR / f"tao_v2_finetune_top{args.top_n}.json"
    with out.open("w", encoding="utf-8") as f:
        json.dump({"base": base, "top": top, "total_tested": len(results)}, f, indent=2, ensure_ascii=False)
    logger.info("Saved top to %s", out)

    return 0


if __name__ == "__main__":
    sys.exit(main())
