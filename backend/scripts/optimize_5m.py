#!/usr/bin/env python3
"""
Optimizer for SuperTrend Squeeze Momentum strategy on 5-minute timeframe.
Runs grid search via API backtests.

Usage (from local machine):
    python backend/scripts/optimize_5m.py

Or via SSH directly on VPS:
    python3 /path/to/optimize_5m.py
"""

import itertools
import json
import random
import subprocess
import sys
import time
from dataclasses import dataclass, field

# --- CONFIG ---
TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNDFjMjc5My05NGEyLTQ0NzctYTRlNy02YWExN2E1NWEyMGYiLCJleHAiOjE3NzU4MTUzODgsInR5cGUiOiJhY2Nlc3MifQ.S29A8c0RiYdjKkYi-tTQGu_mS-D-g3jCfgS3sT-5RDQ"
STRATEGY_ID = "a3a59dd1-ca06-42fb-a036-a3d37c2864b1"
API_BASE = "http://localhost:8100/api"
SYMBOL = "BTCUSDT"
TIMEFRAME = "5"
START_DATE = "2025-11-10"
END_DATE = "2026-04-10"
INITIAL_CAPITAL = 100
MIN_TRADES = 20

# --- PARAMETER SPACE ---
# Default values from engine for reference:
# trailing_atr_mult=6, tp_atr_mult=10, stop_atr_mult=3, cooldown_bars=10
# rsi_long_max=40, rsi_short_min=60, st3_mult=7, adx_threshold=25

PARAM_GRID = {
    "trailing_atr_mult": [8, 12, 16, 20],
    "tp_atr_mult": [15, 20, 30, 40],
    "stop_atr_mult": [2.0, 3.0, 4.0, 5.0],
    "cooldown_bars": [20, 40, 60],
    "rsi_long_max": [50, 60, 70],
    "rsi_short_min": [30, 40, 50],  # mirror of rsi_long_max
    "st3_mult": [3.0, 4.0, 5.0],
    "adx_threshold": [15, 20, 25],
}


@dataclass
class BacktestResult:
    """Result of a single backtest run."""
    config_name: str
    params: dict
    pnl_pct: float = 0.0
    max_drawdown: float = 0.0
    sharpe: float = 0.0
    win_rate: float = 0.0
    profit_factor: float = 0.0
    total_trades: int = 0
    score: float = 0.0
    config_id: str = ""
    run_id: str = ""
    status: str = ""


def ssh_curl(method: str, endpoint: str, data: dict | None = None) -> dict:
    """Execute curl via SSH to VPS."""
    url = f"{API_BASE}{endpoint}"
    cmd = ["ssh", "jeremy-vps"]

    if method == "GET":
        curl_cmd = f"curl -s '{url}' -H 'Authorization: Bearer {TOKEN}'"
    elif method == "POST":
        json_str = json.dumps(data).replace("'", "'\\''")
        curl_cmd = f"curl -s -X POST '{url}' -H 'Authorization: Bearer {TOKEN}' -H 'Content-Type: application/json' -d '{json_str}'"
    elif method == "DELETE":
        curl_cmd = f"curl -s -X DELETE '{url}' -H 'Authorization: Bearer {TOKEN}'"
    else:
        raise ValueError(f"Unknown method: {method}")

    cmd.append(curl_cmd)

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            print(f"  SSH error: {result.stderr[:200]}")
            return {}
        if not result.stdout.strip():
            return {}
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        print(f"  JSON decode error: {result.stdout[:200]}")
        return {}
    except subprocess.TimeoutExpired:
        print("  SSH timeout")
        return {}


def build_config(params: dict) -> dict:
    """Build full strategy config from optimization params."""
    return {
        "supertrend": {
            "st1_period": 10,
            "st1_mult": 1.0,
            "st2_period": 11,
            "st2_mult": 3.0,
            "st3_period": 10,
            "st3_mult": params["st3_mult"],
            "min_agree": 2,
        },
        "squeeze": {
            "use": True,
            "bb_period": 20,
            "bb_mult": 2.0,
            "kc_period": 20,
            "kc_mult": 1.5,
            "mom_period": 20,
        },
        "trend_filter": {
            "use_adx": True,
            "adx_period": 14,
            "ema_period": 200,
            "adx_threshold": params["adx_threshold"],
        },
        "entry": {
            "rsi_period": 14,
            "rsi_long_max": params["rsi_long_max"],
            "rsi_short_min": params["rsi_short_min"],
            "use_volume": True,
            "volume_mult": 1.0,
        },
        "risk": {
            "atr_period": 14,
            "stop_atr_mult": params["stop_atr_mult"],
            "tp_atr_mult": params["tp_atr_mult"],
            "use_trailing": True,
            "trailing_atr_mult": params["trailing_atr_mult"],
            "cooldown_bars": params["cooldown_bars"],
        },
        "backtest": {
            "commission": 0.05,
            "order_size": 100,
            "initial_capital": INITIAL_CAPITAL,
        },
    }


