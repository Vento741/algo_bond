# SuperTrend Squeeze Momentum - 15m Optimization Results

**Date:** 2026-04-10
**Symbol:** BTCUSDT (primary), ETHUSDT (cross-validation)
**Timeframe:** 15 minutes
**Period:** 2025-11-10 to 2026-04-10 (~5 months)
**Initial Capital:** $100

## Summary

- **Phase 1:** 100 random configs from parameter space (coarse grid)
- **Phase 2:** 40 fine-grid configs around TOP-5 from Phase 1
- **Phase 3:** Cross-validation of TOP-3 on ETHUSDT
- **Total backtests:** 143
- **Valid configs (>=15 trades):** ~110

## TOP-10 Configs

| Rank | PnL% | MaxDD% | Sharpe | WinRate% | ProfitFactor | Trades | Trail | TP | SL | CD | RSI_L | RSI_S | ST2 | ST3 | ADX | Squeeze |
|------|-------|--------|--------|----------|-------------|--------|-------|-----|-----|-----|-------|-------|-----|-----|-----|---------|
| 1 | 16.33 | 6.60 | 1.28 | 42.25 | 1.44 | 71 | 20 | 15 | 5.0 | 5 | 45 | 45 | 3.0 | 7.0 | 15 | ON |
| 2 | 15.68 | 9.38 | 1.22 | 37.50 | 1.30 | 104 | 20 | 10 | 4.0 | 5 | 45 | 25 | 2.0 | 5.0 | 20 | ON |
| 3 | 15.57 | 6.50 | 1.31 | 40.98 | 1.52 | 61 | 20 | 15 | 5.0 | 5 | 45 | 45 | 4.0 | 5.0 | 15 | ON |
| 4 | 15.17 | 9.38 | 1.18 | 37.14 | 1.29 | 105 | 25 | 10 | 4.0 | 5 | 45 | 25 | 2.0 | 5.0 | 20 | ON |
| 5 | 14.97 | 9.38 | 1.17 | 37.14 | 1.28 | 105 | 20 | 10 | 4.0 | 5 | 45 | 25 | 2.0 | 7.0 | 20 | ON |
| 6 | 14.81 | 6.17 | 1.22 | 39.13 | 1.44 | 69 | 25 | 15 | 5.0 | 5 | 45 | 45 | 4.0 | 7.0 | 15 | ON |
| 7 | 14.71 | 6.17 | 1.23 | 40.74 | 1.55 | 54 | 20 | 20 | 5.0 | 5 | 45 | 45 | 4.0 | 7.0 | 15 | ON |
| 8 | 13.36 | 6.50 | 1.15 | 40.32 | 1.44 | 62 | 20 | 15 | 5.0 | 5 | 45 | 45 | 4.0 | 7.0 | 15 | ON |
| 9 | 13.22 | 7.74 | 1.21 | 40.91 | 1.47 | 66 | 15 | 15 | 5.0 | 5 | 45 | 45 | 4.0 | 7.0 | 15 | ON |
| 10 | 12.13 | 6.73 | 1.07 | 41.27 | 1.40 | 63 | 20 | 15 | 5.0 | 5 | 45 | 45 | 4.0 | 7.0 | 20 | ON |

## Best Config (JSON)

```json
{
  "risk": {
    "trailing_atr_mult": 20,
    "tp_atr_mult": 15,
    "stop_atr_mult": 5.0,
    "cooldown_bars": 5
  },
  "entry": {
    "rsi_long_max": 45,
    "rsi_short_min": 45
  },
  "supertrend": {
    "st2_mult": 3.0,
    "st3_mult": 7.0
  },
  "trend_filter": {
    "adx_threshold": 15
  },
  "squeeze": {
    "use": true
  }
}
```

## Cross-Validation (ETHUSDT)

| Config | BTC PnL% | BTC DD% | ETH PnL% | ETH DD% | ETH Sharpe | Verdict |
|--------|----------|---------|----------|---------|------------|---------|
| #1 (st2=3.0, st3=7.0) | +16.33 | 6.60 | +8.67 | 13.97 | 0.61 | PASS |
| #2 (st2=2.0, st3=5.0) | +15.68 | 9.38 | +3.50 | 15.31 | 0.30 | MARGINAL |
| #3 (st2=4.0, st3=5.0) | +15.57 | 6.50 | -14.06 | 24.32 | -0.93 | FAIL |

**Winner:** Config #1 - profitable on both BTC (+16.3%) and ETH (+8.7%). Config #3 is overfit to BTC.

## Parameter Sensitivity Analysis

### Converged parameters (stable across TOP-10):
- **cooldown_bars = 5** - all top configs use minimum cooldown (more trades = more opportunity)
- **rsi_long_max = 45** - strict RSI filter, only enter longs when RSI < 45 (not overbought)
- **squeeze.use = true** - all top configs use squeeze momentum (adds breakout signals)
- **stop_atr_mult = 4.0-5.0** - wide stops (4-5x ATR), letting trades breathe
- **trailing_atr_mult = 20** - very wide trailing (20x ATR on 15m bars)

### Variable parameters (need tuning per pair):
- **st2_mult:** 2.0-4.0 range (3.0 optimal for cross-pair)
- **st3_mult:** 5.0-7.0 range (7.0 more robust across pairs)
- **tp_atr_mult:** 10-20 range (15 best balance)
- **adx_threshold:** 15-20 (15 catches more trends)
- **rsi_short_min:** 25-45 (45 = symmetric with long filter)

### Key insight: Two clusters
1. **Conservative (60-70 trades):** sl=5.0, tp=15-20, trail=20, st3=7.0 - lower DD (~6.5%), moderate PnL
2. **Aggressive (100-105 trades):** sl=4.0, tp=10, trail=20-25, st3=5.0 - higher DD (~9.4%), slightly higher PnL

Config #1 bridges both: st3=7.0 (conservative filtering) but st2=3.0 (moderate) achieves 71 trades with 6.6% DD.

## Comparison with Default Config

| Metric | Default | Optimized #1 | Improvement |
|--------|---------|-------------|-------------|
| PnL% | ~5.6% | 16.33% | +191% |
| MaxDD% | ~15.5% | 6.60% | -57% |
| Sharpe | 0.48 | 1.28 | +167% |
| WinRate% | 21.35% | 42.25% | +98% |
| ProfitFactor | 1.18 | 1.44 | +22% |
| Trades | 89 | 71 | -20% |

## Recommendations

1. **Deploy Config #1** for BTCUSDT 15m - best risk-adjusted returns
2. **Config #1 also works for ETHUSDT** (+8.67%), making it a good multi-pair candidate
3. **Avoid Config #3** (st2=4.0, st3=5.0) - overfit to BTC, loses -14% on ETH
4. **Key changes from defaults:** wider SL (5x vs 3x ATR), wider trailing (20x vs 6x), lower cooldown (5 vs 10), strict RSI (45 vs 40/60)
