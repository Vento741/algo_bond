# Hybrid KNN + SuperTrend - Multi-Pair Screening

**Date:** 2026-04-10
**Strategy:** Hybrid KNN + SuperTrend (b1c2d3e4-f5a6-7890-abcd-ef1234567890)
**Period:** 2025-11-10 to 2026-04-10 (5 months)
**Timeframe:** 15m | Capital: $100 | Order size: 75%

## Config Template

```json
{
  "hybrid": {"knn_min_confidence": 55, "knn_min_score": 0.1, "use_knn_direction": true},
  "knn": {"neighbors": 8, "lookback": 50, "weight": 0.5, "rsi_period": 15,
          "wt_ch_len": 10, "wt_avg_len": 21, "cci_period": 20, "adx_period": 14},
  "supertrend": {"st2_mult": 3.25, "st3_mult": 7.0},
  "entry": {"rsi_long_max": <RSI>, "rsi_short_min": <RSI>},
  "trend_filter": {"adx_threshold": 15},
  "squeeze": {"use": true},
  "risk": {"trailing_atr_mult": 20, "tp_atr_mult": 20, "stop_atr_mult": 5.0, "cooldown_bars": 5},
  "backtest": {"commission": 0.05, "slippage": <SLIP>, "order_size": 75}
}
```

RSI tuning: TRUMP/WIF/BONK=28, TIA=25, majors/alts=45

## Results (sorted by KNN improvement)

| Pair | RSI | Pure ST PnL | Hybrid PnL | Delta | Trades | WR | DD | Sharpe | PF |
|------|-----|-------------|------------|-------|--------|----|----|--------|-----|
| NEARUSDT | 45 | +0.67% | **+31.01%** | **+30.34pp** | 60 | 31.7% | 33.8% | +0.88 | 1.30 |
| AVAXUSDT | 45 | +8.37% | +9.18% | +0.81pp | 69 | 33.3% | 21.9% | +0.45 | 1.10 |
| DOGEUSDT | 45 | -8.21% | -8.18% | +0.03pp | 76 | 27.6% | 36.7% | -0.18 | 0.93 |
| 1000BONKUSDT | 28 | +15.26% | +5.79% | -9.47pp | 54 | 33.3% | 24.4% | +0.33 | 1.06 |
| SOLUSDT | 45 | -2.35% | -13.22% | -10.87pp | 80 | 30.0% | 38.8% | -0.33 | 0.87 |
| ETHUSDT | 45 | +8.67% | -6.30% | -14.97pp | 79 | 34.2% | 27.1% | -0.12 | 0.93 |
| TIAUSDT | 25 | +23.60% | +7.79% | -15.81pp | 68 | 25.0% | 28.2% | +0.38 | 1.06 |
| WIFUSDT | 28 | +35.78% | -6.34% | -42.12pp | 66 | 27.3% | 24.7% | +0.04 | 0.94 |
| BTCUSDT | 45 | +26.51% | -16.49% | -43.00pp | 92 | 31.5% | 27.3% | -0.97 | 0.77 |
| SUIUSDT | 45 | +24.57% | -29.67% | -54.24pp | 80 | 26.2% | 49.0% | -0.84 | 0.75 |

## Aggregated Stats

| Metric | Pure ST | Hybrid |
|--------|---------|--------|
| Avg PnL | +13.29% | -2.64% |
| Profitable pairs | 7/10 | 4/10 |
| Avg Delta | - | -15.93pp |
| Median Delta | - | -12.92pp |

## Key Findings

### 1. KNN filtering HURTS performance on 8/10 pairs
The Hybrid mode with TRUMP-optimized KNN config underperforms Pure SuperTrend on nearly every pair tested. Average degradation is -15.93 percentage points.

### 2. Only NEAR benefits significantly
NEARUSDT is the sole clear winner (+30.34pp improvement), going from near-breakeven +0.67% to a solid +31.01%. The KNN filter successfully avoided bad trades on this pair.

### 3. Worst damage on trending pairs
Pairs with strong Pure ST returns (BTC +26.5%, SUI +24.6%, WIF +35.8%) suffered the most from KNN filtering. The KNN classifier appears to reject valid trend-following entries, cutting profitable trades.

### 4. Win rates are universally low (25-34%)
All Hybrid results show sub-35% win rates. The KNN filter does not improve trade selection quality - it just reduces total trades while missing the big winners that Pure ST catches.

### 5. Meme coin RSI adjustment didn't help
WIF (RSI=28) went from +35.78% to -6.34%, BONK (RSI=28) from +15.26% to +5.79%. Strict RSI thresholds combined with KNN filtering over-constrain entries.

## Conclusion

**The Hybrid KNN + SuperTrend strategy with this TRUMP-optimized config is NOT suitable for broad multi-pair deployment.** The KNN classifier, trained on TRUMP-specific patterns, does not generalize well to other pairs.

### Recommendations

1. **Do NOT apply Hybrid to: BTC, SUI, WIF, ETH, SOL** - Pure ST is far superior
2. **NEAR is the only candidate** for Hybrid mode - needs further validation
3. **AVAX is marginal** (+0.81pp) - not enough improvement to justify complexity
4. **Per-pair KNN training** may be needed - a single KNN config cannot fit all pairs
5. **Consider higher knn_min_confidence** (e.g., 70-80) to reduce false rejections
6. **KNN lookback=50 may be too short** for majors - try 100-200 for BTC/ETH
