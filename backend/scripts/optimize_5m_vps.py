#!/usr/bin/env python3
"""
Optimizer for SuperTrend Squeeze on 5m - runs DIRECTLY on VPS.
Uses urllib (no dependencies needed).

Usage on VPS: python3 /tmp/optimize_5m_vps.py
"""

import itertools
import json
import random
import sys
import time
import urllib.request
import urllib.error
from dataclasses import dataclass
import functools

# Unbuffered
print = functools.partial(print, flush=True)

# --- CONFIG ---
TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNDFjMjc5My05NGEyLTQ0NzctYTRlNy02YWExN2E1NWEyMGYiLCJleHAiOjE3NzU5MDE5NzEsInR5cGUiOiJhY2Nlc3MifQ.Yh3Pivng6fALYPWftPh9PrctL3H2B3vkYbC_2a-buu0"
STRATEGY_ID = "a3a59dd1-ca06-42fb-a036-a3d37c2864b1"
API_BASE = "http://localhost:8100/api"
SYMBOL = "BTCUSDT"
TIMEFRAME = "5"
START_DATE = "2025-11-10"
END_DATE = "2026-04-10"
INITIAL_CAPITAL = 100
MIN_TRADES = 20
PHASE1_SAMPLES = 100
PHASE2_CAP = 50

PARAM_GRID = {
    "trailing_atr_mult": [8, 12, 16, 20],
    "tp_atr_mult": [15, 20, 30, 40],
    "stop_atr_mult": [2.0, 3.0, 4.0, 5.0],
    "cooldown_bars": [20, 40, 60],
    "rsi_long_max": [50, 60, 70],
    "rsi_short_min": [30, 40, 50],
    "st3_mult": [3.0, 4.0, 5.0],
    "adx_threshold": [15, 20, 25],
}


@dataclass
class Result:
    name: str
    params: dict
    pnl_pct: float = 0.0
    max_dd: float = 0.0
    sharpe: float = 0.0
    win_rate: float = 0.0
    pf: float = 0.0
    trades: int = 0
    score: float = 0.0
    config_id: str = ""
    run_id: str = ""
    status: str = ""


def api(method, endpoint, data=None):
    url = f"{API_BASE}{endpoint}"
    headers = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  API {e.code}: {body[:200]}")
        return {}
    except Exception as e:
        print(f"  API error: {e}")
        return {}


def build_config(p):
    return {
        "supertrend": {"st1_period": 10, "st1_mult": 1.0, "st2_period": 11, "st2_mult": 3.0,
                       "st3_period": 10, "st3_mult": p["st3_mult"], "min_agree": 2},
        "squeeze": {"use": True, "bb_period": 20, "bb_mult": 2.0, "kc_period": 20,
                    "kc_mult": 1.5, "mom_period": 20},
        "trend_filter": {"use_adx": True, "adx_period": 14, "ema_period": 200,
                         "adx_threshold": p["adx_threshold"]},
        "entry": {"rsi_period": 14, "rsi_long_max": p["rsi_long_max"],
                  "rsi_short_min": p["rsi_short_min"], "use_volume": True, "volume_mult": 1.0},
        "risk": {"atr_period": 14, "stop_atr_mult": p["stop_atr_mult"],
                 "tp_atr_mult": p["tp_atr_mult"], "use_trailing": True,
                 "trailing_atr_mult": p["trailing_atr_mult"], "cooldown_bars": p["cooldown_bars"]},
        "backtest": {"commission": 0.05, "order_size": 100, "initial_capital": INITIAL_CAPITAL},
    }


def run_backtest(name, params, symbol=SYMBOL):
    r = Result(name=name, params=params.copy())
    config = build_config(params)

    # Create config
    resp = api("POST", "/strategies/configs", {
        "strategy_id": STRATEGY_ID, "name": name, "symbol": symbol,
        "timeframe": TIMEFRAME, "config": config
    })
    if "id" not in resp:
        r.status = "config_fail"
        return r
    r.config_id = resp["id"]

    # Start backtest
    resp = api("POST", "/backtest/runs", {
        "strategy_config_id": r.config_id, "symbol": symbol, "timeframe": TIMEFRAME,
        "start_date": START_DATE, "end_date": END_DATE, "initial_capital": INITIAL_CAPITAL
    })
    if "id" not in resp:
        r.status = "start_fail"
        return r
    r.run_id = resp["id"]

    # Poll (max 5 min)
    for _ in range(60):
        time.sleep(5)
        resp = api("GET", f"/backtest/runs/{r.run_id}")
        if not resp:
            continue
        st = resp.get("status", "")
        if st == "completed":
            # Get result
            res = api("GET", f"/backtest/runs/{r.run_id}/result")
            if res:
                def f(v):
                    try: return float(v)
                    except: return 0.0
                r.pnl_pct = f(res.get("total_pnl_pct"))
                r.max_dd = f(res.get("max_drawdown"))
                r.sharpe = f(res.get("sharpe_ratio"))
                r.win_rate = f(res.get("win_rate")) * 100
                r.pf = f(res.get("profit_factor"))
                r.trades = int(f(res.get("total_trades")))
                r.status = "completed"
                r.score = calc_score(r)
            else:
                r.status = "no_result"
            return r
        elif st == "failed":
            r.status = "failed"
            return r

    r.status = "timeout"
    return r


