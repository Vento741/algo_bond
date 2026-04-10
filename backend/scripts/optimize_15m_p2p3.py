#!/usr/bin/env python3
"""Phase 2 (fine grid) + Phase 3 (cross-validation) for 15m optimization."""

import json
import subprocess
import sys
import time

TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNDFjMjc5My05NGEyLTQ0NzctYTRlNy02YWExN2E1NWEyMGYiLCJleHAiOjE3NzU5MDI1MTksInR5cGUiOiJhY2Nlc3MifQ.YXsavVuZ_dGRJBunj3f3PnNExkhOXBlrsPriabfmBi8"
STRATEGY_ID = "a3a59dd1-ca06-42fb-a036-a3d37c2864b1"
BASE = "http://localhost:8100/api"
TIMEFRAME = "15"
START_DATE = "2025-11-10"
END_DATE = "2026-04-10"
INITIAL_CAPITAL = 100

# Top 5 from Phase 1
TOP5 = [
    {"risk.trailing_atr_mult": 20, "risk.tp_atr_mult": 15, "risk.stop_atr_mult": 5.0, "risk.cooldown_bars": 5, "entry.rsi_long_max": 45, "entry.rsi_short_min": 45, "supertrend.st2_mult": 4.0, "supertrend.st3_mult": 7.0, "trend_filter.adx_threshold": 15, "squeeze.use": True},
    {"risk.trailing_atr_mult": 20, "risk.tp_atr_mult": 10, "risk.stop_atr_mult": 4.0, "risk.cooldown_bars": 5, "entry.rsi_long_max": 45, "entry.rsi_short_min": 25, "supertrend.st2_mult": 2.0, "supertrend.st3_mult": 5.0, "trend_filter.adx_threshold": 20, "squeeze.use": True},
    {"risk.trailing_atr_mult": 10, "risk.tp_atr_mult": 50, "risk.stop_atr_mult": 4.0, "risk.cooldown_bars": 20, "entry.rsi_long_max": 75, "entry.rsi_short_min": 35, "supertrend.st2_mult": 3.0, "supertrend.st3_mult": 7.0, "trend_filter.adx_threshold": 25, "squeeze.use": False},
    {"risk.trailing_atr_mult": 25, "risk.tp_atr_mult": 10, "risk.stop_atr_mult": 5.0, "risk.cooldown_bars": 30, "entry.rsi_long_max": 45, "entry.rsi_short_min": 45, "supertrend.st2_mult": 4.0, "supertrend.st3_mult": 5.0, "trend_filter.adx_threshold": 20, "squeeze.use": False},
    {"risk.trailing_atr_mult": 20, "risk.tp_atr_mult": 10, "risk.stop_atr_mult": 4.0, "risk.cooldown_bars": 30, "entry.rsi_long_max": 45, "entry.rsi_short_min": 55, "supertrend.st2_mult": 4.0, "supertrend.st3_mult": 5.0, "trend_filter.adx_threshold": 25, "squeeze.use": True},
]

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
    cmd = ["curl", "-s", "-X", method, f"{BASE}{path}",
           "-H", f"Authorization: Bearer {TOKEN}",
           "-H", "Content-Type: application/json"]
    if data:
        cmd.extend(["-d", json.dumps(data)])
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        return None
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return None


def flat_to_nested(flat_params):
    config = {}
    for key, val in flat_params.items():
        parts = key.split(".")
        d = config
        for p in parts[:-1]:
            d = d.setdefault(p, {})
        d[parts[-1]] = val
    return config


def run_backtest(config, name, symbol="BTCUSDT"):
    cfg_resp = curl("POST", "/strategies/configs", {
        "strategy_id": STRATEGY_ID, "name": name,
        "symbol": symbol, "timeframe": TIMEFRAME, "config": config,
    })
    if not cfg_resp or "id" not in cfg_resp:
        print(f"  Config creation failed: {cfg_resp}")
        return None

    bt_resp = curl("POST", "/backtest/runs", {
        "strategy_config_id": cfg_resp["id"], "symbol": symbol,
        "timeframe": TIMEFRAME, "start_date": START_DATE,
        "end_date": END_DATE, "initial_capital": INITIAL_CAPITAL,
    })
    if not bt_resp or "id" not in bt_resp:
        print(f"  Backtest start failed: {bt_resp}")
        return None

    run_id = bt_resp["id"]
    for _ in range(40):  # max 320s
        time.sleep(8)
        st = curl("GET", f"/backtest/runs/{run_id}")
        if not st:
            continue
        if st.get("status") == "completed":
            break
        if st.get("status") == "failed":
            print(f"  Backtest FAILED")
            return None
    else:
        print(f"  Backtest TIMEOUT")
        return None

    result = curl("GET", f"/backtest/runs/{run_id}/result")
    if not result:
        return None
    try:
        return {
            "pnl_pct": float(result.get("total_pnl_pct", 0)),
            "max_dd": float(result.get("max_drawdown", 0)),
            "sharpe": float(result.get("sharpe_ratio", 0)),
            "win_rate": float(result.get("win_rate", 0)) * 100,
            "profit_factor": float(result.get("profit_factor", 0)),
            "total_trades": int(result.get("total_trades", 0)),
        }
    except (TypeError, ValueError):
        return None


def generate_fine_grid(top_configs):
    fine = []
    tested_keys = set()
    for base in top_configs:
        tested_keys.add(json.dumps(base, sort_keys=True))

    for base in top_configs:
        for param_key in PARAM_SPACE:
            values = PARAM_SPACE[param_key]
            current = base[param_key]
            if current in values:
                idx = values.index(current)
                for offset in [-1, 1]:
                    new_idx = idx + offset
                    if 0 <= new_idx < len(values):
                        new_flat = dict(base)
                        new_flat[param_key] = values[new_idx]
                        key = json.dumps(new_flat, sort_keys=True)
                        if key not in tested_keys:
                            tested_keys.add(key)
                            fine.append(new_flat)
    return fine[:40]


