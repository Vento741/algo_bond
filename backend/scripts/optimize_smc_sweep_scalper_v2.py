"""Grid search optimizer for SMCSweepScalperV2Strategy.

V2 добавляет новые параметры в grid:
  - risk.trailing_atr_mult: [2.0, 3.0, 4.0, 5.0]
  - risk.disable_trailing: [True, False]
  - filters.atr_percentile_min: [0.30, 0.40, 0.50]
  - filters.session_filter_enabled: [True, False]
  - filters.htf_bias_enabled: [True, False]
  - risk.tp1_r_mult: [0.5, 0.75, 1.0]
  - risk.tp2_r_mult: [1.5, 2.0]
  - risk.tp3_r_mult: [2.5, 3.0, 4.0]

Usage:
    python backend/scripts/optimize_smc_sweep_scalper_v2.py \
        --symbols NEARUSDT \
        --timeframe 5 \
        --phase coarse \
        --workers 4
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

ENGINE_TYPE = "smc_sweep_scalper_v2"
SLUG = "smc-sweep-scalper-v2"

# === Grid definitions ===
# Coarse: базовая частота / риск / confluence / v2 фильтры on-off
PHASE1_COARSE_GRID: dict[str, list[Any]] = {
    "sweep.lookback": [10, 20, 30],
    "entry.min_confluence": [1.0, 1.5, 2.0],
    "risk.sl_max_pct": [0.008, 0.012, 0.015],
    "risk.tp1_r_mult": [0.5, 0.75, 1.0],
    "risk.tp2_r_mult": [1.5, 2.0],
    "risk.tp3_r_mult": [2.5, 3.0, 4.0],
    "risk.disable_trailing": [True, False],
    "filters.session_filter_enabled": [True, False],
    "filters.htf_bias_enabled": [True, False],
    "filters.atr_percentile_min": [0.30, 0.40, 0.50],
}

# Fine: подстройка partial close / buffer / trailing / cooldown / ATR-max / volume
PHASE2_FINE_ADDITIONAL_GRID: dict[str, list[Any]] = {
    "confirmation.window": [2, 3, 5],
    "filters.volume_min_ratio": [1.0, 1.2, 1.5],
    "filters.rsi_filter_enabled": [True, False],
    "risk.trailing_atr_mult": [2.0, 3.0, 4.0, 5.0],
    "risk.sl_atr_buffer": [0.2, 0.3, 0.5],
    "entry.cooldown_bars": [2, 3, 5],
    "filters.atr_percentile_max": [0.90, 0.95, 1.0],
}

# Tuning: тонкие крутилки
PHASE3_TUNING_GRID: dict[str, list[Any]] = {
    "risk.tp1_close_pct": [0.4, 0.5, 0.6],
    "risk.tp2_close_pct": [0.2, 0.3, 0.4],
    "risk.tp3_close_pct": [0.1, 0.2, 0.3],
    "confirmation.fvg_min_size": [0.2, 0.3, 0.5],
    "filters.htf_slope_min": [0.0001, 0.0002, 0.0005],
}

# Выборки, чтобы не взорвать комбинаторику
PHASE1_MAX_COMBINATIONS = 1500
PHASE2_MAX_COMBINATIONS = 500
PHASE3_TOP_N_BASELINE = 3


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse CLI args for optimizer."""
    parser = argparse.ArgumentParser(
        description="Grid search optimizer for SMCSweepScalperV2Strategy",
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
    """Load default config for smc-sweep-scalper-v2 from seed_strategy.py."""
    from scripts.seed_strategy import STRATEGIES

    for s in STRATEGIES:
        if s["slug"] == SLUG:
            return copy.deepcopy(s["default_config"])
    raise RuntimeError(f"{SLUG} not found in seed STRATEGIES")


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


def score_scalping(metrics: dict) -> float:
    """Score configs for scalping. Scalpers need высокую trade frequency.

    V2 изменения:
      - Порог минимума сделок снижен с 50 до 30 (менее агрессивная обрезка).
      - Потолок бонуса поднят до 3000 сделок.
    """
    pnl = metrics.get("total_pnl_pct", 0.0)
    dd = metrics.get("max_drawdown", 100.0)
    trades = metrics.get("total_trades", 0)
    wr = metrics.get("win_rate", 0.0)
    pf = metrics.get("profit_factor", 0.0)

    # V2: минимум 30 сделок (было 50)
    if trades < 30:
        return -999.0

    # Core: PnL adjusted by drawdown
    score = pnl - dd * 0.5

    # V2: расширенный окна target frequency
    if 900 <= trades <= 3000:
        score += 15
    elif 500 <= trades < 900:
        score += 8
    elif 30 <= trades < 500:
        score += 2
    elif trades > 3000:
        score -= 10

    # Quality bonuses
    if wr > 0.45:
        score += (wr - 0.45) * 80
    if pf > 1.3:
        score += (pf - 1.3) * 20
    if pf < 1.0:
        score -= 30

    if dd > 40:
        score -= 30

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
    """Serialize BacktestMetrics dataclass to dict + extract trade-level stats."""
    trades_log = getattr(metrics, "trades_log", []) or []

    durations = []
    wins_streak = 0
    max_streak = 0
    loss_streak = 0
    max_loss_streak = 0
    for t in trades_log:
        entry_bar = t.get("entry_bar", 0)
        exit_bar = t.get("exit_bar", entry_bar)
        durations.append(exit_bar - entry_bar)
        pnl = t.get("pnl", 0.0)
        if pnl > 0:
            wins_streak += 1
            max_streak = max(max_streak, wins_streak)
            loss_streak = 0
        else:
            loss_streak += 1
            max_loss_streak = max(max_loss_streak, loss_streak)
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
        "max_losing_streak": max_loss_streak,
    }


