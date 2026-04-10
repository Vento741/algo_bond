"""Small batch optimization: 10 v2 configs on BTC 15m."""
import json
import subprocess
import time

TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNDFjMjc5My05NGEyLTQ0NzctYTRlNy02YWExN2E1NWEyMGYiLCJleHAiOjE3NzU4MjUxMTcsInR5cGUiOiJhY2Nlc3MifQ.vDk-rhu6qhMUowgMo48b3RBZq0ZbAPOtk15ArXYk2lk"
SID = "a3a59dd1-ca06-42fb-a036-a3d37c2864b1"
BASE = "http://localhost:8100/api"

CONFIGS = [
    {"name": "V2_01_regime_only", "config": {"risk":{"trailing_atr_mult":20,"tp_atr_mult":15,"stop_atr_mult":5.0,"cooldown_bars":5},"entry":{"rsi_long_max":45,"rsi_short_min":45},"supertrend":{"st2_mult":3.0,"st3_mult":7.0},"trend_filter":{"adx_threshold":15},"squeeze":{"use":True},"regime":{"use":True,"adx_ranging":20,"atr_high_vol_pct":75,"vol_scale":1.5,"skip_ranging":True}}},
    {"name": "V2_02_adaptive_trail", "config": {"risk":{"trailing_atr_mult":20,"tp_atr_mult":15,"stop_atr_mult":5.0,"cooldown_bars":5,"adaptive_trailing":True,"trail_low_mult":10,"trail_high_mult":25},"entry":{"rsi_long_max":45,"rsi_short_min":45},"supertrend":{"st2_mult":3.0,"st3_mult":7.0},"trend_filter":{"adx_threshold":15},"squeeze":{"use":True},"regime":{"use":True,"adx_ranging":20,"atr_high_vol_pct":75,"vol_scale":1.5,"skip_ranging":True}}},
    {"name": "V2_03_sq_duration", "config": {"risk":{"trailing_atr_mult":20,"tp_atr_mult":15,"stop_atr_mult":5.0,"cooldown_bars":5,"adaptive_trailing":True,"trail_low_mult":10,"trail_high_mult":25},"entry":{"rsi_long_max":45,"rsi_short_min":45},"supertrend":{"st2_mult":3.0,"st3_mult":7.0},"trend_filter":{"adx_threshold":15},"squeeze":{"use":True,"min_duration":10,"duration_norm":20,"max_weight":2.0},"regime":{"use":True,"adx_ranging":20,"atr_high_vol_pct":75,"vol_scale":1.5,"skip_ranging":True}}},
    {"name": "V2_04_tp20", "config": {"risk":{"trailing_atr_mult":20,"tp_atr_mult":20,"stop_atr_mult":5.0,"cooldown_bars":5,"adaptive_trailing":True,"trail_low_mult":10,"trail_high_mult":25},"entry":{"rsi_long_max":45,"rsi_short_min":45},"supertrend":{"st2_mult":3.0,"st3_mult":7.0},"trend_filter":{"adx_threshold":15},"squeeze":{"use":True,"min_duration":10,"duration_norm":20,"max_weight":2.0},"regime":{"use":True,"adx_ranging":20,"atr_high_vol_pct":75,"vol_scale":1.5,"skip_ranging":True}}},
    {"name": "V2_05_tp30", "config": {"risk":{"trailing_atr_mult":20,"tp_atr_mult":30,"stop_atr_mult":5.0,"cooldown_bars":5,"adaptive_trailing":True,"trail_low_mult":10,"trail_high_mult":25},"entry":{"rsi_long_max":45,"rsi_short_min":45},"supertrend":{"st2_mult":3.0,"st3_mult":7.0},"trend_filter":{"adx_threshold":15},"squeeze":{"use":True,"min_duration":10,"duration_norm":20,"max_weight":2.0},"regime":{"use":True,"adx_ranging":20,"atr_high_vol_pct":75,"vol_scale":1.5,"skip_ranging":True}}},
    {"name": "V2_06_wide_trail", "config": {"risk":{"trailing_atr_mult":20,"tp_atr_mult":20,"stop_atr_mult":5.0,"cooldown_bars":5,"adaptive_trailing":True,"trail_low_mult":8,"trail_high_mult":30},"entry":{"rsi_long_max":45,"rsi_short_min":45},"supertrend":{"st2_mult":3.0,"st3_mult":7.0},"trend_filter":{"adx_threshold":15},"squeeze":{"use":True,"min_duration":10,"duration_norm":20,"max_weight":2.0},"regime":{"use":True,"adx_ranging":20,"atr_high_vol_pct":75,"vol_scale":1.5,"skip_ranging":True}}},
    {"name": "V2_07_rsi55_adx20", "config": {"risk":{"trailing_atr_mult":20,"tp_atr_mult":15,"stop_atr_mult":5.0,"cooldown_bars":5,"adaptive_trailing":True,"trail_low_mult":10,"trail_high_mult":25},"entry":{"rsi_long_max":55,"rsi_short_min":45},"supertrend":{"st2_mult":3.0,"st3_mult":7.0},"trend_filter":{"adx_threshold":20},"squeeze":{"use":True,"min_duration":10,"duration_norm":20,"max_weight":2.0},"regime":{"use":True,"adx_ranging":20,"atr_high_vol_pct":75,"vol_scale":1.5,"skip_ranging":True}}},
    {"name": "V2_08_strict_regime", "config": {"risk":{"trailing_atr_mult":20,"tp_atr_mult":15,"stop_atr_mult":5.0,"cooldown_bars":5,"adaptive_trailing":True,"trail_low_mult":10,"trail_high_mult":25},"entry":{"rsi_long_max":45,"rsi_short_min":45},"supertrend":{"st2_mult":3.0,"st3_mult":7.0},"trend_filter":{"adx_threshold":15},"squeeze":{"use":True,"min_duration":10,"duration_norm":20,"max_weight":2.0},"regime":{"use":True,"adx_ranging":15,"atr_high_vol_pct":70,"vol_scale":2.0,"skip_ranging":True}}},
    {"name": "V2_09_st2_2_st3_5", "config": {"risk":{"trailing_atr_mult":20,"tp_atr_mult":15,"stop_atr_mult":5.0,"cooldown_bars":5,"adaptive_trailing":True,"trail_low_mult":10,"trail_high_mult":25},"entry":{"rsi_long_max":45,"rsi_short_min":45},"supertrend":{"st2_mult":2.0,"st3_mult":5.0},"trend_filter":{"adx_threshold":15},"squeeze":{"use":True,"min_duration":10,"duration_norm":20,"max_weight":2.0},"regime":{"use":True,"adx_ranging":20,"atr_high_vol_pct":75,"vol_scale":1.5,"skip_ranging":True}}},
    {"name": "V2_10_mild_dur", "config": {"risk":{"trailing_atr_mult":20,"tp_atr_mult":15,"stop_atr_mult":5.0,"cooldown_bars":5,"adaptive_trailing":True,"trail_low_mult":12,"trail_high_mult":20},"entry":{"rsi_long_max":45,"rsi_short_min":45},"supertrend":{"st2_mult":3.0,"st3_mult":7.0},"trend_filter":{"adx_threshold":15},"squeeze":{"use":True,"min_duration":5,"duration_norm":15,"max_weight":1.5},"regime":{"use":True,"adx_ranging":20,"atr_high_vol_pct":75,"vol_scale":1.5,"skip_ranging":True}}},
]