def calc_score(r):
    pnl_norm = min(max(r.pnl_pct / 200.0, 0), 1)
    dd_norm = min(abs(r.max_dd) / 50.0, 1)
    sh_norm = min(max(r.sharpe / 3.0, 0), 1)
    wr_norm = min(max(r.win_rate / 100.0, 0), 1)
    pf_norm = min(max(r.pf / 3.0, 0), 1)
    return 0.35 * pnl_norm + 0.25 * (1 - dd_norm) + 0.20 * sh_norm + 0.10 * wr_norm + 0.10 * pf_norm


def print_top(results, n=10):
    valid = [r for r in results if r.status == "completed" and r.trades >= MIN_TRADES]
    valid.sort(key=lambda x: x.score, reverse=True)
    print(f"\n{'='*130}")
    print(f"TOP-{min(n, len(valid))} (min {MIN_TRADES} trades)")
    print(f"{'#':>3} {'Name':>18} {'Score':>6} {'PnL%':>8} {'DD%':>7} {'Sharpe':>7} {'WR%':>6} {'PF':>6} {'Tr':>5} | {'trail':>5} {'tp':>4} {'sl':>4} {'cd':>3} {'rsiL':>5} {'st3':>4} {'adx':>4}")
    print(f"{'-'*130}")
    for i, r in enumerate(valid[:n]):
        p = r.params
        print(f"{i+1:>3} {r.name:>18} {r.score:>6.3f} {r.pnl_pct:>8.1f} {r.max_dd:>7.1f} {r.sharpe:>7.2f} {r.win_rate:>6.1f} {r.pf:>6.2f} {r.trades:>5} | {p['trailing_atr_mult']:>5.0f} {p['tp_atr_mult']:>4.0f} {p['stop_atr_mult']:>4.1f} {p['cooldown_bars']:>3} {p['rsi_long_max']:>5.0f} {p['st3_mult']:>4.1f} {p['adx_threshold']:>4.0f}")
    print(f"{'='*130}")
    bad = len([r for r in results if r.status != "completed"])
    few = len([r for r in results if r.status == "completed" and r.trades < MIN_TRADES])
    if bad or few:
        print(f"  (filtered: {few} <{MIN_TRADES} trades, {bad} failed)")


def save(results, fn="optimization_results_5m.json"):
    data = [{"name": r.name, "params": r.params, "pnl_pct": r.pnl_pct, "max_dd": r.max_dd,
             "sharpe": r.sharpe, "win_rate": r.win_rate, "pf": r.pf, "trades": r.trades,
             "score": r.score, "status": r.status, "config_id": r.config_id, "run_id": r.run_id}
            for r in results]
    with open(f"/tmp/{fn}", "w") as f:
        json.dump(data, f, indent=2)
    print(f"Saved to /tmp/{fn}")


def gen_random(n):
    keys = list(PARAM_GRID.keys())
    vals = [PARAM_GRID[k] for k in keys]
    total = 1
    for v in vals: total *= len(v)
    if n >= total:
        return [dict(zip(keys, c)) for c in itertools.product(*vals)]
    combos = set()
    while len(combos) < n:
        combos.add(tuple(random.choice(v) for v in vals))
    return [dict(zip(keys, c)) for c in combos]


def gen_fine(best, all_seen):
    fine = []
    keys = list(PARAM_GRID.keys())
    ranges = []
    for k in keys:
        vals = PARAM_GRID[k]
        bv = best[k]
        if bv in vals:
            idx = vals.index(bv)
            neighbors = sorted(set(vals[max(0,idx-1):idx+2]))
        else:
            neighbors = [bv]
        ranges.append(neighbors)
    for combo in itertools.product(*ranges):
        d = dict(zip(keys, combo))
        key = tuple(sorted(d.items()))
        if key not in all_seen:
            fine.append(d)
            all_seen.add(key)
    return fine


def load_previous(fn="optimization_results_5m.json"):
    """Load previous results from JSON if exists."""
    import os
    path = f"/tmp/{fn}"
    if os.path.exists(path):
        with open(path) as f:
            data = json.load(f)
        results = []
        for d in data:
            r = Result(name=d["name"], params=d["params"])
            r.pnl_pct = d.get("pnl_pct", 0)
            r.max_dd = d.get("max_dd", 0)
            r.sharpe = d.get("sharpe", 0)
            r.win_rate = d.get("win_rate", 0)
            r.pf = d.get("pf", 0)
            r.trades = d.get("trades", 0)
            r.score = d.get("score", 0)
            r.status = d.get("status", "")
            r.config_id = d.get("config_id", "")
            r.run_id = d.get("run_id", "")
            results.append(r)
        print(f"Loaded {len(results)} previous results")
        return results
    return []


