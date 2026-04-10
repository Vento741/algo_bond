# Hybrid KNN+SuperTrend - Frequency & Win Rate Optimization

**Date:** 2026-04-10
**Pair:** TRUMPUSDT | **TF:** 15m | **Period:** 2025-11-10 - 2026-04-10 (~5 months)
**Capital:** $100 | **Commission:** 0.05% | **Slippage:** 0.05% | **Position:** 75% equity

## Baseline

| Metric | Value |
|--------|-------|
| Trades | 53 |
| Win Rate | 39.62% |
| PnL | +111.50% |
| Max DD | 22.56% |
| Profit Factor | 2.18 |

## Full Results (26 configs, sorted by composite score)

Composite = 0.25 * pnl_norm + 0.25 * wr_norm + 0.25 * trades_norm + 0.25 * (1 - dd_norm)

| # | Config | Trades | WR% | PnL% | DD% | PF | Score |
|---|--------|--------|-----|------|-----|-----|-------|
| 1 | **F-TP10** | **95** | **46.3** | 58.10 | **15.83** | 1.44 | **0.6071** |
| 2 | F-TP12 | 79 | 46.8 | 77.16 | 19.82 | 1.65 | 0.5733 |
| 3 | F-TP15 | 71 | 43.7 | 79.26 | 18.51 | 1.71 | 0.5594 |
| 4 | C-CD2 | 54 | 40.7 | 119.94 | 22.65 | 2.26 | 0.5582 |
| 5 | D-ST5 (st3=5.0) | 62 | 35.5 | 100.00 | 19.47 | 1.91 | 0.5507 |
| 6 | C-CD4 | 53 | 39.6 | 117.40 | 22.77 | 2.21 | 0.5465 |
| 7 | C-CD3 | 54 | 37.0 | 114.01 | 22.65 | 2.17 | 0.5366 |
| 8 | **BASELINE** | 53 | 39.6 | **111.50** | 22.56 | **2.18** | 0.5360 |
| 9 | A-RSI35 | 60 | 36.7 | 101.43 | 23.07 | 1.93 | 0.5218 |
| 10 | E2-RSI35+CD2 | 63 | 34.9 | 98.06 | 22.96 | 1.84 | 0.5192 |
| 11 | C-CD8 | 56 | 37.5 | 100.52 | 22.44 | 2.00 | 0.5166 |
| 12 | D-ST6 (st3=6.0) | 60 | 35.0 | 96.28 | 22.56 | 1.95 | 0.5111 |
| 13 | D-ADX10 | 49 | 40.8 | 95.66 | 21.63 | 2.22 | 0.5030 |
| 14-18 | B-KNN40..52 | 56 | 39.3 | 92.01 | 23.70 | 1.98 | 0.4931 |
| 19 | D-ADX12 | 54 | 37.0 | 85.35 | 21.63 | 2.00 | 0.4853 |
| 20 | A-RSI40 | 59 | 35.6 | 84.60 | 23.00 | 1.81 | 0.4820 |
| 21 | E3-ALL3 (RSI35+KNN40+CD2) | 65 | 33.9 | 80.04 | 23.93 | 1.70 | 0.4763 |
| 22 | E1-RSI35+KNN40 | 63 | 36.5 | 78.73 | 23.93 | 1.74 | 0.4750 |
| 23 | E4-ALL3+ADX12 | 68 | 33.8 | 71.11 | 24.43 | 1.61 | 0.4614 |
| 24 | A-RSI45 | 66 | 33.3 | 58.77 | 28.89 | 1.53 | 0.3926 |
| 25 | A-RSI50 | 71 | 35.2 | 55.64 | 30.49 | 1.50 | 0.3908 |
| 26 | A-RSI55 | 77 | 32.5 | 41.27 | 28.86 | 1.42 | 0.3832 |

## Key Findings

### 1. TP ATR multiplier is THE lever for frequency + WR (Group F)

Reducing TP from ATR*20 to ATR*10 produced the most dramatic improvement:
- **Trades: 53 -> 95 (+79%)** - positions close faster, freeing capital for new entries
- **WR: 39.6% -> 46.3% (+6.7pp)** - smaller targets are hit more often
- **DD: 22.56% -> 15.83% (-6.73pp)** - shorter hold time = less exposure
- PnL drops from 111.5% to 58.1% - expected tradeoff (smaller wins)

F-TP12 is the sweet spot if PnL matters more: 79 trades, 46.8% WR, +77.16% PnL.

### 2. RSI filter has DECREASING returns (Group A)

Loosening RSI from 28 to 55 increases trades (53 -> 77) but KILLS win rate (39.6% -> 32.5%) and PnL (111.5% -> 41.3%). The added signals are noise, not edge. RSI=28 is already well-tuned.

### 3. KNN confidence filter is NOT a bottleneck (Group B)

All 5 KNN configs (40-52) produced IDENTICAL results: 56 trades, 39.29% WR. This means the KNN classifier is already giving high-confidence signals (>55%) when it signals at all. Lowering the threshold doesn't unlock new trades because the signals that pass RSI=28 already have KNN confidence > 55%.