def run_one_backtest(args: tuple) -> dict:
    """Multiprocessing worker: run one config backtest."""
    symbol, timeframe, config, run_id, cache_dir_str = args
    try:
        path = Path(cache_dir_str) / f"{symbol}_{timeframe}.parquet"
        df = pd.read_parquet(path)
        ohlcv = _dataframe_to_ohlcv(df)

        engine = get_engine(ENGINE_TYPE, config)
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
            leverage=int(config.get("live", {}).get("leverage", 5)),
            on_reverse="close",
        )

        metrics_dict = _metrics_to_dict(metrics)
        score = score_scalping(metrics_dict)

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
    """Run one phase: for each base config, try all grid combinations."""
    grid_combos = expand_grid(grid)
    tasks = []
    run_id = 0
    for base in base_configs:
        for combo in grid_combos:
            cfg = apply_params(base, combo)
            tasks.append((symbol, timeframe, cfg, run_id, str(cache_dir)))
            run_id += 1

    if max_combinations is not None and len(tasks) > max_combinations:
        rng = np.random.default_rng(42)
        indices = rng.choice(len(tasks), size=max_combinations, replace=False)
        tasks = [tasks[i] for i in sorted(indices)]
        logger.info(
            "%s: sampled %d from %d combinations",
            phase_name,
            len(tasks),
            len(grid_combos) * len(base_configs),
        )

    logger.info(
        "%s: running %d backtests on %d workers...",
        phase_name,
        len(tasks),
        workers,
    )
    start = time.time()

    if workers == 1:
        results = [run_one_backtest(t) for t in tasks]
    else:
        with Pool(workers) as pool:
            results = pool.map(run_one_backtest, tasks)

    elapsed = time.time() - start
    logger.info(
        "%s: done in %.1fs (%.2fs per backtest)",
        phase_name,
        elapsed,
        elapsed / max(len(tasks), 1),
    )

    results.sort(key=lambda r: r.get("score", -999.0), reverse=True)
    return results


