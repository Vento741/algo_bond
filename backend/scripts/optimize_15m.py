#!/usr/bin/env python3
"""
SuperTrend Squeeze Momentum - 15m Optimization Script.
Runs on VPS via: ssh jeremy-vps "cd /var/www/.../algo_trade && python backend/scripts/optimize_15m.py"
OR remotely via: ssh jeremy-vps "python3 -" < backend/scripts/optimize_15m.py
"""

import json
import random
import subprocess
import sys
import time
from itertools import product

TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNDFjMjc5My05NGEyLTQ0NzctYTRlNy02YWExN2E1NWEyMGYiLCJleHAiOjE3NzU4MTUzODgsInR5cGUiOiJhY2Nlc3MifQ.S29A8c0RiYdjKkYi-tTQGu_mS-D-g3jCfgS3sT-5RDQ"
STRATEGY_ID = "a3a59dd1-ca06-42fb-a036-a3d37c2864b1"
BASE = "http://localhost:8100/api"
SYMBOL = "BTCUSDT"
TIMEFRAME = "15"
START_DATE = "2025-11-10"
END_DATE = "2026-04-10"
INITIAL_CAPITAL = 100

# --- Optimization Space ---
PARAM_SPACE = {
    "risk.trailing_atr_mult": [6, 10, 15, 20, 25],
    "risk.tp_atr_mult": [10, 15, 20, 30, 50],
    "risk.stop_atr_mult": [2.0, 3.0, 4.0, 5.0],
    "risk.cooldown_bars": [5, 10, 20, 30],
    "entry.rsi_long_max": [45, 55, 65, 75],
    "entry.rsi_short_min": [25, 35, 45, 55],
    "supertrend.st2_mult": [2.0, 3.0, 4.0],
    "supertrend.st3_mult": [3.0, 5.0, 7.0],
    "trend_filter.adx_threshold": [15, 20, 25, 30],
    "squeeze.use": [True, False],
}


def curl(method, path, data=None):
    """Execute curl and return parsed JSON."""
    cmd = ["curl", "-s", "-X", method, f"{BASE}{path}",
           "-H", f"Authorization: Bearer {TOKEN}",
           "-H", "Content-Type: application/json"]
    if data:
        cmd.extend(["-d", json.dumps(data)])
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        print(f"  curl error: {result.stderr}", file=sys.stderr)
        return None
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        print(f"  JSON parse error: {result.stdout[:200]}", file=sys.stderr)
        return None


def flat_to_nested(flat_params):
    """Convert flat params like 'risk.stop_atr_mult' to nested config dict."""
    config = {}
    for key, val in flat_params.items():
        parts = key.split(".")
        d = config
        for p in parts[:-1]:
            d = d.setdefault(p, {})
        d[parts[-1]] = val
    return config


def run_single_backtest(config, name, symbol=SYMBOL):
    """Create config, run backtest, wait for result. Returns result dict or None."""
    # 1. Create config
    cfg_data = {
        "strategy_id": STRATEGY_ID,
        "name": name,
        "symbol": symbol,
        "timeframe": TIMEFRAME,
        "config": config,
    }
    cfg_resp = curl("POST", "/strategies/configs", cfg_data)
    if not cfg_resp or "id" not in cfg_resp:
        print(f"  Failed to create config: {cfg_resp}")
        return None
    config_id = cfg_resp["id"]

    # 2. Start backtest
    bt_data = {
        "strategy_config_id": config_id,
        "symbol": symbol,
        "timeframe": TIMEFRAME,
        "start_date": START_DATE,
        "end_date": END_DATE,
        "initial_capital": INITIAL_CAPITAL,
    }
    bt_resp = curl("POST", "/backtest/runs", bt_data)
    if not bt_resp or "id" not in bt_resp:
        print(f"  Failed to start backtest: {bt_resp}")
        return None
    run_id = bt_resp["id"]

    # 3. Poll until done
    max_wait = 300  # 5 minutes max
    waited = 0
    while waited < max_wait:
        time.sleep(8)
        waited += 8
        status_resp = curl("GET", f"/backtest/runs/{run_id}")
        if not status_resp:
            continue
        status = status_resp.get("status", "")
        if status == "completed":
            break
        elif status == "failed":
            print(f"  Backtest FAILED: {status_resp.get('error', 'unknown')}")
            return None
        # still running...

    if waited >= max_wait:
        print(f"  Backtest TIMEOUT after {max_wait}s")
        return None

    # 4. Get result
    result = curl("GET", f"/backtest/runs/{run_id}/result")
    if not result:
        return None

    return {
        "config_id": config_id,
        "run_id": run_id,
        "config": config,
        "result": result,
    }


def extract_metrics(r):
    """Extract key metrics from backtest result."""
    if not r or not r.get("result"):
        return None
    res = r["result"]
    try:
        return {
            "pnl_pct": float(res.get("total_pnl_pct", 0)),
            "max_dd": float(res.get("max_drawdown", 0)),
            "sharpe": float(res.get("sharpe_ratio", 0)),
            "win_rate": float(res.get("win_rate", 0)) * 100,  # 0.21 -> 21%
            "profit_factor": float(res.get("profit_factor", 0)),
            "total_trades": int(res.get("total_trades", 0)),
        }
    except (TypeError, ValueError):
        return None