def main():
    # === PHASE 2: Fine Grid ===
    print("=" * 60)
    print("PHASE 2: Fine Grid around TOP-5 (15m)")
    print("=" * 60)

    fine_configs = generate_fine_grid(TOP5)
    print(f"Generated {len(fine_configs)} fine-grid configs\n")

    all_results = []
    for i, flat in enumerate(fine_configs):
        name = f"Opt15m_P2_{i+1:03d}"
        nested = flat_to_nested(flat)
        print(f"[{i+1}/{len(fine_configs)}] {name}")
        m = run_backtest(nested, name)
        all_results.append({"params": flat, "metrics": m})
        if m:
            print(f"  => PnL: {m['pnl_pct']:.1f}%, DD: {m['max_dd']:.1f}%, "
                  f"Sharpe: {m['sharpe']:.2f}, WR: {m['win_rate']:.1f}%, "
                  f"PF: {m['profit_factor']:.2f}, Trades: {m['total_trades']}")
        else:
            print(f"  => FAILED")
        if (i + 1) % 10 == 0:
            valid = [x for x in all_results if x["metrics"] and x["metrics"]["total_trades"] >= 15]
            if valid:
                best = max(valid, key=lambda x: x["metrics"]["pnl_pct"])
                print(f"\n  --- P2 progress: {i+1}/{len(fine_configs)}, "
                      f"best PnL: {best['metrics']['pnl_pct']:.1f}% ---\n")

    # Combine with Phase 1 top configs
    p1_results = [{"params": p, "metrics": {
        "pnl_pct": m["pnl_pct"], "max_dd": m["max_dd"], "sharpe": m["sharpe"],
        "win_rate": m["win_rate"], "profit_factor": m["profit_factor"],
        "total_trades": m["total_trades"]
    }} for p, m in zip(TOP5, [
        {"pnl_pct": 13.36, "max_dd": 6.5, "sharpe": 1.15, "win_rate": 40.32, "profit_factor": 1.44, "total_trades": 62},
        {"pnl_pct": 15.68, "max_dd": 9.38, "sharpe": 1.22, "win_rate": 37.5, "profit_factor": 1.3, "total_trades": 104},
        {"pnl_pct": 8.16, "max_dd": 6.11, "sharpe": 0.86, "win_rate": 41.67, "profit_factor": 1.32, "total_trades": 72},
        {"pnl_pct": 9.65, "max_dd": 6.77, "sharpe": 0.94, "win_rate": 38.36, "profit_factor": 1.28, "total_trades": 73},
        {"pnl_pct": 9.43, "max_dd": 7.28, "sharpe": 0.96, "win_rate": 35.42, "profit_factor": 1.26, "total_trades": 96},
    ])]

    combined = p1_results + [x for x in all_results if x["metrics"] and x["metrics"]["total_trades"] >= 15]
    combined.sort(key=lambda x: x["metrics"]["pnl_pct"], reverse=True)

    print(f"\n{'='*60}")
    print(f"COMBINED TOP-10 (P1+P2):")
    print(f"{'='*60}")
    for rank, x in enumerate(combined[:10], 1):
        m = x["metrics"]
        print(f"  #{rank}: PnL={m['pnl_pct']:.1f}% DD={m['max_dd']:.1f}% "
              f"Sharpe={m['sharpe']:.2f} WR={m['win_rate']:.1f}% "
              f"PF={m['profit_factor']:.2f} Trades={m['total_trades']}")
        print(f"       trail={x['params']['risk.trailing_atr_mult']}, "
              f"tp={x['params']['risk.tp_atr_mult']}, "
              f"sl={x['params']['risk.stop_atr_mult']}, "
              f"cd={x['params']['risk.cooldown_bars']}")

    # === PHASE 3: Cross-validate top 3 on ETHUSDT ===
    print(f"\n{'='*60}")
    print("PHASE 3: Cross-validation on ETHUSDT")
    print(f"{'='*60}")

    cross = []
    for rank, x in enumerate(combined[:3], 1):
        name = f"Opt15m_P3_ETH_{rank}"
        nested = flat_to_nested(x["params"])
        print(f"\n[Cross-val #{rank}] {name}")
        m = run_backtest(nested, name, symbol="ETHUSDT")
        cross.append({"params": x["params"], "btc": x["metrics"], "eth": m})
        if m:
            print(f"  BTC: PnL={x['metrics']['pnl_pct']:.1f}%")
            print(f"  ETH: PnL={m['pnl_pct']:.1f}%, DD={m['max_dd']:.1f}%, "
                  f"Sharpe={m['sharpe']:.2f}, Trades={m['total_trades']}")

    # Save final results
    report = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "phases": "P1(100) + P2(fine) + P3(cross-val)",
        "top10": [{"rank": i+1, "params": x["params"], "metrics": x["metrics"]}
                  for i, x in enumerate(combined[:10])],
        "cross_validation": cross,
        "best_config": flat_to_nested(combined[0]["params"]) if combined else {},
    }
    with open("/tmp/optimize_15m_final.json", "w") as f:
        json.dump(report, f, indent=2, default=str)

    print(f"\nFinal report saved to /tmp/optimize_15m_final.json")
    print(f"\nBest config (nested):")
    print(json.dumps(flat_to_nested(combined[0]["params"]), indent=2))


if __name__ == "__main__":
    main()
