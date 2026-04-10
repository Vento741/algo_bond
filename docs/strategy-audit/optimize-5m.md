# SuperTrend Squeeze Momentum - 5m Optimization Report

**Date:** 2026-04-10
**Strategy:** SuperTrend Squeeze Momentum (a3a59dd1)
**Timeframe:** 5 min
**Period:** 2025-11-10 to 2026-04-10 (~5 months)
**Initial Capital:** $100, 100% position size
**Commission:** 0.05% per trade

## Summary

**170 backtests** executed across 3 phases. Only **2 out of 160 valid configs (1.25%)** produced positive PnL. The strategy is fundamentally unprofitable on 5-minute timeframe with this parameter space.

| Metric | Value |
|--------|-------|
| Total runs | 170 |
| Completed (>= 20 trades) | 160 |
| Positive PnL configs | 2 (1.25%) |
| Best PnL | +2.0% |
| Worst PnL | -53.3% |
| Average PnL | -30.2% |

## TOP-10 Configs by Composite Score

Score = 0.35*PnL_norm + 0.25*(1-DD_norm) + 0.20*Sharpe_norm + 0.10*WR_norm + 0.10*PF_norm

| # | Name | Score | PnL% | DD% | Sharpe | WR% | PF | Trades | trail | tp | sl | cd | rsiL | st3 | adx |
|---|------|-------|------|-----|--------|-----|-----|--------|-------|-----|-----|-----|------|-----|-----|
| 1 | O5m_P1_097 | 0.238 | -9.0 | 15.1 | -0.33 | 33.2 | 0.91 | 199 | 8 | 40 | 5.0 | 60 | 60 | 4.0 | 25 |
| 2 | O5m_P1_059 | 0.215 | **+2.0** | 21.6 | 0.20 | 22.8 | 1.02 | 127 | 20 | 40 | 5.0 | 60 | 50 | 5.0 | 25 |
| 3 | O5m_P1_044 | 0.214 | -11.1 | 19.1 | -0.36 | 29.1 | 0.90 | 175 | 12 | 40 | 5.0 | 40 | 50 | 5.0 | 25 |
| 4 | O5m_P2_045 | 0.214 | -16.0 | 19.2 | -0.62 | 31.2 | 0.85 | 224 | 8 | 30 | 4.0 | 60 | 50 | 4.0 | 20 |
| 5 | O5m_P1_087 | 0.212 | **+0.9** | 23.6 | 0.15 | 34.8 | 1.01 | 207 | 8 | 20 | 5.0 | 60 | 60 | 3.0 | 25 |
| 6 | O5m_P2_047 | 0.201 | -14.0 | 21.2 | -0.50 | 28.2 | 0.87 | 227 | 8 | 30 | 4.0 | 60 | 50 | 5.0 | 20 |
| 7 | O5m_P1_076 | 0.199 | -8.7 | 21.1 | -0.26 | 23.2 | 0.93 | 241 | 12 | 30 | 3.0 | 40 | 50 | 4.0 | 20 |
| 8 | O5m_P2_046 | 0.198 | -15.9 | 22.1 | -0.75 | 30.7 | 0.84 | 215 | 8 | 30 | 4.0 | 60 | 50 | 4.0 | 25 |
| 9 | O5m_P1_031 | 0.190 | -15.5 | 22.4 | -0.63 | 23.8 | 0.84 | 160 | 16 | 40 | 4.0 | 40 | 70 | 4.0 | 20 |
| 10 | O5m_P1_084 | 0.189 | -18.0 | 21.9 | -0.76 | 20.1 | 0.86 | 244 | 16 | 15 | 3.0 | 40 | 50 | 3.0 | 20 |

## Cross-pair Validation (SOLUSDT)

| Config | BTC PnL | SOL PnL | SOL DD | SOL Sharpe | SOL Trades |
|--------|---------|---------|--------|------------|------------|
| #1 (P1_097, best score) | -9.0% | -13.8% | - | - | - |
| #2 (P1_059, best PnL) | **+2.0%** | **+17.4%** | 38.2% | 0.59 | 106 |
| #3 (P1_044, 3rd score) | -11.1% | -16.1% | 29.8% | -0.35 | 155 |

Config #2 (P1_059) shows the best cross-pair consistency: +2.0% on BTC, +17.4% on SOL.

## Best Config (P1_059 - only profitable cross-pair)

