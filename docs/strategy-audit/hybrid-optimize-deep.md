# Deep Optimization: Hybrid KNN + SuperTrend on TRUMPUSDT 15m

**Date:** 2026-04-10
**Pair:** TRUMPUSDT | **TF:** 15m | **Period:** 2025-11-10 - 2026-04-10 | **Capital:** $100

## Baseline (current best)

| PnL | Trades | WR | PF | MaxDD | Sharpe |
|-----|--------|----|----|-------|--------|
| **+111.50%** | 53 | 0.4% | 2.18 | 22.6% | 2.28 |

```json
{
  "hybrid": {"knn_min_confidence": 55, "knn_min_score": 0.1, "use_knn_direction": true},
  "knn": {"neighbors": 8, "lookback": 50, "weight": 0.5},
  "supertrend": {"st2_mult": 3.25, "st3_mult": 7.0},
  "entry": {"rsi_long_max": 28, "rsi_short_min": 28},
  "trend_filter": {"adx_threshold": 15},
  "squeeze": {"use": true},
  "risk": {"trailing_atr_mult": 20, "tp_atr_mult": 20, "stop_atr_mult": 5.0, "cooldown_bars": 5},
  "backtest": {"commission": 0.05, "slippage": 0.05, "order_size": 75}
}
```

---

## Group A: KNN Confidence Threshold (6 configs)

Vary `knn_min_confidence`, all else = baseline.

| # | confidence | PnL | Trades | WR | PF | MaxDD | Sharpe | vs baseline |
|---|-----------|-----|--------|----|----|-------|--------|-------------|
| A1 | 50 | +92.01% | 56 | 0.4% | 1.98 | 23.7% | 2.05 | -19.49pp |
| A2 | 52 | +92.01% | 56 | 0.4% | 1.98 | 23.7% | 2.05 | -19.49pp |
| **A0** | **55** | **+111.50%** | **53** | **0.4%** | **2.18** | **22.6%** | **2.28** | **baseline** |
| A4 | 58 | +108.51% | 41 | 0.4% | 2.31 | 20.6% | 2.25 | -2.99pp |
| A5 | 60 | +84.09% | 39 | 0.4% | 2.13 | 20.9% | 1.93 | -27.41pp |
| A6 | 65 | +58.42% | 32 | 0.4% | 2.11 | 18.5% | 1.82 | -53.08pp |

**Findings:**
- Confidence 55 is the sweet spot for PnL
- Lower values (50-52) let through more bad trades, same result (56 trades, lower PF)
- Higher values (58+) filter too aggressively, cutting winners
- Conf 58 is notable: fewer trades (41) but higher PF (2.31) and lower DD (20.6%) - better risk-adjusted

---

## Group B: KNN Score Threshold (4 configs)

Vary `knn_min_score`, confidence=55.

| # | score | PnL | Trades | WR | PF | MaxDD | Sharpe | vs baseline |
|---|-------|-----|--------|----|----|-------|--------|-------------|
| B1 | 0.05 | +110.03% | 55 | 0.4% | 2.10 | 20.1% | 2.27 | -1.47pp |
| **A0** | **0.10** | **+111.50%** | **53** | **0.4%** | **2.18** | **22.6%** | **2.28** | **baseline** |
| B2 | 0.15 | +104.55% | 57 | 0.4% | 1.97 | 20.1% | 2.10 | -6.95pp |
| B3 | 0.20 | +83.09% | 39 | 0.4% | 2.11 | 21.7% | 1.93 | -28.41pp |
| B4 | 0.30 | +55.23% | 33 | 0.4% | 2.02 | 16.1% | 1.61 | -56.27pp |

**Findings:**
- Score 0.1 is optimal for PnL
- Score 0.05 is almost identical but slightly worse (-1.47pp) with 2 more trades
- Higher score thresholds filter too heavily, removing good signals
- Score 0.30 has best DD (16.1%) but poor absolute return

---

## Group C: KNN Internal Parameters (5 configs)

Vary `neighbors` and `lookback`.

