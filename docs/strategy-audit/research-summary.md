# Research Summary: Path to 500%+ Returns

## Three Research Streams Combined

### 1. Max Profit Techniques (research-profit)
- **Leverage 3-5x = instant 500%+** (median +365% at 3x, +1227% at 5x)
- Kelly Criterion: current 75% position size exceeds Full Kelly (28.3%). Live = 20-30%
- SuperTrend flip exit could +15-30% (remove TP cap, let winners run)
- Time-of-day filter: +5-10% (skip 02:00-07:00 UTC noise)
- Multi-pair portfolio: 4 pairs, inverse-vol weighting

### 2. Crypto-Specific Alpha (research-crypto)
- Mean Reversion overlay in ranging markets: +5-12% (highest impact, all indicators exist)
- Open Interest confirmation: +3-7% (Bybit API available)
- Funding rate filter: +2-5% (data already flowing in BybitClient)
- BTC correlation regime: +3-6% (position sizing by correlation)
- Liquidation cascades: +3-8% (needs WS infra)

### 3. Methodology Reality Check (research-methodology)
- **Realistic PnL after corrections: +12-20%** (not +54%)
- Slippage drag: -3 to -5%
- Walk-forward decay: 50-55%
- Data mining bias: -5 to -10%
- 38 trades = borderline statistical significance (p~0.03-0.06)
- Need slippage in backtest engine, walk-forward validation

## Action Plan (priority order)

| # | Action | Impact | Effort | Type |
|---|--------|--------|--------|------|
| 1 | Add slippage to backtest | Honest numbers | 1h | Methodology |
| 2 | SuperTrend flip exit | +15-30% base | Medium | Strategy |
| 3 | Time-of-day filter | +5-10% base | Easy | Strategy |
| 4 | Mean Reversion overlay | +5-12% base | Low | Strategy |
| 5 | Adaptive SL/TP (not just trailing) | +10-25% base | Easy | Strategy |
| 6 | Add leverage 3x to backtest | See real compound | Easy | Testing |
| 7 | Walk-forward validation | Trust numbers | 2-3 days | Methodology |
| 8 | Funding rate filter | +2-5% | Low | Strategy |