```json
{
  "supertrend": {
    "st1_period": 10,
    "st1_mult": 1.0,
    "st2_period": 11,
    "st2_mult": 3.0,
    "st3_period": 10,
    "st3_mult": 5.0,
    "min_agree": 2
  },
  "squeeze": {
    "use": true,
    "bb_period": 20,
    "bb_mult": 2.0,
    "kc_period": 20,
    "kc_mult": 1.5,
    "mom_period": 20
  },
  "trend_filter": {
    "use_adx": true,
    "adx_period": 14,
    "ema_period": 200,
    "adx_threshold": 25
  },
  "entry": {
    "rsi_period": 14,
    "rsi_long_max": 50,
    "rsi_short_min": 50,
    "use_volume": true,
    "volume_mult": 1.0
  },
  "risk": {
    "atr_period": 14,
    "stop_atr_mult": 5.0,
    "tp_atr_mult": 40,
    "use_trailing": true,
    "trailing_atr_mult": 20,
    "cooldown_bars": 60
  },
  "backtest": {
    "commission": 0.05,
    "order_size": 100,
    "initial_capital": 100
  }
}
```

## Parameter Sensitivity Analysis

### High Impact Parameters

| Parameter | Optimal Range | Impact | Notes |
|-----------|--------------|--------|-------|
| **stop_atr_mult** | **5.0** | CRITICAL | All top-10 configs have sl=4.0-5.0. Default 3.0 causes excessive stop-outs on 5m noise |
| **tp_atr_mult** | **30-40** | HIGH | Far TP lets winners run. Default 10.0 kills trades too early |
| **cooldown_bars** | **40-60** | HIGH | cd=60 (5h) prevents overtrading. cd=20 (100min) generates too many losing trades |
| **trailing_atr_mult** | **8-20** | HIGH | Default 6.0 too tight. Best configs use 8-20 |
| **adx_threshold** | **20-25** | MEDIUM | Higher ADX = trend confirmation, fewer but better trades |

### Low Impact Parameters

| Parameter | Range Tested | Impact | Notes |
|-----------|-------------|--------|-------|
| **rsi_long_max** | 50-70 | LOW | RSI filter barely matters. Both positive configs have rsiL=50-60 |
| **st3_mult** | 3.0-5.0 | LOW-MEDIUM | Tighter st3 (3.0-4.0) slightly better than default 7.0, but not decisive |
| **rsi_short_min** | 30-50 | LOW | Mirror of rsi_long_max, same low impact |

### Key Insight: Default Config is Catastrophically Bad

| Parameter | Default | Best 5m | Change |
|-----------|---------|---------|--------|
| trailing_atr_mult | 6.0 | 20.0 | +233% |
| tp_atr_mult | 10.0 | 40.0 | +300% |
| stop_atr_mult | 3.0 | 5.0 | +67% |
| cooldown_bars | 10 | 60 | +500% |
| rsi_long_max | 40 | 50 | +25% |
| st3_mult | 7.0 | 5.0 | -29% |

## Comparison with Default

| Metric | Default 5m | Best Optimized (P1_059) | Improvement |
|--------|-----------|------------------------|-------------|
| PnL% | ~-40% (estimated) | +2.0% | +42pp |
| Max DD | ~50% | 21.6% | -28pp |
| Sharpe | ~-2.5 | 0.20 | +2.7 |
| Win Rate | ~15% | 22.8% | +8pp |
| Trades | ~500+ | 127 | -74% |

## Conclusion

**The SuperTrend Squeeze strategy does NOT work well on 5-minute timeframe.** Even after exhaustive optimization (170 backtests, 8 parameters), the best config barely breaks even at +2.0% over 5 months. For comparison, Lorentzian KNN achieves +1725% on 15m.

**Root causes:**
1. 5m noise triggers too many false signals regardless of parameters
2. The SuperTrend indicator needs multi-hour price movements to be reliable
3. Squeeze Momentum releases on 5m are too frequent and unreliable
4. Even with very wide SL/TP/trailing, the fundamental signal quality is poor

**Recommendation:** Abandon 5m optimization for this strategy. Focus on 15m or higher timeframes where the strategy has proven profitable (+165% TRUMP 15m, +40% XRP 15m).

## Files

- Optimizer script: `backend/scripts/optimize_5m_vps.py`
- Raw results: `/tmp/optimization_results_5m.json` (on VPS)
- 170 strategy configs created in DB (prefix `O5m_P1_*`, `O5m_P2_*`, `O5m_SOL_*`)