def create_config(name: str, config: dict, symbol: str = SYMBOL) -> str | None:
    """Create strategy config, return config_id."""
    data = {
        "strategy_id": STRATEGY_ID,
        "name": name,
        "symbol": symbol,
        "timeframe": TIMEFRAME,
        "config": config,
    }
    resp = ssh_curl("POST", "/strategies/configs", data)
    if "id" in resp:
        return resp["id"]
    print(f"  Failed to create config: {resp}")
    return None


def start_backtest(config_id: str, symbol: str = SYMBOL) -> str | None:
    """Start backtest run, return run_id."""
    data = {
        "strategy_config_id": config_id,
        "symbol": symbol,
        "timeframe": TIMEFRAME,
        "start_date": START_DATE,
        "end_date": END_DATE,
        "initial_capital": INITIAL_CAPITAL,
    }
    resp = ssh_curl("POST", "/backtest/runs", data)
    if "id" in resp:
        return resp["id"]
    print(f"  Failed to start backtest: {resp}")
    return None


def poll_backtest(run_id: str, max_wait: int = 300) -> dict:
    """Poll backtest until done. Returns result dict with metrics."""
    start = time.time()
    while time.time() - start < max_wait:
        resp = ssh_curl("GET", f"/backtest/runs/{run_id}")
        if not resp:
            time.sleep(5)
            continue
        status = resp.get("status", "")
        if status == "completed":
            # Fetch actual result with metrics
            result = ssh_curl("GET", f"/backtest/runs/{run_id}/result")
            if result:
                result["status"] = "completed"
                return result
            return {"status": "completed"}
        elif status == "failed":
            print(f"  Backtest FAILED: {resp.get('error_message', 'unknown')}")
            return {"status": "failed"}
        time.sleep(5)
    print(f"  Backtest timeout after {max_wait}s")
    return {"status": "timeout"}


def extract_metrics(result: dict) -> dict:
    """Extract metrics from backtest result.

    Result structure from /backtest/runs/{id}/result:
    {total_trades, winning_trades, losing_trades, win_rate, profit_factor,
     total_pnl, total_pnl_pct, max_drawdown, sharpe_ratio, ...}
    """
    def _f(val, default=0.0):
        try:
            return float(val)
        except (TypeError, ValueError):
            return default

    return {
        "pnl_pct": _f(result.get("total_pnl_pct")),
        "max_drawdown": _f(result.get("max_drawdown")),
        "sharpe": _f(result.get("sharpe_ratio")),
        "win_rate": _f(result.get("win_rate")) * 100,  # API returns 0-1, we want %
        "profit_factor": _f(result.get("profit_factor")),
        "total_trades": int(_f(result.get("total_trades"), 0)),
    }


def calc_score(m: dict) -> float:
    """Calculate composite score. Higher is better."""
    pnl = m["pnl_pct"]
    dd = abs(m["max_drawdown"])
    sharpe = m["sharpe"]
    wr = m["win_rate"]
    pf = m["profit_factor"]

    # Normalize (rough ranges for crypto 5m)
    pnl_norm = min(max(pnl / 200.0, 0), 1)  # 200% = 1.0
    dd_norm = min(dd / 50.0, 1)  # 50% DD = worst
    sharpe_norm = min(max(sharpe / 3.0, 0), 1)  # 3.0 = excellent
    wr_norm = min(max(wr / 100.0, 0), 1)
    pf_norm = min(max(pf / 3.0, 0), 1)

    return 0.35 * pnl_norm + 0.25 * (1 - dd_norm) + 0.20 * sharpe_norm + 0.10 * wr_norm + 0.10 * pf_norm


def cleanup_config(config_id: str) -> None:
    """Delete config to avoid clutter."""
    ssh_curl("DELETE", f"/strategies/configs/{config_id}")


def run_single_backtest(name: str, params: dict, symbol: str = SYMBOL) -> BacktestResult:
    """Run a single backtest: create config -> start -> poll -> extract."""
    result = BacktestResult(config_name=name, params=params.copy())
    config = build_config(params)

    # 1. Create config
    config_id = create_config(name, config, symbol)
    if not config_id:
        result.status = "config_failed"
        return result
    result.config_id = config_id

    # 2. Start backtest
    run_id = start_backtest(config_id, symbol)
    if not run_id:
        cleanup_config(config_id)
        result.status = "start_failed"
        return result
    result.run_id = run_id

    # 3. Poll
    bt_result = poll_backtest(run_id)
    result.status = bt_result.get("status", "unknown")

    if result.status == "completed":
        metrics = extract_metrics(bt_result)
        result.pnl_pct = metrics["pnl_pct"]
        result.max_drawdown = metrics["max_drawdown"]
        result.sharpe = metrics["sharpe"]
        result.win_rate = metrics["win_rate"]
        result.profit_factor = metrics["profit_factor"]
        result.total_trades = metrics["total_trades"]
        result.score = calc_score(metrics)

    return result


