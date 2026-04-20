"""Диагностический разбор SMC Sweep Scalper v1.

Однократный анализ провала v1 на 5m крипто-фьючерсах.
Не трогает движок — только запускает бэктесты на уже оптимизированных
конфигах и режет trades_log по разным осям.

Usage:
    python backend/scripts/diagnose_smc_scalper_v1.py
"""
from __future__ import annotations

import copy
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import numpy as np
import pandas as pd

from app.modules.backtest.backtest_engine import run_backtest
from app.modules.strategy.engines import get_engine
from app.modules.strategy.engines.base import OHLCV

ROOT = BACKEND_DIR.parent
CANDLES_DIR = ROOT / "data" / "candles"
RESULTS_DIR = ROOT / "optimize_results"

TOKENS = ["NEARUSDT", "BTCUSDT", "ETHUSDT", "SOLUSDT", "LDOUSDT", "WLDUSDT", "INJUSDT"]


def load_candles(symbol: str, tf: str = "5") -> tuple[OHLCV, pd.DataFrame]:
    path = CANDLES_DIR / f"{symbol}_{tf}.parquet"
    df = pd.read_parquet(path)
    ohlcv = OHLCV(
        open=df["open"].to_numpy(dtype=np.float64),
        high=df["high"].to_numpy(dtype=np.float64),
        low=df["low"].to_numpy(dtype=np.float64),
        close=df["close"].to_numpy(dtype=np.float64),
        volume=df["volume"].to_numpy(dtype=np.float64),
        timestamps=df["timestamp"].to_numpy(dtype=np.float64),
    )
    return ohlcv, df


def load_best_config(symbol: str) -> dict | None:
    """Берём best config из final_top_10 (import_ready для NEAR, иначе timestamped)."""
    candidates = sorted(RESULTS_DIR.glob(f"smc_scalper_{symbol}_5_import_ready.json"))
    if not candidates:
        candidates = sorted(
            RESULTS_DIR.glob(f"smc_scalper_{symbol}_5_2026*.json"),
            reverse=True,
        )
    for p in candidates:
        data = json.loads(p.read_text(encoding="utf-8"))
        if "final_top_10" in data and data["final_top_10"]:
            return copy.deepcopy(data["final_top_10"][0]["config"])
    return None


def run_bt(symbol: str, cfg: dict) -> tuple[dict, list[dict]]:
    ohlcv, _ = load_candles(symbol)
    engine = get_engine("smc_sweep_scalper", cfg)
    result = engine.generate_signals(ohlcv)
    # map signals → indicators by bar_index (trades_log lacks confirmation_type)
    sig_by_bar: dict[int, dict] = {}
    for s in result.signals:
        sig_by_bar[s.bar_index] = {
            "direction": s.direction,
            "confirmation_type": s.indicators.get("confirmation_type", ""),
            "confluence_score": float(s.confluence_score),
            "confluence_tier": s.indicators.get("confluence_tier", ""),
            "volume_ratio": float(s.indicators.get("volume_ratio", 0.0)),
            "rsi": float(s.indicators.get("rsi", 0.0)),
            "risk_r": float(s.indicators.get("risk_r", 0.0)),
            "ema_aligned": bool(s.indicators.get("ema_aligned", False)),
        }

    bt_cfg = cfg.get("backtest", {})
    metrics = run_backtest(
        ohlcv=ohlcv,
        signals=result.signals,
        initial_capital=float(bt_cfg.get("initial_capital", 100.0)),
        commission_pct=float(bt_cfg.get("commission", 0.06)),
        slippage_pct=float(bt_cfg.get("slippage", 0.03)),
        order_size_pct=float(bt_cfg.get("order_size", 75.0)),
        use_multi_tp=True,
        use_breakeven=True,
        timeframe_minutes=5,
        leverage=int(cfg.get("live", {}).get("leverage", 5)),
        on_reverse="close",
    )
    # обогащаем trades_log signal-метаданными по entry_bar
    trades = []
    for t in metrics.trades_log:
        meta = sig_by_bar.get(int(t["entry_bar"]), {})
        row = dict(t)
        row.update(meta)
        trades.append(row)

    m = {
        "total_trades": metrics.total_trades,
        "winning_trades": metrics.winning_trades,
        "losing_trades": metrics.losing_trades,
        "win_rate": metrics.win_rate,
        "profit_factor": metrics.profit_factor,
        "total_pnl_pct": metrics.total_pnl_pct,
        "max_drawdown": metrics.max_drawdown,
        "sharpe_ratio": metrics.sharpe_ratio,
    }
    return m, trades


def agg_by(trades: list[dict], key: str) -> pd.DataFrame:
    if not trades:
        return pd.DataFrame()
    df = pd.DataFrame(trades)
    if key not in df.columns:
        return pd.DataFrame()
    grp = df.groupby(key)
    out = pd.DataFrame(
        {
            "n": grp.size(),
            "wr": grp.apply(lambda g: (g["pnl"] > 0).mean()),
            "sum_pnl": grp["pnl"].sum(),
            "avg_pnl": grp["pnl"].mean(),
            "avg_pnl_pct": grp["pnl_pct"].mean(),
        }
    )
    out["share_total"] = out["sum_pnl"] / df["pnl"].sum() if df["pnl"].sum() != 0 else 0.0
    return out.sort_values("sum_pnl", ascending=False)


