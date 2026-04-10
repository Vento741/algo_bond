# SuperTrend Squeeze V2 - Fine-Tuning Results

**Date:** 2026-04-10
**Pair:** BTCUSDT 15m
**Period:** 2025-11-10 to 2026-04-10
**Capital:** $100
**Baseline (V2_04):** +22.16%, DD 5.15%, Sharpe 1.71

---

## Results (sorted by PnL%)

| Rank | Config | PnL% | DD% | Sharpe | Trades | WR% | PF | Change vs V2_04 |
|------|--------|------|-----|--------|--------|-----|------|-----------------|
| 1 | **A4_TP25** | **+26.51** | **4.77** | **1.96** | 46 | 47.83 | 2.40 | **+4.35** |
| 2 | A3_TP22 | +23.88 | 6.67 | 1.85 | 50 | 46.00 | 2.16 | +1.72 |
| 3 | B1_AdaptTrail_8_20 | +22.16 | 5.15 | 1.71 | 55 | 43.64 | 1.87 | 0.00 |
| 3 | B2_AdaptTrail_10_25 | +22.16 | 5.15 | 1.71 | 55 | 43.64 | 1.87 | 0.00 |
| 3 | B3_AdaptTrail_12_30 | +22.16 | 5.15 | 1.71 | 55 | 43.64 | 1.87 | 0.00 |
| 3 | B4_AdaptTrail_15_35 | +22.16 | 5.15 | 1.71 | 55 | 43.64 | 1.87 | 0.00 |
| 3 | C1_Regime_ADX20_Vol1.5 | +22.16 | 5.15 | 1.71 | 55 | 43.64 | 1.87 | 0.00 |
| 3 | C2_Regime_ADX15_Vol2 | +22.16 | 5.15 | 1.71 | 55 | 43.64 | 1.87 | 0.00 |
| 3 | C3_SqDur5_Wt1.5 | +22.16 | 5.15 | 1.71 | 55 | 43.64 | 1.87 | 0.00 |
| 3 | C4_SqDur10_Wt2 | +22.16 | 5.15 | 1.71 | 55 | 43.64 | 1.87 | 0.00 |
| 3 | C5_SqDur15_Wt2.5 | +22.16 | 5.15 | 1.71 | 55 | 43.64 | 1.87 | 0.00 |
| 12 | D5_CD10 | +21.27 | 5.12 | 1.66 | 56 | 42.86 | 1.83 | -0.89 |
| 13 | D3_ADX10 | +18.63 | 8.83 | 1.40 | 62 | 38.71 | 1.61 | -3.53 |
| 14 | A2_TP18 | +17.70 | 5.33 | 1.38 | 65 | 40.00 | 1.54 | -4.46 |
| 15 | A5_TP30 | +16.56 | 10.56 | 1.54 | 44 | 45.45 | 1.95 | -5.60 |
| 16 | A1_TP15 | +16.33 | 6.60 | 1.28 | 71 | 42.25 | 1.44 | -5.83 |
| 17 | D1_RSI50_50 | +15.70 | 10.23 | 1.22 | 59 | 35.59 | 1.52 | -6.46 |
| 18 | D4_ADX20 | +13.56 | 7.66 | 1.11 | 58 | 39.66 | 1.46 | -8.60 |
| 19 | B5_Trail25 | +12.99 | 6.15 | 1.11 | 55 | 38.18 | 1.50 | -9.17 |
| 20 | D2_RSI55_45 | +5.09 | 14.97 | 0.46 | 64 | 29.69 | 1.15 | -17.07 |

---

## New Best Config: A4_TP25 (+26.51%)