def generate_random_combos(n: int = 100) -> list[dict]:
    """Generate n random parameter combinations from the grid."""
    keys = list(PARAM_GRID.keys())
    all_values = [PARAM_GRID[k] for k in keys]
    total = 1
    for v in all_values:
        total *= len(v)

    if n >= total:
        # Full grid
        combos = []
        for vals in itertools.product(*all_values):
            combos.append(dict(zip(keys, vals)))
        return combos

    # Random sample
    combos = set()
    while len(combos) < n:
        combo = tuple(random.choice(v) for v in all_values)
        combos.add(combo)

    return [dict(zip(keys, c)) for c in combos]


def generate_fine_grid(best_params: dict) -> list[dict]:
    """Generate fine grid around best params (+-1 step)."""
    fine_combos = []
    for key, values in PARAM_GRID.items():
        best_val = best_params[key]
        if best_val in values:
            idx = values.index(best_val)
            neighbors = set()
            for delta in [-1, 0, 1]:
                ni = max(0, min(len(values) - 1, idx + delta))
                neighbors.add(values[ni])
            fine_combos.append(list(neighbors))
        else:
            fine_combos.append([best_val])

    result = []
    keys = list(PARAM_GRID.keys())
    for vals in itertools.product(*fine_combos):
        combo = dict(zip(keys, vals))
        if combo != best_params:
            result.append(combo)

    return result


def print_top_n(results: list[BacktestResult], n: int = 10) -> None:
    """Print top N results table."""
    valid = [r for r in results if r.status == "completed" and r.total_trades >= MIN_TRADES]
    valid.sort(key=lambda x: x.score, reverse=True)

    print(f"\n{'='*120}")
    print(f"TOP-{n} Results (sorted by score, min {MIN_TRADES} trades)")
    print(f"{'='*120}")
    print(f"{'#':>3} {'Name':>20} {'Score':>6} {'PnL%':>8} {'DD%':>7} {'Sharpe':>7} {'WR%':>6} {'PF':>6} {'Trades':>7} {'Trail':>6} {'TP':>5} {'SL':>5} {'CD':>4} {'RSI_L':>6} {'ST3':>5} {'ADX':>5}")
    print(f"{'-'*120}")

    for i, r in enumerate(valid[:n]):
        p = r.params
        print(f"{i+1:>3} {r.config_name:>20} {r.score:>6.3f} {r.pnl_pct:>8.1f} {r.max_drawdown:>7.1f} {r.sharpe:>7.2f} {r.win_rate:>6.1f} {r.profit_factor:>6.2f} {r.total_trades:>7} {p['trailing_atr_mult']:>6.0f} {p['tp_atr_mult']:>5.0f} {p['stop_atr_mult']:>5.1f} {p['cooldown_bars']:>4} {p['rsi_long_max']:>6.0f} {p['st3_mult']:>5.1f} {p['adx_threshold']:>5.0f}")

    print(f"{'='*120}")
    filtered = len(results) - len(valid)
    if filtered > 0:
        print(f"  ({filtered} results filtered: {len([r for r in results if r.total_trades < MIN_TRADES and r.status == 'completed'])} too few trades, {len([r for r in results if r.status != 'completed'])} failed)")


def save_results(results: list[BacktestResult], filename: str = "optimization_results_5m.json") -> None:
    """Save all results to JSON."""
    data = []
    for r in results:
        data.append({
            "name": r.config_name,
            "params": r.params,
            "pnl_pct": r.pnl_pct,
            "max_drawdown": r.max_drawdown,
            "sharpe": r.sharpe,
            "win_rate": r.win_rate,
            "profit_factor": r.profit_factor,
            "total_trades": r.total_trades,
            "score": r.score,
            "status": r.status,
            "config_id": r.config_id,
            "run_id": r.run_id,
        })
    with open(filename, "w") as f:
        json.dump(data, f, indent=2)
    print(f"\nResults saved to {filename}")