def main():
    # Try to resume
    all_results = load_previous()
    all_seen = set()
    for r in all_results:
        all_seen.add(tuple(sorted(r.params.items())))

    # PHASE 1
    print("=" * 60)
    print(f"PHASE 1: Coarse Grid on {SYMBOL} ({PHASE1_SAMPLES} combos)")
    print("=" * 60)

    random.seed(42)  # reproducible
    combos = gen_random(PHASE1_SAMPLES)
    # Filter already done
    combos = [c for c in combos if tuple(sorted(c.items())) not in all_seen]
    for c in combos:
        all_seen.add(tuple(sorted(c.items())))
    print(f"  {len(combos)} new combos to test (skipping {PHASE1_SAMPLES - len(combos)} already done)")

    start_idx = len(all_results)
    for i, p in enumerate(combos):
        idx = start_idx + i + 1
        name = f"O5m_P1_{idx:03d}"
        print(f"\n[{i+1}/{len(combos)}] {name}: tr={p['trailing_atr_mult']:.0f} tp={p['tp_atr_mult']:.0f} sl={p['stop_atr_mult']:.1f} cd={p['cooldown_bars']} rsiL={p['rsi_long_max']:.0f} st3={p['st3_mult']:.1f} adx={p['adx_threshold']:.0f}")
        r = run_backtest(name, p)
        all_results.append(r)
        if r.status == "completed":
            print(f"  -> PnL={r.pnl_pct:.1f}% DD={r.max_dd:.1f}% Sharpe={r.sharpe:.2f} WR={r.win_rate:.1f}% Tr={r.trades} Score={r.score:.3f}")
        else:
            print(f"  -> {r.status}")
        if (i + 1) % 10 == 0:
            print_top(all_results, 3)
            save(all_results)

    print_top(all_results, 10)
    save(all_results)

    # PHASE 2
    print("\n" + "=" * 60)
    print("PHASE 2: Fine Grid around TOP-5")
    print("=" * 60)

    valid = sorted([r for r in all_results if r.status == "completed" and r.trades >= MIN_TRADES],
                   key=lambda x: x.score, reverse=True)
    fine_combos = []
    for top in valid[:5]:
        fine_combos.extend(gen_fine(top.params, all_seen))

    print(f"  {len(fine_combos)} new combinations")
    for i, p in enumerate(fine_combos[:PHASE2_CAP]):
        name = f"O5m_P2_{i+1:03d}"
        print(f"\n[{i+1}/{min(len(fine_combos), PHASE2_CAP)}] {name}: tr={p['trailing_atr_mult']:.0f} tp={p['tp_atr_mult']:.0f} sl={p['stop_atr_mult']:.1f} cd={p['cooldown_bars']} rsiL={p['rsi_long_max']:.0f} st3={p['st3_mult']:.1f} adx={p['adx_threshold']:.0f}")
        r = run_backtest(name, p)
        all_results.append(r)
        if r.status == "completed":
            print(f"  -> PnL={r.pnl_pct:.1f}% DD={r.max_dd:.1f}% Sharpe={r.sharpe:.2f} WR={r.win_rate:.1f}% Tr={r.trades} Score={r.score:.3f}")
        if (i + 1) % 10 == 0:
            print_top(all_results, 5)
            save(all_results)

    print_top(all_results, 10)
    save(all_results)

    # PHASE 3: Validate on SOL
    print("\n" + "=" * 60)
    print("PHASE 3: Validate TOP-3 on SOLUSDT")
    print("=" * 60)

    valid = sorted([r for r in all_results if r.status == "completed" and r.trades >= MIN_TRADES],
                   key=lambda x: x.score, reverse=True)
    sol_results = []
    for i, top in enumerate(valid[:3]):
        name = f"O5m_SOL_{i+1}"
        print(f"\n[{i+1}/3] Validating: {top.name} params on SOLUSDT")
        r = run_backtest(name, top.params, symbol="SOLUSDT")
        sol_results.append(r)
        if r.status == "completed":
            print(f"  -> SOL: PnL={r.pnl_pct:.1f}% DD={r.max_dd:.1f}% Sharpe={r.sharpe:.2f} Tr={r.trades}")

    # FINAL
    print("\n" + "=" * 60)
    print("FINAL RESULTS")
    print("=" * 60)
    print_top(all_results, 10)
    print("\nSOL Validation:")
    for i, (btc, sol) in enumerate(zip(valid[:3], sol_results)):
        print(f"  #{i+1}: BTC PnL={btc.pnl_pct:.1f}% / SOL PnL={sol.pnl_pct:.1f}%")

    if valid:
        best = valid[0]
        print(f"\nBEST: {best.name} Score={best.score:.3f} PnL={best.pnl_pct:.1f}% DD={best.max_dd:.1f}%")
        print(f"Config:\n{json.dumps(build_config(best.params), indent=2)}")

    save(all_results)


if __name__ == "__main__":
    main()