def _save_progress(symbol: str, timeframe: str, phase: str, results: list[dict]) -> Path:
    """Save intermediate results after each phase."""
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    path = RESULTS_DIR / f"smc_scalper_v2_{symbol}_{timeframe}_{phase}_{ts}.json"
    with path.open("w", encoding="utf-8") as f:
        json.dump({
            "symbol": symbol,
            "timeframe": timeframe,
            "phase": phase,
            "timestamp": ts,
            "count": len(results),
            "results": results,
        }, f, indent=2, default=str)
    logger.info("Saved %s phase progress -> %s", phase, path.name)
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

    final_phase = next(
        (p for p in ("tuning", "fine", "coarse") if p in phase_results),
        "coarse",
    )
    final_top = phase_results[final_phase][:top_n]

    json_path = RESULTS_DIR / f"smc_scalper_v2_{symbol}_{timeframe}_{ts}.json"
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

    md_path = RESULTS_DIR / f"smc_scalper_v2_{symbol}_{timeframe}_{ts}.md"
    lines = [
        f"# SMC Sweep Scalper v2 -- {symbol} {timeframe}m -- {ts[:8]}",
        "",
        f"**Runtime:** {runtime_seconds:.1f}s  |  **Final phase:** {final_phase}  |  **Top-{top_n}**",
        "",
        "## Top Configs",
        "",
        "| # | Score | PnL% | DD% | WR | PF | Sharpe | Trades | AvgDur | min_conf | sl_max | tp1_R | tp2_R | tp3_R | disable_trail | session | htf |",
        "|---|-------|------|-----|-----|-----|--------|--------|--------|----------|--------|-------|-------|-------|---------------|---------|-----|",
    ]
    for i, r in enumerate(final_top, 1):
        m = r["metrics"]
        c = r["config"]
        lines.append(
            f"| {i} | {r['score']:.1f} | {m.get('total_pnl_pct', 0):.1f} | "
            f"{m.get('max_drawdown', 0):.1f} | {m.get('win_rate', 0):.2f} | "
            f"{m.get('profit_factor', 0):.2f} | {m.get('sharpe_ratio', 0):.2f} | "
            f"{m.get('total_trades', 0)} | {m.get('avg_trade_duration_bars', 0):.1f} | "
            f"{c.get('entry', {}).get('min_confluence', '?')} | "
            f"{c.get('risk', {}).get('sl_max_pct', '?')} | "
            f"{c.get('risk', {}).get('tp1_r_mult', '?')} | "
            f"{c.get('risk', {}).get('tp2_r_mult', '?')} | "
            f"{c.get('risk', {}).get('tp3_r_mult', '?')} | "
            f"{c.get('risk', {}).get('disable_trailing', '?')} | "
            f"{c.get('filters', {}).get('session_filter_enabled', '?')} | "
            f"{c.get('filters', {}).get('htf_bias_enabled', '?')} |"
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
    """Run full optimization pipeline for one symbol+timeframe."""
    start_time = time.time()
    base_config = load_base_config()

    phase_results: dict[str, list[dict]] = {}

    if phase in ("coarse", "all"):
        results_coarse = _run_phase(
            "coarse", [base_config], PHASE1_COARSE_GRID,
            symbol, timeframe, workers, cache_dir,
            max_combinations=PHASE1_MAX_COMBINATIONS,
        )
        phase_results["coarse"] = results_coarse
        _save_progress(symbol, timeframe, "coarse", results_coarse)

    if phase in ("fine", "all"):
        if "coarse" not in phase_results:
            raise RuntimeError("Fine phase requires coarse phase results")
        top10_coarse = [r["config"] for r in phase_results["coarse"][:10]]
        results_fine = _run_phase(
            "fine", top10_coarse, PHASE2_FINE_ADDITIONAL_GRID,
            symbol, timeframe, workers, cache_dir,
            max_combinations=PHASE2_MAX_COMBINATIONS,
        )
        phase_results["fine"] = results_fine
        _save_progress(symbol, timeframe, "fine", results_fine)

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