```json
{
  "risk": {
    "trailing_atr_mult": 20,
    "tp_atr_mult": 25,
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

### Improvement vs V2_04
| Metric | V2_04 | A4_TP25 | Delta |
|--------|-------|---------|-------|
| PnL% | +22.16 | +26.51 | **+4.35** |
| Max DD% | 5.15 | 4.77 | **-0.38** (better) |
| Sharpe | 1.71 | 1.96 | **+0.25** |
| Trades | 55 | 46 | -9 (fewer, higher quality) |
| Win Rate | 43.64% | 47.83% | **+4.19%** |
| Profit Factor | 1.87 | 2.40 | **+0.53** |

---

## Parameter Sensitivity Analysis

### TP ATR Multiplier (most impactful)
The TP distance is the most sensitive parameter. Clear optimum at 25x ATR.

| tp_atr_mult | PnL% | Trades | Insight |
|-------------|-------|--------|---------|
| 15 | 16.33 | 71 | Too tight - exits winners early, high trade count |
| 18 | 17.70 | 65 | Still too tight |
| 20 (base) | 22.16 | 55 | Good, but leaves money on table |
| 22 | 23.88 | 50 | Better - lets winners run |
| **25** | **26.51** | **46** | **Optimal - best PnL, lowest DD** |
| 30 | 16.56 | 44 | Too wide - DD spikes to 10.56% |

The pattern: wider TP reduces trade count (fewer exits hit TP, more trail out). Sweet spot at 25 where winners capture max move before reversals hit the trailing stop.

### Trailing ATR Multiplier
| trailing_atr_mult | PnL% | Insight |
|-------------------|-------|---------|
| 20 (base) | 22.16 | Balanced |
| 25 | 12.99 | Too wide - gives back too much profit |

Trailing stop at 20x ATR is near-optimal. Wider trailing gives back too much unrealized profit.

### RSI Entry Filters (tight is better)
| RSI Long Max / Short Min | PnL% | Trades | Insight |
|--------------------------|-------|--------|---------|
| 45/45 (base) | 22.16 | 55 | Strict - only enter when not overbought/oversold |
| 50/50 | 15.70 | 59 | Looser allows worse entries |
| 55/45 (asymmetric) | 5.09 | 64 | Worst - allows longs when nearly overbought |

Tight RSI filter at 45 is critical. Loosening it degrades quality significantly.

### ADX Threshold
| adx_threshold | PnL% | Trades | Insight |
|---------------|-------|--------|---------|
| 10 | 18.63 | 62 | Too loose - trades in weak trends, adds noise |
| 15 (base) | 22.16 | 55 | Balanced |
| 20 | 13.56 | 58 | Too strict - misses good trades but still takes bad ones |

ADX 15 is the sweet spot for filtering out ranging markets.

### Cooldown Bars
| cooldown_bars | PnL% | Insight |
|---------------|-------|---------|
| 5 (base) | 22.16 | Quick re-entry |
| 10 | 21.27 | Slightly worse - misses some re-entries |

Cooldown 5 is slightly better; 10 doesn't add enough value.

### Unimplemented Features (no effect on results)
The following config parameters had ZERO effect (identical results to baseline):
- `adaptive_trailing` (trail_low/trail_high) - NOT implemented in engine
- `regime.use` (adx_ranging, vol_scale) - NOT implemented in engine
- `squeeze.min_duration` - NOT implemented in engine
- `squeeze.max_weight` - NOT implemented in engine

**Action item:** These v2 features need to be implemented in the backtest engine before they can be tuned. Currently the engine ignores these config keys.

---

## Recommendations

1. **Adopt A4_TP25 as new baseline** - strictly better on all metrics
2. **Implement unimplemented v2 features** (adaptive trailing, regime detection, squeeze duration weighting) in the engine code
3. **Next round of fine-tuning** after v2 features are implemented:
   - Test TP range [23, 24, 25, 26, 27] for precise optimum
   - Test SL range [4.0, 4.5, 5.0, 5.5, 6.0]
   - Combine A4_TP25 with implemented adaptive trailing
4. **Do not loosen RSI or ADX filters** - current tight filters are essential