def generate_random_configs(n=100):
    """Generate n random parameter combinations."""
    keys = list(PARAM_SPACE.keys())
    all_combos = list(product(*[PARAM_SPACE[k] for k in keys]))
    random.seed(42)
    sampled = random.sample(all_combos, min(n, len(all_combos)))
    configs = []
    for combo in sampled:
        flat = dict(zip(keys, combo))
        configs.append(flat)
    return configs


def generate_fine_grid(top_configs, steps=1):
    """Generate fine grid around top configs (+-1 step on each param)."""
    fine = []
    for base_flat in top_configs:
        for param_key in PARAM_SPACE:
            values = PARAM_SPACE[param_key]
            current = base_flat[param_key]
            if current in values:
                idx = values.index(current)
                for offset in [-1, 1]:
                    new_idx = idx + offset
                    if 0 <= new_idx < len(values):
                        new_flat = dict(base_flat)
                        new_flat[param_key] = values[new_idx]
                        # Deduplicate
                        if new_flat not in fine:
                            fine.append(new_flat)
    return fine


def score_result(m, all_metrics):
    """Score a single result given all metrics for normalization."""
    if not m or m["total_trades"] < 15:
        return -999

    pnls = [x["pnl_pct"] for x in all_metrics if x and x["total_trades"] >= 15]
    dds = [abs(x["max_dd"]) for x in all_metrics if x and x["total_trades"] >= 15]
    sharpes = [x["sharpe"] for x in all_metrics if x and x["total_trades"] >= 15]
    wrs = [x["win_rate"] for x in all_metrics if x and x["total_trades"] >= 15]
    pfs = [x["profit_factor"] for x in all_metrics if x and x["total_trades"] >= 15]

    def norm(val, vals):
        mn, mx = min(vals), max(vals)
        if mx == mn:
            return 0.5
        return (val - mn) / (mx - mn)

    return (
        0.35 * norm(m["pnl_pct"], pnls)
        + 0.25 * (1 - norm(abs(m["max_dd"]), dds))
        + 0.20 * norm(m["sharpe"], sharpes)
        + 0.10 * norm(m["win_rate"], wrs)
        + 0.10 * norm(m["profit_factor"], pfs)
    )


