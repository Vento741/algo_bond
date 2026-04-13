"""Deep debug one backtest of PivotPointMeanReversion.

Analyzes:
- Signal generation rate
- Filter rejection breakdown (which filter rejects how many bars)
- Confluence score distribution
- Zone/direction distribution
- Trade exit reason histogram
- Sample trades with full detail
- Win/loss per exit reason and per zone

Usage:
    python backend/scripts/debug_pivot_mr.py --symbol WLDUSDT --timeframe 5
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import numpy as np
import pandas as pd

from app.modules.backtest.backtest_engine import run_backtest
from app.modules.strategy.engines.base import OHLCV
from app.modules.strategy.engines.indicators.oscillators import squeeze_momentum
from app.modules.strategy.engines.indicators.pivot import pivot_velocity, rolling_pivot
from app.modules.strategy.engines.indicators.trend import atr, dmi, ema, rsi, sma
from app.modules.strategy.engines.pivot_point_mr import (
    REGIME_RANGE,
    REGIME_STRONG_TREND,
    REGIME_WEAK_TREND,
    PivotPointMeanReversion,
)
from scripts.optimize_pivot_point_mr import load_base_config, apply_params

CANDLES_DIR = BACKEND_DIR.parent / "data" / "candles"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--symbol", default="WLDUSDT")
    p.add_argument("--timeframe", default="5")
    p.add_argument("--config", default="default", choices=["default", "best_wld", "hypothesis_fix", "fix_c_tight_sl"])
    return p.parse_args()


def load_candles(symbol: str, timeframe: str) -> OHLCV:
    path = CANDLES_DIR / f"{symbol}_{timeframe}.parquet"
    df = pd.read_parquet(path)
    return OHLCV(
        open=df["open"].to_numpy(dtype=np.float64),
        high=df["high"].to_numpy(dtype=np.float64),
        low=df["low"].to_numpy(dtype=np.float64),
        close=df["close"].to_numpy(dtype=np.float64),
        volume=df["volume"].to_numpy(dtype=np.float64),
        timestamps=df["timestamp"].to_numpy(dtype=np.float64),
    )


def instrument_filters(strat: PivotPointMeanReversion, data: OHLCV) -> dict:
    """Re-implement generate_signals main loop with per-filter counters.

    Returns dict with rejection counts + collected confluence scores + zone/direction distribution.
    """
    cfg = strat._validate_config(strat.config)
    n = len(data)
    counters = Counter({
        "total_bars": 0,
        "pivot_nan": 0,
        "atr_nan_or_zero": 0,
        "deadzone": 0,
        "zone_none": 0,
        "strong_trend_blocked": 0,
        "weak_trend_wrong_dir": 0,
        "rsi_reject": 0,
        "volume_reject": 0,
        "cooldown": 0,
        "anti_impulse": 0,
        "below_min_confluence": 0,
        "empty_tp_levels": 0,
        "signal_created": 0,
    })

    zone_dist: Counter = Counter()
    direction_dist: Counter = Counter()
    confluence_scores: list[float] = []
    regime_dist: Counter = Counter()

    # Compute indicators
    pivot, r1, s1, r2, s2, r3, s3 = rolling_pivot(
        data.high, data.low, data.close, cfg["pivot"]["period"]
    )
    pv = pivot_velocity(pivot, cfg["pivot"]["velocity_lookback"])
    atr_arr = atr(data.high, data.low, data.close, cfg["risk"]["atr_period"])
    _, _, adx_arr = dmi(data.high, data.low, data.close, cfg["filters"]["adx_period"])
    ema_arr = ema(data.close, cfg["trend"]["ema_period"])
    rsi_arr = rsi(data.close, cfg["filters"]["rsi_period"])
    volume_sma = sma(data.volume, cfg["filters"]["volume_sma_period"])
    squeeze_on, _, _ = squeeze_momentum(
        data.high, data.low, data.close,
        bb_period=cfg["filters"]["squeeze_bb_len"],
        bb_mult=cfg["filters"]["squeeze_bb_mult"],
        kc_period=cfg["filters"]["squeeze_kc_len"],
        kc_mult=cfg["filters"]["squeeze_kc_mult"],
    )

    last_signal_bar = -10_000

    for i in range(cfg["pivot"]["period"], n):
        counters["total_bars"] += 1
        pivot_val = pivot[i]
        if np.isnan(pivot_val):
            counters["pivot_nan"] += 1
            continue

        atr_val = atr_arr[i]
        if np.isnan(atr_val) or atr_val < 1e-8:
            counters["atr_nan_or_zero"] += 1
            continue

        close_val = float(data.close[i])
        distance_pct = (close_val - float(pivot_val)) / float(pivot_val) * 100.0

        if abs(distance_pct) < cfg["entry"]["min_distance_pct"]:
            counters["deadzone"] += 1
            continue

        zone_result = strat._detect_zone(
            close_val, float(pivot_val),
            float(s1[i]), float(s2[i]),
            float(r1[i]), float(r2[i]),
        )
        if zone_result is None:
            counters["zone_none"] += 1
            continue
        direction, zone = zone_result

        regime = strat._detect_regime(
            float(adx_arr[i]), float(pv[i]) if not np.isnan(pv[i]) else float("nan"), cfg,
        )

        if regime == REGIME_STRONG_TREND:
            if not cfg["regime"]["allow_strong_trend"]:
                counters["strong_trend_blocked"] += 1
                continue
            ema_val = ema_arr[i]
            if np.isnan(ema_val):
                counters["strong_trend_blocked"] += 1
                continue
            if direction == "long" and close_val <= ema_val:
                counters["strong_trend_blocked"] += 1
                continue
            if direction == "short" and close_val >= ema_val:
                counters["strong_trend_blocked"] += 1
                continue

        if regime == REGIME_WEAK_TREND:
            ema_val = ema_arr[i]
            if np.isnan(ema_val):
                counters["weak_trend_wrong_dir"] += 1
                continue
            if direction == "long" and close_val <= ema_val:
                counters["weak_trend_wrong_dir"] += 1
                continue
            if direction == "short" and close_val >= ema_val:
                counters["weak_trend_wrong_dir"] += 1
                continue

        if cfg["filters"]["rsi_enabled"]:
            rsi_val = rsi_arr[i]
            if np.isnan(rsi_val):
                counters["rsi_reject"] += 1
                continue
            if direction == "long" and rsi_val >= cfg["filters"]["rsi_oversold"]:
                counters["rsi_reject"] += 1
                continue
            if direction == "short" and rsi_val <= cfg["filters"]["rsi_overbought"]:
                counters["rsi_reject"] += 1
                continue

        if cfg["filters"]["volume_filter_enabled"]:
            vol_sma = volume_sma[i]
            if np.isnan(vol_sma) or vol_sma <= 0:
                counters["volume_reject"] += 1
                continue
            if data.volume[i] < vol_sma * cfg["filters"]["volume_min_ratio"]:
                counters["volume_reject"] += 1
                continue

        if (i - last_signal_bar) < cfg["entry"]["cooldown_bars"]:
            counters["cooldown"] += 1
            continue

        window = cfg["entry"]["impulse_check_bars"]
        if i >= window:
            last_bars = data.close[i - window + 1:i + 1] - data.open[i - window + 1:i + 1]
            if direction == "long" and np.all(last_bars < 0):
                counters["anti_impulse"] += 1
                continue
            if direction == "short" and np.all(last_bars > 0):
                counters["anti_impulse"] += 1
                continue

        score = strat._calculate_confluence(
            zone=zone, direction=direction, regime=regime,
            rsi_val=float(rsi_arr[i]),
            squeeze=bool(squeeze_on[i]) if cfg["filters"]["squeeze_enabled"] else False,
            close_val=close_val,
            ema_val=float(ema_arr[i]) if not np.isnan(ema_arr[i]) else float("nan"),
            volume_val=float(data.volume[i]),
            volume_sma_val=float(volume_sma[i]) if not np.isnan(volume_sma[i]) else 0.0,
            cfg=cfg,
        )

        if score < cfg["entry"]["min_confluence"]:
            counters["below_min_confluence"] += 1
            continue

        # Build TP
        tp_levels = strat._build_tp_levels(
            direction=direction, zone=zone, entry=close_val,
            pivot=float(pivot_val),
            s1=float(s1[i]), s2=float(s2[i]), s3=float(s3[i]),
            r1=float(r1[i]), r2=float(r2[i]), r3=float(r3[i]),
            cfg=cfg,
        )
        if not tp_levels:
            counters["empty_tp_levels"] += 1
            continue

        counters["signal_created"] += 1
        confluence_scores.append(score)
        zone_dist[f"{direction}_z{zone}"] += 1
        direction_dist[direction] += 1
        regime_dist[["range", "weak_trend", "strong_trend"][regime]] += 1
        last_signal_bar = i

    return {
        "counters": dict(counters),
        "confluence_scores": confluence_scores,
        "zone_dist": dict(zone_dist),
        "direction_dist": dict(direction_dist),
        "regime_dist": dict(regime_dist),
    }


def analyze_trades(trades_log: list[dict], strat_result_signals: list) -> dict:
    """Analyze backtest trades_log: exit reasons, win rate per reason, avg PnL per reason."""
    exit_reasons: Counter = Counter()
    pnl_by_reason: dict[str, list[float]] = {}

    for t in trades_log:
        reason = t.get("exit_reason", "unknown")
        exit_reasons[reason] += 1
        pnl_by_reason.setdefault(reason, []).append(t.get("pnl", 0.0))

    stats_by_reason: dict[str, dict] = {}
    for reason, pnls in pnl_by_reason.items():
        pnls_arr = np.array(pnls)
        wins = int(np.sum(pnls_arr > 0))
        total = len(pnls_arr)
        stats_by_reason[reason] = {
            "count": total,
            "wr": wins / total if total else 0.0,
            "avg_pnl": float(np.mean(pnls_arr)),
            "median_pnl": float(np.median(pnls_arr)),
            "total_pnl": float(np.sum(pnls_arr)),
        }

    return {
        "exit_reason_counts": dict(exit_reasons),
        "stats_by_reason": stats_by_reason,
        "total_trades": len(trades_log),
    }


def main() -> int:
    args = parse_args()
    data = load_candles(args.symbol, args.timeframe)
    print(f"\n=== DEBUG {args.symbol} {args.timeframe}m — {len(data)} candles ===\n")

    cfg = load_base_config()
    if args.config == "best_wld":
        # Use the best config from previous grid search
        cfg = apply_params(cfg, {
            "pivot.period": 24, "pivot.velocity_lookback": 16,
            "entry.min_distance_pct": 0.25,
            "entry.min_confluence": 1.0,
            "entry.cooldown_bars": 5,
            "entry.impulse_check_bars": 3,
            "filters.rsi_oversold": 35,
            "regime.adx_strong_trend": 25,
            "risk.sl_max_pct": 0.02,
            "risk.tp1_close_pct": 0.7,
            "risk.tp2_close_pct": 0.3,
            "risk.trailing_atr_mult": 2.0,
        })
        print("Using best_wld config from previous grid search")
    elif args.config == "hypothesis_fix":
        cfg = apply_params(cfg, {
            "pivot.period": 48,
            "entry.min_distance_pct": 0.25,
            "entry.min_confluence": 2.0,
            "entry.cooldown_bars": 5,
            "risk.sl_max_pct": 0.02,
            "risk.tp1_close_pct": 1.0,       # 100% close on TP1 — no trailing phase
            "risk.tp2_close_pct": 0.0,
            "risk.trailing_atr_mult": 0.0,   # disabled — all closes on TP1
        })
        print("Using HYPOTHESIS FIX: tp1=100%, trailing=0 (all-in TP1 at pivot)")
    elif args.config == "fix_c_tight_sl":
        cfg = apply_params(cfg, {
            "pivot.period": 48,
            "entry.min_distance_pct": 0.25,
            "entry.min_confluence": 2.0,
            "entry.cooldown_bars": 5,
            "risk.sl_max_pct": 0.005,        # 0.5% tight SL (was 2%)
            "risk.sl_atr_mult": 0.1,         # tiny ATR buffer
            "risk.tp1_close_pct": 0.7,
            "risk.tp2_close_pct": 0.3,
            "risk.trailing_atr_mult": 0.0,   # no trailing
        })
        print("Using FIX C: tight SL 0.5% + partial TP (70/30) + no trailing")
    else:
        print("Using default config from seed")

    strat = PivotPointMeanReversion(cfg)

    # Phase 1: signal generation with filter instrumentation
    print("\n--- Filter Chain Analysis ---")
    debug = instrument_filters(strat, data)
    counters = debug["counters"]
    total = counters["total_bars"]
    for name, count in counters.items():
        if name == "total_bars":
            print(f"  {name}: {count}")
            continue
        pct = count / total * 100 if total else 0
        print(f"  {name}: {count} ({pct:.1f}%)")

    # Confluence distribution
    scores = debug["confluence_scores"]
    if scores:
        arr = np.array(scores)
        print(f"\n--- Confluence Score Distribution ({len(scores)} signals) ---")
        print(f"  min={arr.min():.2f}  p25={np.percentile(arr, 25):.2f}  median={np.median(arr):.2f}  "
              f"p75={np.percentile(arr, 75):.2f}  max={arr.max():.2f}  mean={arr.mean():.2f}")
        print(f"  Unique values: {sorted(set(scores))[:10]}{'...' if len(set(scores)) > 10 else ''}")

    print(f"\n--- Zone Distribution ---")
    for k, v in sorted(debug["zone_dist"].items()):
        print(f"  {k}: {v}")

    print(f"\n--- Regime Distribution (signal bars) ---")
    for k, v in sorted(debug["regime_dist"].items()):
        print(f"  {k}: {v}")

    # Phase 2: full backtest + trades analysis
    print("\n--- Backtest + Trades Analysis ---")
    result = strat.generate_signals(data)
    signals = result.signals
    print(f"  Signals returned: {len(signals)}")

    if not signals:
        print("  No signals — cannot run backtest")
        return 0

    bt_cfg = cfg.get("backtest", {})
    metrics = run_backtest(
        ohlcv=data,
        signals=signals,
        initial_capital=100.0,
        commission_pct=float(bt_cfg.get("commission", 0.06)),
        slippage_pct=float(bt_cfg.get("slippage", 0.03)),
        order_size_pct=75.0,
        use_multi_tp=True,
        use_breakeven=True,
        timeframe_minutes=int(args.timeframe),
        leverage=1,
        on_reverse="close",
    )

    print(f"  Total trades: {metrics.total_trades}")
    print(f"  PnL: {metrics.total_pnl_pct:.2f}%  (${metrics.total_pnl:.2f})")
    print(f"  Win Rate: {metrics.win_rate:.3f}")
    print(f"  Profit Factor: {metrics.profit_factor:.2f}")
    print(f"  Max DD: {metrics.max_drawdown:.2f}%")
    print(f"  Sharpe: {metrics.sharpe_ratio:.2f}")

    trades_log = metrics.trades_log or []

    print(f"\n--- Exit Reason Breakdown ---")
    analysis = analyze_trades(trades_log, signals)
    for reason, stats in sorted(analysis["stats_by_reason"].items(), key=lambda x: -x[1]["count"]):
        print(
            f"  {reason:18s}  count={stats['count']:4d}  wr={stats['wr']:.2f}  "
            f"avg_pnl={stats['avg_pnl']:+.3f}  total={stats['total_pnl']:+.2f}"
        )

    # Sample 10 representative trades (5 wins + 5 losses)
    if trades_log:
        wins = [t for t in trades_log if t.get("pnl", 0) > 0][:5]
        losses = [t for t in trades_log if t.get("pnl", 0) < 0][:5]

        print(f"\n--- Sample Winning Trades ---")
        for t in wins:
            print(f"  bar {t.get('entry_bar')}→{t.get('exit_bar')} {t.get('direction'):5s}  "
                  f"entry={t.get('entry_price'):.4f}  exit={t.get('exit_price'):.4f}  "
                  f"pnl=${t.get('pnl', 0):+.3f}  reason={t.get('exit_reason')}")

        print(f"\n--- Sample Losing Trades ---")
        for t in losses:
            print(f"  bar {t.get('entry_bar')}→{t.get('exit_bar')} {t.get('direction'):5s}  "
                  f"entry={t.get('entry_price'):.4f}  exit={t.get('exit_price'):.4f}  "
                  f"pnl=${t.get('pnl', 0):+.3f}  reason={t.get('exit_reason')}")

    # Avg duration per exit reason
    if trades_log:
        dur_by_reason: dict[str, list[int]] = {}
        for t in trades_log:
            reason = t.get("exit_reason", "unknown")
            dur = t.get("exit_bar", 0) - t.get("entry_bar", 0)
            dur_by_reason.setdefault(reason, []).append(dur)
        print(f"\n--- Avg Duration by Exit Reason (bars) ---")
        for reason, durs in sorted(dur_by_reason.items()):
            print(f"  {reason:18s}  avg={np.mean(durs):.1f}  median={np.median(durs):.0f}  n={len(durs)}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