def session_of(ms: int) -> str:
    if not ms:
        return "?"
    h = datetime.fromtimestamp(ms / 1000, tz=timezone.utc).hour
    if 0 <= h < 7:
        return "asia"
    if 7 <= h < 13:
        return "london"
    if 13 <= h < 21:
        return "ny"
    return "late"


def atr_pct(ohlcv: OHLCV, period: int = 14) -> float:
    """Средний ATR% за весь период (инстинкт волатильности)."""
    h, l, c = ohlcv.high, ohlcv.low, ohlcv.close
    tr = np.maximum(h[1:] - l[1:], np.maximum(np.abs(h[1:] - c[:-1]), np.abs(l[1:] - c[:-1])))
    if len(tr) < period:
        return 0.0
    atr = pd.Series(tr).rolling(period).mean().to_numpy()
    pct = atr / c[1:] * 100
    return float(np.nanmean(pct))


def fmt(x, d=2):
    if x is None:
        return "n/a"
    if isinstance(x, float):
        return f"{x:.{d}f}"
    return str(x)


def print_header(title: str):
    print(f"\n{'='*72}\n{title}\n{'='*72}")


def main() -> None:
    print_header("SMC SWEEP SCALPER v1 — ДИАГНОСТИКА")
    print(f"Дата запуска: {datetime.now(timezone.utc).isoformat()}")

    # === 1. NEAR BEST CONFIG: полный разбор ===
    near_cfg = load_best_config("NEARUSDT")
    assert near_cfg, "NEAR best config не найден"
    print_header("1. NEAR BEST CONFIG — метрики и trades_log")
    near_m, near_trades = run_bt("NEARUSDT", near_cfg)
    for k, v in near_m.items():
        print(f"  {k:20s} = {fmt(v, 4)}")
    print(f"  trades_with_meta     = {len(near_trades)}")

    # === 2. Exit reason breakdown ===
    print_header("2. Exit reason — NEAR")
    exits_df = agg_by(near_trades, "exit_reason")
    print(exits_df.to_string(float_format=lambda x: f"{x:.4f}"))

    # Net-of-fees проверка — на всём trades_log бэктест-движок уже учитывает commission+slippage в pnl
    total_pnl = sum(t["pnl"] for t in near_trades)
    avg_trade_pnl = total_pnl / max(len(near_trades), 1)
    print(f"\n  total_pnl (cash, after fees) = {fmt(total_pnl, 2)} USDT")
    print(f"  avg trade pnl               = {fmt(avg_trade_pnl, 4)} USDT")
    print(f"  avg trade pnl_pct           = {fmt(np.mean([t['pnl_pct'] for t in near_trades]), 4)}%")

    # Разбор "breakeven as loss" — BE exits после частичного TP1
    be_trades = [t for t in near_trades if t["exit_reason"] == "breakeven"]
    print(f"\n  breakeven exits count = {len(be_trades)}  "
          f"(avg pnl={fmt(np.mean([t['pnl'] for t in be_trades]) if be_trades else 0, 4)})")

    # === 3. Direction bias ===
    print_header("3. Direction bias — NEAR")
    dir_df = agg_by(near_trades, "direction")
    print(dir_df.to_string(float_format=lambda x: f"{x:.4f}"))

    # === 4. Confirmation type ===
    print_header("4. Confirmation type — NEAR")
    conf_df = agg_by(near_trades, "confirmation_type")
    print(conf_df.to_string(float_format=lambda x: f"{x:.4f}"))

    # === 5. Session / time-of-day ===
    print_header("5. Session (UTC) — NEAR")
    for t in near_trades:
        t["session"] = session_of(t.get("entry_time", 0))
    sess_df = agg_by(near_trades, "session")
    print(sess_df.to_string(float_format=lambda x: f"{x:.4f}"))

    # === 6. Час часовая гистограмма (UTC) ===
    print_header("6. Hour-of-day PnL sum — NEAR")
    hours = defaultdict(lambda: {"n": 0, "sum_pnl": 0.0, "wins": 0})
    for t in near_trades:
        h = datetime.fromtimestamp(t["entry_time"] / 1000, tz=timezone.utc).hour if t.get("entry_time") else -1
        hours[h]["n"] += 1
        hours[h]["sum_pnl"] += t["pnl"]
        if t["pnl"] > 0:
            hours[h]["wins"] += 1
    for h in sorted(hours):
        row = hours[h]
        wr = row["wins"] / row["n"] if row["n"] else 0
        print(f"  h={h:02d}  n={row['n']:3d}  wr={wr:.2f}  sum_pnl={row['sum_pnl']:+.2f}")

    # === 7. Frequency vs PnL (NEAR phase2 top) ===
    print_header("7. NEAR: Частота vs PnL (phase2 fine)")
    near_res = json.loads(
        (RESULTS_DIR / "smc_scalper_NEARUSDT_5_import_ready.json").read_text(encoding="utf-8")
    )
    fine_top = near_res["phases"].get("fine", {}).get("top_10", []) or []
    coarse_top = near_res["phases"].get("coarse", {}).get("top_10", []) or []
    tuning_top = near_res["phases"].get("tuning", {}).get("top_10", []) or []
    all_top = fine_top + coarse_top + tuning_top
    print(f"  {'trades':>8s} {'pnl_pct':>10s} {'wr':>6s} {'pf':>6s} {'dd':>6s}")
    rows = []
    for r in all_top:
        m = r.get("metrics", {})
        rows.append((m.get("total_trades", 0), m.get("total_pnl_pct", 0.0),
                     m.get("win_rate", 0.0), m.get("profit_factor", 0.0),
                     m.get("max_drawdown", 0.0)))
    rows.sort(key=lambda r: r[0])
    for r in rows:
        print(f"  {r[0]:8d} {r[1]:10.2f} {r[2]:6.3f} {r[3]:6.2f} {r[4]:6.2f}")
    if rows:
        arr = np.array(rows)
        if len(arr) > 1:
            corr = np.corrcoef(arr[:, 0], arr[:, 1])[0, 1]
            print(f"\n  pearson corr(trades, pnl_pct) = {corr:+.3f}")

    # === 8. Cross-token: NEAR config → BTC/ETH/SOL ===
    print_header("8. Cross-token — ЗАПУСК NEAR-best config на всех 7 токенах")
    xrows = []
    for sym in TOKENS:
        try:
            m, _ = run_bt(sym, near_cfg)
            xrows.append((sym, m))
        except FileNotFoundError:
            print(f"  {sym}: нет parquet")
            continue
    print(f"  {'sym':<10s} {'trades':>7s} {'pnl%':>7s} {'wr':>6s} {'pf':>6s} {'dd':>6s}")
    for sym, m in xrows:
        print(f"  {sym:<10s} {m['total_trades']:>7d} {m['total_pnl_pct']:>7.2f} "
              f"{m['win_rate']:>6.3f} {m['profit_factor']:>6.2f} {m['max_drawdown']:>6.2f}")

    # === 9. Each token: own best config + volatility profile ===
    print_header("9. Per-token: own-best config + ATR% baseline")
    print(f"  {'sym':<10s} {'own_pnl%':>9s} {'own_wr':>7s} {'own_tr':>7s} {'atr%':>7s}")
    token_reports = {}
    for sym in TOKENS:
        try:
            ohlcv, _ = load_candles(sym)
        except FileNotFoundError:
            continue
        ap = atr_pct(ohlcv, 14)
        own_cfg = load_best_config(sym)
        if own_cfg is None:
            print(f"  {sym:<10s} no-config atr%={ap:.3f}")
            continue
        own_m, own_trades = run_bt(sym, own_cfg)
        token_reports[sym] = (own_m, own_trades, ap)
        print(f"  {sym:<10s} {own_m['total_pnl_pct']:>9.2f} {own_m['win_rate']:>7.3f} "
              f"{own_m['total_trades']:>7d} {ap:>7.3f}")

    # === 10. Direction bias per losing token ===
    print_header("10. Направленный bias — losing токены (own-best config)")
    for sym in ["BTCUSDT", "ETHUSDT", "SOLUSDT", "LDOUSDT", "WLDUSDT", "INJUSDT"]:
        if sym not in token_reports:
            continue
        _, trades, _ = token_reports[sym]
        if not trades:
            print(f"  {sym}: нет сделок")
            continue
        d = agg_by(trades, "direction")
        print(f"\n  {sym}")
        print(d.to_string(float_format=lambda x: f"{x:.4f}"))

    # === 11. Confirmation type x losing tokens ===
    print_header("11. Confirmation type — losing токены")
    for sym in ["BTCUSDT", "ETHUSDT", "SOLUSDT"]:
        if sym not in token_reports:
            continue
        _, trades, _ = token_reports[sym]
        c = agg_by(trades, "confirmation_type")
        print(f"\n  {sym}")
        print(c.to_string(float_format=lambda x: f"{x:.4f}"))

    # === 12. Sample worst losing trades на NEAR ===
    print_header("12. NEAR — ТОП-5 убыточных сделок (примеры)")
    losers = sorted(near_trades, key=lambda t: t["pnl"])[:5]
    for t in losers:
        et = datetime.fromtimestamp(t["entry_time"] / 1000, tz=timezone.utc) if t.get("entry_time") else None
        print(f"  bar={t['entry_bar']:>6}  dir={t['direction']:5s}  "
              f"conf={t.get('confirmation_type','?'):4s}  score={t.get('confluence_score',0):.2f}  "
              f"reason={t['exit_reason']:14s}  pnl={t['pnl']:+.2f}  "
              f"pnl%={t['pnl_pct']:+.2f}  time={et}")

    print_header("ГОТОВО")


if __name__ == "__main__":
    main()