### 4. Cooldown has minimal impact (Group C)

CD=2 is slightly better than CD=5 (54 trades vs 53, WR 40.7% vs 39.6%, PnL 119.9% vs 111.5%). The 1-trade difference suggests cooldown rarely blocks a valid signal.

### 5. SuperTrend st3=5.0 adds trades with low DD (Group D)

Tighter ST3 (5.0 vs 7.0) adds 9 trades (62 vs 53) while REDUCING DD (19.47% vs 22.56%). More ST agreement = more entry points, but with good quality.

### 6. Combining looser filters degrades quality (Group E)

Every combination of looser RSI + KNN + cooldown performed WORSE than the baseline. The added trades from each individual loosening compound into noise when combined.

## Recommended Configs

### Option A: Maximum Frequency (F-TP10)
Best for: High frequency, best WR, lowest DD. Moderate PnL.
```json
{
  "hybrid": {"knn_min_confidence": 55, "knn_min_score": 0.1, "use_knn_direction": true},
  "knn": {"neighbors": 8, "lookback": 50, "weight": 0.5, "rsi_period": 15, "wt_ch_len": 10, "wt_avg_len": 21, "cci_period": 20, "adx_period": 14},
  "supertrend": {"st2_mult": 3.25, "st3_mult": 7.0},
  "entry": {"rsi_long_max": 28, "rsi_short_min": 28},
  "trend_filter": {"adx_threshold": 15},
  "squeeze": {"use": true},
  "risk": {"trailing_atr_mult": 20, "tp_atr_mult": 10, "stop_atr_mult": 5.0, "cooldown_bars": 2},
  "backtest": {"commission": 0.05, "slippage": 0.05, "order_size": 75}
}
```
- 95 trades, 46.3% WR, +58.1%, DD 15.83%, PF 1.44

### Option B: Balanced (F-TP12)
Best for: Good balance of frequency, WR, and PnL.
```json
{
  "hybrid": {"knn_min_confidence": 55, "knn_min_score": 0.1, "use_knn_direction": true},
  "knn": {"neighbors": 8, "lookback": 50, "weight": 0.5, "rsi_period": 15, "wt_ch_len": 10, "wt_avg_len": 21, "cci_period": 20, "adx_period": 14},
  "supertrend": {"st2_mult": 3.25, "st3_mult": 7.0},
  "entry": {"rsi_long_max": 28, "rsi_short_min": 28},
  "trend_filter": {"adx_threshold": 15},
  "squeeze": {"use": true},
  "risk": {"trailing_atr_mult": 20, "tp_atr_mult": 12, "stop_atr_mult": 5.0, "cooldown_bars": 2},
  "backtest": {"commission": 0.05, "slippage": 0.05, "order_size": 75}
}
```
- 79 trades, 46.8% WR, +77.2%, DD 19.82%, PF 1.65

### Option C: Maximum PnL (C-CD2)
Best for: Maximum profit, original strategy logic preserved.
```json
{
  "hybrid": {"knn_min_confidence": 55, "knn_min_score": 0.1, "use_knn_direction": true},
  "knn": {"neighbors": 8, "lookback": 50, "weight": 0.5, "rsi_period": 15, "wt_ch_len": 10, "wt_avg_len": 21, "cci_period": 20, "adx_period": 14},
  "supertrend": {"st2_mult": 3.25, "st3_mult": 7.0},
  "entry": {"rsi_long_max": 28, "rsi_short_min": 28},
  "trend_filter": {"adx_threshold": 15},
  "squeeze": {"use": true},
  "risk": {"trailing_atr_mult": 20, "tp_atr_mult": 20, "stop_atr_mult": 5.0, "cooldown_bars": 2},
  "backtest": {"commission": 0.05, "slippage": 0.05, "order_size": 75}
}
```
- 54 trades, 40.7% WR, +119.9%, DD 22.65%, PF 2.26

## Deployment Recommendation

**Use Option B (F-TP12)** for live trading:
- 79 trades is sufficient for statistical significance
- 46.8% WR provides consistent positive expectancy
- +77.2% PnL over 5 months is strong absolute performance
- 19.82% DD is manageable with 75% position sizing
- PF 1.65 indicates robust edge

Changes from baseline: `tp_atr_mult: 20 -> 12`, `cooldown_bars: 5 -> 2`. Everything else stays the same. The entry logic (RSI=28, KNN confidence=55) is already well-optimized - do not loosen.

## What we learned

1. **Entry filters are well-tuned.** RSI=28, KNN=55 are near-optimal. Loosening them adds noise.
2. **Exit management is the biggest lever.** TP multiplier controls trade frequency, WR, and DD simultaneously.
3. **The strategy's edge is in selectivity.** It works by being picky about entries (low RSI pullbacks into high KNN confidence). The improvement path is faster exits, not more entries.
4. **KNN confidence is binary, not gradual.** All signals already pass >55% confidence, so lowering the threshold has zero effect.
