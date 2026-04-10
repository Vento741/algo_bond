# Feature Impact Comparison - TRUMPUSDT 15m

**Date:** 2026-04-10
**Period:** 2025-11-10 to 2026-04-10 (~5 months)
**Capital:** $100, Order size: 75%
**Base params:** RSI 28/28, ST2 3.25, ST3 7.0, ADX 15, Squeeze ON, Trail ATR 20x, TP ATR 20x, SL ATR 5x, Cooldown 5

## Results

| # | Config | PnL% | DD% | Sharpe | WR% | PF | Trades | vs Baseline |
|---|--------|------|-----|--------|-----|-----|--------|-------------|
| 1 | BASELINE (no slip, no features) | +64.37 | 23.80 | 1.73 | 38.2 | 1.56 | 110 | -- |
| 2 | +Slippage 0.05% | +51.52 | 25.06 | 1.47 | 36.4 | 1.44 | 110 | -12.85 PnL% |
| 3 | +Slip +Time Filter (02-07 UTC) | +43.22 | 24.28 | 1.43 | 40.2 | 1.44 | 87 | -21.15 PnL% |
| 4 | +Slip +ST Flip Exit | -8.02 | 34.57 | -0.11 | 25.9 | 0.95 | 325 | -72.39 PnL% |
| 5 | ALL features | -2.94 | 26.59 | 0.02 | 28.3 | 0.98 | 279 | -67.31 PnL% |
| 6 | ALL + 3x Leverage | -24.50 | 65.08 | 0.02 | 28.3 | 0.94 | 279 | -88.87 PnL% |
| 7 | ALL + 5x Leverage | -53.48 | 85.78 | 0.02 | 28.3 | 0.92 | 279 | -117.85 PnL% |
| 8 | ALL + Slip 0.1% (worst case) | -21.23 | 37.92 | -0.77 | 23.3 | 0.85 | 279 | -85.60 PnL% |

## Feature Delta Analysis

| Feature | PnL% Delta | DD% Delta | Sharpe Delta | Trade Count Delta | Assessment |
|---------|-----------|-----------|--------------|-------------------|------------|
| Slippage 0.05% (vs #1) | -12.85 | +1.26 | -0.26 | 0 | Moderate cost, realistic |
| Time Filter (vs #2) | -8.30 | -0.78 | -0.04 | -23 | Filters 21% trades, improves WR |
| ST Flip Exit (vs #2) | -59.54 | +9.51 | -1.58 | +215 | DESTRUCTIVE - causes overtrading |
| Slip 0.1% vs 0.05% (vs #5) | -18.29 | +11.33 | -0.79 | 0 | Heavy penalty on meme coins |

## Key Findings

1. **Slippage 0.05%** is realistic and reduces PnL by ~13 points. This is expected and healthy - the strategy remains profitable at +51.5%.

2. **Time Filter (02:00-07:00 UTC block)** removes 23 trades (~21%), slightly improves win rate (36.4% -> 40.2%) but reduces total PnL. The improvement in WR suggests low-liquidity hours do produce worse signals. Net effect is moderate negative due to missed good trades.

3. **SuperTrend Flip Exit is DESTRUCTIVE.** It triples the trade count (110 -> 325) because ST flips force premature exits, which then re-trigger new entries. The strategy goes from +51.5% to -8.0%. This feature should NOT be used with the current ATR-based trailing stop - they conflict (trailing stop needs room to work, ST flip cuts too early).

4. **ALL features combined** slightly improves over ST-flip-only (from -8.0% to -2.9%) because time filter reduces some of the damage.

5. **Leverage amplifies losses** when base strategy is unprofitable (ALL features). 3x -> -24.5%, 5x -> -53.5%.

6. **Slippage 0.1%** (meme coin worst case) adds significant drag: -21.2% vs -2.9% for 0.05%.

## Recommendations

- Use **slippage 0.05%** for all backtests (realistic)
- **DO NOT enable SuperTrend Flip Exit** with current trailing stop config (ATR x20)
- Time filter is marginal - test per-pair before enabling
- For production with slippage: baseline config achieves +51.5% over 5 months on TRUMPUSDT 15m
- Avoid leverage > 1x until strategy is re-optimized with slippage included