def main():
    all_results = []
    all_metrics = []

    # === PHASE 1: Coarse Grid (100 random combos on BTCUSDT) ===
    print("=" * 60)
    print("PHASE 1: Coarse Grid Search (100 combos, BTCUSDT 15m)")
    print("=" * 60)

    configs = generate_random_configs(100)
    print(f"Generated {len(configs)} random configs")

    for i, flat_params in enumerate(configs):
        name = f"Opt15m_P1_{i+1:03d}"
        nested = flat_to_nested(flat_params)
        print(f"\n[{i+1}/{len(configs)}] {name}")
        print(f"  Params: trail={flat_params['risk.trailing_atr_mult']}, "
              f"tp={flat_params['risk.tp_atr_mult']}, "
              f"sl={flat_params['risk.stop_atr_mult']}, "
              f"cd={flat_params['risk.cooldown_bars']}, "
              f"rsi_l={flat_params['entry.rsi_long_max']}, "
              f"rsi_s={flat_params['entry.rsi_short_min']}, "
              f"st2={flat_params['supertrend.st2_mult']}, "
              f"st3={flat_params['supertrend.st3_mult']}, "
              f"adx={flat_params['trend_filter.adx_threshold']}, "
              f"sqz={flat_params['squeeze.use']}")

        r = run_single_backtest(nested, name)
        m = extract_metrics(r)
        all_results.append({"flat_params": flat_params, "backtest": r, "metrics": m})
        all_metrics.append(m)

        if m:
            print(f"  => PnL: {m['pnl_pct']:.1f}%, DD: {m['max_dd']:.1f}%, "
                  f"Sharpe: {m['sharpe']:.2f}, WR: {m['win_rate']:.1f}%, "
                  f"PF: {m['profit_factor']:.2f}, Trades: {m['total_trades']}")
        else:
            print(f"  => FAILED or no data")

        # Log progress every 10
        if (i + 1) % 10 == 0:
            valid = [x for x in all_results if x["metrics"] and x["metrics"]["total_trades"] >= 15]
            if valid:
                best = max(valid, key=lambda x: x["metrics"]["pnl_pct"])
                print(f"\n  --- Progress: {i+1}/{len(configs)} done, "
                      f"{len(valid)} valid, "
                      f"best PnL so far: {best['metrics']['pnl_pct']:.1f}% ---\n")

    # Score Phase 1
    valid_p1 = [x for x in all_results if x["metrics"] and x["metrics"]["total_trades"] >= 15]
    for x in valid_p1:
        x["score"] = score_result(x["metrics"], all_metrics)
    valid_p1.sort(key=lambda x: x["score"], reverse=True)

    print(f"\n{'='*60}")
    print(f"PHASE 1 RESULTS: {len(valid_p1)} valid configs")
    print(f"{'='*60}")
    for rank, x in enumerate(valid_p1[:10], 1):
        m = x["metrics"]
        print(f"  #{rank}: PnL={m['pnl_pct']:.1f}% DD={m['max_dd']:.1f}% "
              f"Sharpe={m['sharpe']:.2f} WR={m['win_rate']:.1f}% "
              f"PF={m['profit_factor']:.2f} Trades={m['total_trades']} Score={x['score']:.3f}")

    if len(valid_p1) < 5:
        print("Not enough valid results for Phase 2. Exiting.")
        save_report(valid_p1, [], [])
        return

    # === PHASE 2: Fine Grid around TOP-5 ===
    print(f"\n{'='*60}")
    print("PHASE 2: Fine Grid around TOP-5")
    print(f"{'='*60}")

    top5_flat = [x["flat_params"] for x in valid_p1[:5]]
    fine_configs = generate_fine_grid(top5_flat)
    # Remove configs already tested
    tested_set = [json.dumps(x["flat_params"], sort_keys=True) for x in all_results]
    fine_configs = [c for c in fine_configs if json.dumps(c, sort_keys=True) not in tested_set]
    # Limit to 40
    fine_configs = fine_configs[:40]
    print(f"Generated {len(fine_configs)} fine-grid configs")

    phase2_results = []
    for i, flat_params in enumerate(fine_configs):
        name = f"Opt15m_P2_{i+1:03d}"
        nested = flat_to_nested(flat_params)
        print(f"\n[{i+1}/{len(fine_configs)}] {name}")

        r = run_single_backtest(nested, name)
        m = extract_metrics(r)
        entry = {"flat_params": flat_params, "backtest": r, "metrics": m}
        phase2_results.append(entry)
        all_results.append(entry)
        all_metrics.append(m)

        if m:
            print(f"  => PnL: {m['pnl_pct']:.1f}%, DD: {m['max_dd']:.1f}%, "
                  f"Sharpe: {m['sharpe']:.2f}, Trades: {m['total_trades']}")

        if (i + 1) % 10 == 0:
            print(f"  --- Phase 2 progress: {i+1}/{len(fine_configs)} ---")

    # Re-score everything
    all_valid = [x for x in all_results if x["metrics"] and x["metrics"]["total_trades"] >= 15]
    for x in all_valid:
        x["score"] = score_result(x["metrics"], [y["metrics"] for y in all_valid])
    all_valid.sort(key=lambda x: x["score"], reverse=True)

    print(f"\n{'='*60}")
    print(f"COMBINED RESULTS: {len(all_valid)} valid configs")
    print(f"{'='*60}")
    for rank, x in enumerate(all_valid[:10], 1):
        m = x["metrics"]
        print(f"  #{rank}: PnL={m['pnl_pct']:.1f}% DD={m['max_dd']:.1f}% "
              f"Sharpe={m['sharpe']:.2f} WR={m['win_rate']:.1f}% "
              f"PF={m['profit_factor']:.2f} Trades={m['total_trades']} Score={x['score']:.3f}")

    # === PHASE 3: Cross-validate top 3 on ETHUSDT ===
    print(f"\n{'='*60}")
    print("PHASE 3: Cross-validation on ETHUSDT")
    print(f"{'='*60}")

    cross_results = []
    for rank, x in enumerate(all_valid[:3], 1):
        name = f"Opt15m_P3_ETH_{rank}"
        nested = flat_to_nested(x["flat_params"])
        print(f"\n[Cross-val #{rank}] {name}")
        r = run_single_backtest(nested, name, symbol="ETHUSDT")
        m = extract_metrics(r)
        cross_results.append({"flat_params": x["flat_params"], "btc_metrics": x["metrics"],
                              "eth_backtest": r, "eth_metrics": m})
        if m:
            print(f"  ETH => PnL: {m['pnl_pct']:.1f}%, DD: {m['max_dd']:.1f}%, "
                  f"Sharpe: {m['sharpe']:.2f}, Trades: {m['total_trades']}")

    save_report(all_valid, cross_results, all_results)
    print("\nDone! Report saved to /tmp/optimize_15m_results.json")


def save_report(top_results, cross_results, all_results):
    """Save results to JSON for later analysis."""
    report = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "symbol": SYMBOL,
        "timeframe": TIMEFRAME,
        "period": f"{START_DATE} to {END_DATE}",
        "total_tested": len(all_results),
        "valid_configs": len(top_results),
        "top10": [],
        "cross_validation": [],
    }

    for rank, x in enumerate(top_results[:10], 1):
        report["top10"].append({
            "rank": rank,
            "score": round(x.get("score", 0), 4),
            "params": x["flat_params"],
            "nested_config": flat_to_nested(x["flat_params"]),
            "metrics": x["metrics"],
        })

    for cv in cross_results:
        report["cross_validation"].append({
            "params": cv["flat_params"],
            "btc_metrics": cv["btc_metrics"],
            "eth_metrics": cv["eth_metrics"],
        })

    with open("/tmp/optimize_15m_results.json", "w") as f:
        json.dump(report, f, indent=2, default=str)


if __name__ == "__main__":
    main()
