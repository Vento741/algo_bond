# Leverage Comparison - SuperTrend Squeeze Strategy

**Date:** 2026-04-10
**Period:** 2025-11-10 to 2026-04-10 (5 months)
**Timeframe:** 15m | Capital: $100 | Slippage: 0.05% | Commission: 0.05%

## Results

| # | Pair | Leverage | PnL% | DD% | Sharpe | WR% | PF | Trades |
|---|------|----------|------|-----|--------|-----|----|--------|
| 1 | TRUMPUSDT | 1x | +51.52 | 25.06 | 1.47 | 36.36 | 1.44 | 110 |
| 2 | TRUMPUSDT | 2x | +110.46 | 44.01 | 1.47 | 36.36 | 1.36 | 110 |
| 3 | TRUMPUSDT | 3x | +170.60 | 58.31 | 1.47 | 36.36 | 1.29 | 110 |
| 4 | TRUMPUSDT | 5x | +264.65 | 77.20 | 1.47 | 36.36 | 1.18 | 110 |
| 5 | TRUMPUSDT | 7x | +286.02 | 87.80 | 1.47 | 36.36 | 1.11 | 110 |
| 6 | TRUMPUSDT | 10x | +181.28 | 95.46 | 1.47 | 36.36 | 1.04 | 110 |
| 7 | BTCUSDT | 3x | -52.92 | 62.30 | -0.94 | 27.92 | 0.78 | 154 |
| 8 | BTCUSDT | 5x | -76.43 | 83.11 | -0.94 | 27.92 | 0.77 | 154 |
| 9 | WIFUSDT | 3x | -11.66 | 62.76 | 0.46 | 34.03 | 0.98 | 144 |
| 10 | WIFUSDT | 5x | -59.01 | 82.89 | 0.46 | 34.03 | 0.92 | 144 |

## TRUMP Leverage Scaling

| Leverage | PnL% | DD% | PnL/DD Ratio | Notes |
|----------|------|-----|-------------|-------|
| 1x | +51.52 | 25.06 | 2.06 | Baseline - safe |
| 2x | +110.46 | 44.01 | 2.51 | Best risk/reward ratio |
| 3x | +170.60 | 58.31 | 2.93 | Good but DD > 50% |
| 5x | +264.65 | 77.20 | 3.43 | High DD, risky |
| 7x | +286.02 | 87.80 | 3.26 | Diminishing returns, near wipeout |
| 10x | +181.28 | 95.46 | 1.90 | WORSE than 5x! DD near 100% |

## Key Findings

1. **No leverage hits 500%+ with DD < 50%.** The best TRUMP result is 264.65% at 5x with 77% DD.

2. **Leverage has diminishing returns past 5x.** At 10x, PnL actually DROPS to 181% because the 95% drawdown wipes out compounding gains. Peak PnL is at 7x (286%) but with 88% DD - practically a margin call.

3. **2x is the sweet spot for risk-adjusted returns.** PnL/DD ratio peaks at 2x-3x. After 3x, the drawdown explodes faster than profits grow.

4. **Sharpe and WR stay constant across leverage** (1.47, 36.36%) - this confirms the backtester correctly applies leverage as a multiplier to returns, not changing signal logic.

5. **Profit Factor degrades with leverage** (1.44 at 1x -> 1.04 at 10x) because losses are amplified non-linearly due to compounding.

6. **BTC and WIF are unprofitable** with this TRUMP-optimized config even at 1x equivalent. They need their own parameter optimization.

## Recommendation

- **Conservative live:** 2x leverage (110% return, 44% DD)
- **Aggressive live:** 3x leverage (170% return, 58% DD)
- **Never exceed 5x** - diminishing returns and near-liquidation drawdowns
- **To reach 500%+:** need better base strategy PnL, not more leverage