def main():
    all_results: list[BacktestResult] = []

    # ============================================================
    # PHASE 1: Coarse grid on BTCUSDT - 100 random combos
    # ============================================================
    print("=" * 60)
    print("PHASE 1: Coarse Grid Search on BTCUSDT (100 combos)")
    print("=" * 60)

    combos = generate_random_combos(100)
    random.shuffle(combos)

    for i, params in enumerate(combos):
        name = f"Opt5m_P1_{i+1:03d}"
        print(f"\n[{i+1}/{len(combos)}] {name}: trail={params['trailing_atr_mult']}, tp={params['tp_atr_mult']}, sl={params['stop_atr_mult']}, cd={params['cooldown_bars']}, rsi_l={params['rsi_long_max']}, st3={params['st3_mult']}, adx={params['adx_threshold']}")

        result = run_single_backtest(name, params)
        all_results.append(result)

        if result.status == "completed":
            print(f"  -> PnL={result.pnl_pct:.1f}%, DD={result.max_drawdown:.1f}%, Sharpe={result.sharpe:.2f}, WR={result.win_rate:.1f}%, Trades={result.total_trades}, Score={result.score:.3f}")
        else:
            print(f"  -> Status: {result.status}")

        # Progress report every 10
        if (i + 1) % 10 == 0:
            print_top_n(all_results, 3)
            save_results(all_results)

    print_top_n(all_results, 10)
    save_results(all_results)

    # ============================================================
    # PHASE 2: Fine grid around TOP-5
    # ============================================================
    print("\n" + "=" * 60)
    print("PHASE 2: Fine Grid around TOP-5")
    print("=" * 60)

    valid = [r for r in all_results if r.status == "completed" and r.total_trades >= MIN_TRADES]
    valid.sort(key=lambda x: x.score, reverse=True)
    top5 = valid[:5]

    seen_combos = {tuple(sorted(r.params.items())) for r in all_results}
    fine_combos = []

    for top_result in top5:
        fine = generate_fine_grid(top_result.params)
        for combo in fine:
            key = tuple(sorted(combo.items()))
            if key not in seen_combos:
                seen_combos.add(key)
                fine_combos.append(combo)

    print(f"  {len(fine_combos)} new combinations to test")

    for i, params in enumerate(fine_combos[:50]):  # cap at 50
        name = f"Opt5m_P2_{i+1:03d}"
        print(f"\n[{i+1}/{min(len(fine_combos), 50)}] {name}: trail={params['trailing_atr_mult']}, tp={params['tp_atr_mult']}, sl={params['stop_atr_mult']}, cd={params['cooldown_bars']}, rsi_l={params['rsi_long_max']}, st3={params['st3_mult']}, adx={params['adx_threshold']}")

        result = run_single_backtest(name, params)
        all_results.append(result)

        if result.status == "completed":
            print(f"  -> PnL={result.pnl_pct:.1f}%, DD={result.max_drawdown:.1f}%, Sharpe={result.sharpe:.2f}, WR={result.win_rate:.1f}%, Trades={result.total_trades}, Score={result.score:.3f}")

        if (i + 1) % 10 == 0:
            print_top_n(all_results, 5)
            save_results(all_results)

    print_top_n(all_results, 10)
    save_results(all_results)

    # ============================================================
    # PHASE 3: Validate TOP-3 on SOLUSDT
    # ============================================================
    print("\n" + "=" * 60)
    print("PHASE 3: Validate TOP-3 on SOLUSDT")
    print("=" * 60)

    valid = [r for r in all_results if r.status == "completed" and r.total_trades >= MIN_TRADES]
    valid.sort(key=lambda x: x.score, reverse=True)
    top3 = valid[:3]

    sol_results = []
    for i, top in enumerate(top3):
        name = f"Opt5m_SOL_{i+1}"
        print(f"\n[{i+1}/3] Validating on SOLUSDT: {name}")
        result = run_single_backtest(name, top.params, symbol="SOLUSDT")
        sol_results.append(result)
        if result.status == "completed":
            print(f"  -> SOL PnL={result.pnl_pct:.1f}%, DD={result.max_drawdown:.1f}%, Sharpe={result.sharpe:.2f}, Trades={result.total_trades}")

    # Final report
    print("\n" + "=" * 60)
    print("FINAL RESULTS")
    print("=" * 60)
    print_top_n(all_results, 10)

    print("\nSOL Validation:")
    for i, (btc, sol) in enumerate(zip(top3, sol_results)):
        print(f"  Config #{i+1}: BTC PnL={btc.pnl_pct:.1f}% / SOL PnL={sol.pnl_pct:.1f}%")

    # Save best config
    best = valid[0] if valid else None
    if best:
        print(f"\nBEST CONFIG: {best.config_name}")
        print(f"  Score={best.score:.3f}, PnL={best.pnl_pct:.1f}%, DD={best.max_drawdown:.1f}%, Sharpe={best.sharpe:.2f}")
        print(f"  Params: {json.dumps(best.params, indent=2)}")
        print(f"  Full config: {json.dumps(build_config(best.params), indent=2)}")

    save_results(all_results, "optimization_results_5m.json")


if __name__ == "__main__":
    # Unbuffered output
    import functools
    print = functools.partial(print, flush=True)
    main()