def ssh_curl(path: str, method: str = "GET", data: dict | None = None) -> dict:
    """Запуск curl через SSH."""
    cmd = f'curl -s -X {method} {BASE}{path} -H "Authorization: Bearer {TOKEN}"'
    if data:
        cmd += f" -H 'Content-Type: application/json' -d '{json.dumps(data)}'"
    result = subprocess.run(
        ["ssh", "jeremy-vps", cmd],
        capture_output=True, text=True, timeout=30,
    )
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return {"error": result.stdout or result.stderr}


def run_backtest(config_id: str, symbol: str, tf: str) -> dict | None:
    """Запуск бэктеста и ожидание результата."""
    run = ssh_curl("/backtest/runs", "POST", {
        "strategy_config_id": config_id,
        "symbol": symbol,
        "timeframe": tf,
        "start_date": "2025-11-10",
        "end_date": "2026-04-10",
        "initial_capital": 100,
    })
    rid = run.get("id")
    if not rid:
        print(f"  ERROR starting backtest: {run}")
        return None

    for _ in range(120):
        time.sleep(5)
        status = ssh_curl(f"/backtest/runs/{rid}")
        if status.get("status") == "completed":
            return ssh_curl(f"/backtest/runs/{rid}/result")
        if status.get("status") == "failed":
            return None
    return None


def main() -> None:
    print("=" * 60)
    print("Small Batch v2 Optimization: BTC 15m")
    print("BASELINE: +36.86% PnL, 10.5% DD")
    print("=" * 60)

    results = []
    for i, item in enumerate(CONFIGS):
        name = item["name"]
        cfg = item["config"]
        print(f"\n--- [{i+1}/10] {name} ---")

        # Create config
        resp = ssh_curl("/strategies/configs", "POST", {
            "strategy_id": SID,
            "name": name,
            "symbol": "BTCUSDT",
            "timeframe": "15",
            "config": cfg,
        })
        cid = resp.get("id")
        if not cid:
            print(f"  SKIP: {resp}")
            continue

        result = run_backtest(cid, "BTCUSDT", "15")
        if result and "total_pnl_pct" in result:
            pnl = result["total_pnl_pct"]
            dd = result["max_drawdown"]
            wr = f'{float(result["win_rate"])*100:.1f}'
            tr = result["total_trades"]
            sh = result["sharpe_ratio"]
            pf = result["profit_factor"]
            print(f"  PnL: {pnl}% | DD: {dd}% | WR: {wr}% | Trades: {tr} | Sharpe: {sh} | PF: {pf}")
            results.append({"name": name, "pnl": float(pnl), "dd": float(dd), "wr": float(wr), "trades": int(tr), "sharpe": float(sh), "pf": float(pf)})
        else:
            print("  FAILED")

    print("\n" + "=" * 60)
    print("RESULTS SORTED BY PnL:")
    print("=" * 60)
    for r in sorted(results, key=lambda x: x["pnl"], reverse=True):
        delta = r["pnl"] - 36.86
        sign = "+" if delta >= 0 else ""
        print(f"  {r['name']:25s} PnL:{r['pnl']:+7.2f}% DD:{r['dd']:5.1f}% WR:{r['wr']:5.1f}% Tr:{r['trades']:3d} Sh:{r['sharpe']:+5.2f} PF:{r['pf']:4.2f} | vs baseline: {sign}{delta:.2f}pp")


if __name__ == "__main__":
    main()
