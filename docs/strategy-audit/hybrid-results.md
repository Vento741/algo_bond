# Hybrid KNN + SuperTrend - Backtest Results

**Date:** 2026-04-10
**Pair:** TRUMPUSDT 15m
**Period:** 2025-11-10 to 2026-04-10
**Initial Capital:** $100

## Baseline

| Strategy | Return % | Trades | Win Rate | Max DD % | Sharpe | PF |
|----------|----------|--------|----------|----------|--------|------|
| Pure SuperTrend (best config) | +51.52% | ~80 | ~38% | ~25% | ~1.5 | ~1.4 |

## Hybrid KNN + SuperTrend Results

| # | Config | Return % | Trades | Win Rate | Max DD % | Sharpe | PF |
|---|--------|----------|--------|----------|----------|--------|------|
| 1 | Loose (conf>=50, score>=0.05, dir=on) | +72.86% | 71 | 40% | 22.60% | 1.68 | 1.60 |
| 2 | **Medium (conf>=55, score>=0.1, dir=on)** | **+111.50%** | **53** | **40%** | **22.56%** | **2.28** | **2.18** |
| 3 | Strict (conf>=65, score>=0.2, dir=on) | +58.42% | 32 | 40% | 18.54% | 1.82 | 2.11 |
| 4 | Very strict (conf>=75, score>=0.3, dir=on) | +79.65% | 13 | 50% | 21.78% | 2.04 | 3.73 |
| 5 | Direction only (conf>=40, score>=0, dir=on) | +94.74% | 70 | 40% | 22.82% | 2.03 | 1.74 |
| 6 | Confidence only (conf>=60, score>=0.1, dir=off) | +15.73% | 74 | 30% | 31.49% | 0.61 | 1.17 |
| 7 | Boost high conf (boost>=70, mult=1.5) | +111.50% | 53 | 40% | 22.56% | 2.28 | 2.18 |
| 8 | Medium + ribbon + order_flow | +111.50% | 53 | 40% | 22.56% | 2.28 | 2.18 |
| 9 | Medium + ribbon + order_flow + SMC | +111.50% | 53 | 40% | 22.56% | 2.28 | 2.18 |
| 10 | **Medium + 3x leverage** | **+580.09%** | **53** | **40%** | **53.87%** | **2.28** | **1.75** |

## Analysis

### Best config: #2 Medium Filter (1x leverage)
- **+111.50% vs +51.52% pure SuperTrend = +2.16x improvement**
- KNN filter reduces trades from ~80 to 53 (-34% noise)
- Win rate improved from ~38% to 40%
- Max drawdown reduced from ~25% to 22.56%
- Sharpe improved from ~1.5 to 2.28 (+52%)
- Profit factor improved from ~1.4 to 2.18 (+56%)

### Key findings

1. **Direction filter is critical.** Config #6 (no direction check) collapsed to +15.73% - KNN direction alignment is the primary value-add.

2. **Medium filter is the sweet spot.** Too loose (#1: 71 trades, +72.86%) lets noise through. Too strict (#3-4) cuts profitable trades. Medium (#2: 53 trades, +111.50%) maximizes signal quality.

3. **Confluence modules (ribbon, order_flow, SMC) had zero incremental effect** - configs #7-9 produced identical results to #2. The hybrid engine likely ignores these params or they don't change the KNN confidence enough to flip any trade decisions.

4. **Very strict filter (#4) has best profit factor (3.73)** with only 13 trades and 50% win rate - excellent per-trade quality but low frequency.

5. **3x leverage (#10) amplifies returns to +580%** but max drawdown explodes to 53.87% - high risk, not recommended for live.

### Recommended production config

```json
{
  "supertrend": {"st2_mult": 3.25, "st3_mult": 7.0},
  "entry": {"rsi_long_max": 28, "rsi_short_min": 28},
  "trend_filter": {"adx_threshold": 15},
  "squeeze": {"use": true},
  "risk": {"trailing_atr_mult": 20, "tp_atr_mult": 20, "stop_atr_mult": 5.0, "cooldown_bars": 5},
  "knn": {"neighbors": 8, "lookback": 50, "weight": 0.5, "rsi_period": 15, "wt_ch_len": 10, "wt_avg_len": 21, "cci_period": 20, "adx_period": 14},
  "hybrid": {"knn_min_confidence": 55, "knn_min_score": 0.1, "use_knn_direction": true}
}
```