| # | neighbors | lookback | PnL | Trades | WR | PF | MaxDD | Sharpe | vs baseline |
|---|-----------|----------|-----|--------|----|----|-------|--------|-------------|
| C1 | 5 | 50 | +111.50% | 53 | 0.4% | 2.18 | 22.6% | 2.28 | 0.00pp |
| C2 | 6 | 50 | +111.50% | 53 | 0.4% | 2.18 | 22.6% | 2.28 | 0.00pp |
| **A0** | **8** | **50** | **+111.50%** | **53** | **0.4%** | **2.18** | **22.6%** | **2.28** | **baseline** |
| C3 | 10 | 50 | +111.50% | 53 | 0.4% | 2.18 | 22.6% | 2.28 | 0.00pp |
| C4 | 8 | 30 | +72.58% | 58 | 0.4% | 1.81 | 19.9% | 1.93 | -38.92pp |
| C5 | 8 | 70 | +41.98% | 52 | 0.4% | 1.51 | 25.8% | 1.30 | -69.52pp |

**Findings:**
- **neighbors (5-10) has ZERO effect** on results - KNN confidence at threshold 55 is binary for this data
- lookback=50 is strongly optimal; 30 too noisy, 70 too lagged
- lookback sensitivity is high: 30 loses 39pp, 70 loses 70pp

---

## Group D: Risk Parameters with KNN Filter (5 configs)

Vary `tp_atr_mult` and `stop_atr_mult`.

| # | TP mult | SL mult | PnL | Trades | WR | PF | MaxDD | Sharpe | vs baseline |
|---|---------|---------|-----|--------|----|----|-------|--------|-------------|
| D1 | 15 | 5.0 | +87.92% | 63 | 0.4% | 1.86 | 18.4% | 2.20 | -23.58pp |
| **A0** | **20** | **5.0** | **+111.50%** | **53** | **0.4%** | **2.18** | **22.6%** | **2.28** | **baseline** |
| D2 | 25 | 5.0 | +77.34% | 53 | 0.3% | 1.86 | 22.6% | 1.75 | -34.16pp |
| D3 | 30 | 5.0 | +90.31% | 51 | 0.3% | 2.01 | 22.6% | 1.80 | -21.19pp |
| D4 | 20 | 3.0 | +87.61% | 68 | 0.3% | 1.97 | 28.0% | 2.00 | -23.89pp |
| D5 | 20 | 4.0 | +103.58% | 59 | 0.4% | 2.12 | 23.9% | 2.17 | -7.92pp |

**Findings:**
- TP=20 is optimal; tighter (15) exits winners too early, wider (25-30) lets reversals eat gains
- SL=5.0 is optimal; tighter SLs (3.0, 4.0) get stopped out more often on noise
- SL=4.0 is close (-7.92pp) with 6 more trades but lower PF

---

## Summary

**No config in this 20-test matrix beat the baseline (+111.50%).**

The current configuration is locally optimal across all tested dimensions:
- **KNN confidence:** 55 (sweet spot between filtering noise and keeping winners)
- **KNN score:** 0.1 (minimal but effective directional filter)
- **KNN neighbors:** 5-10 all identical (insensitive parameter)
- **KNN lookback:** 50 (highly sensitive, 30/70 both significantly worse)
- **TP multiplier:** 20 (balances capture vs reversal risk)
- **SL multiplier:** 5.0 (gives enough room to avoid noise stops)

### Risk-adjusted alternatives

If lower drawdown is preferred over raw PnL:
- **Conf 58:** +108.51%, DD=20.6%, PF=2.31 (best PF in the set)
- **Score 0.05:** +110.03%, DD=20.1%, PF=2.10 (lowest DD among high-PnL configs)

### Next optimization vectors (not tested here)
- SuperTrend multipliers (st2_mult, st3_mult)
- RSI entry thresholds (rsi_long_max, rsi_short_min)
- ADX threshold
- Trailing ATR multiplier
- Cooldown bars
- Order size / position sizing
