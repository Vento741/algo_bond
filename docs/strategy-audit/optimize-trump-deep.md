# Deep Optimization: SuperTrend Squeeze on TRUMPUSDT 15m

**Date:** 2026-04-10
**Period:** 2025-11-10 -- 2026-04-10
**Capital:** $100
**Baseline:** +35.82% (tp=20, sl=5.0, trail=20, rsi=45, st2=3.0, st3=7.0, adx=15, squeeze=true)

## Result: +54.42% (from +35.82% baseline = +51.8% relative improvement)

---

## TOP-10 Configs (sorted by PnL%)

| # | Name | PnL% | WR% | Trades | MaxDD% | Sharpe | PF | Key Change |
|---|------|------|-----|--------|--------|--------|----|------------|
| 1 | R4_rsi28_st2_3.25 | **54.42** | 47.37 | 38 | 9.19 | 2.23 | 2.52 | rsi=28, st2=3.25 |
| 2 | R4_rsi29_st2_3.25 | **54.42** | 47.37 | 38 | 9.19 | 2.23 | 2.52 | rsi=29, st2=3.25 |
| 3 | R4_rsi28_st2_3.5 | 54.17 | 45.95 | 37 | 9.19 | 2.22 | 2.52 | rsi=28, st2=3.5 |
| 4 | R4_rsi29_st2_3.5 | 54.17 | 45.95 | 37 | 9.19 | 2.22 | 2.52 | rsi=29, st2=3.5 |
| 5 | R4_rsi27_st2_3.5 | 54.17 | 45.95 | 37 | 9.19 | 2.22 | 2.52 | rsi=27, st2=3.5 |
| 6 | R4_rsi28_st2_3.75 | 53.89 | 45.95 | 37 | 9.19 | 2.21 | 2.50 | rsi=28, st2=3.75 |
| 7 | R4_rsi29_st2_3.75 | 53.89 | 45.95 | 37 | 9.19 | 2.21 | 2.50 | rsi=29, st2=3.75 |
| 8 | R3_rsi30_st2_3.5 | 53.14 | 45.95 | 37 | 9.19 | 2.19 | 2.49 | rsi=30, st2=3.5 |
| 9 | R4_rsi30_st2_3.25 | 53.39 | 47.37 | 38 | 9.19 | 2.20 | 2.49 | rsi=30, st2=3.25 |
| 10 | R4_rsi30_st2_3.75 | 52.97 | 45.95 | 37 | 9.19 | 2.18 | 2.48 | rsi=30, st2=3.75 |

---

## Best Config JSON

```json
{
  "risk": {
    "trailing_atr_mult": 20,
    "tp_atr_mult": 20,
    "stop_atr_mult": 5.0,
    "cooldown_bars": 5
  },
  "entry": {
    "rsi_long_max": 28,
    "rsi_short_min": 28
  },
  "supertrend": {
    "st2_mult": 3.25,
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

---

## Parameter Sensitivity Analysis

### RSI Filter (most impactful parameter)
| RSI | PnL% | WR% | Trades | Sharpe |
|-----|------|-----|--------|--------|
| 25 | 46.74 | 48.65 | 37 | 2.29 |
| 27 | 51.79 | 48.65 | 37 | 2.29 |
| 28 | **54.42** | 47.37 | 38 | 2.23 |
| 29 | **54.42** | 47.37 | 38 | 2.23 |
| 30 | 50.78 | 48.65 | 37 | 2.26 |
| 32 | 44.69 | 47.22 | 36 | 2.07 |
| 35 | 44.79 | 47.22 | 36 | 2.08 |
| 40 | 33.19 | 42.86 | 42 | 1.77 |
| 45 (baseline) | 35.82 | 38.30 | 47 | 1.61 |
| 50 | 30.10 | 36.96 | 46 | 1.40 |

**Finding:** RSI 28-29 is the sweet spot. Tighter RSI filter (lower value) dramatically improves quality by entering only at oversold/overbought extremes. Below 27 performance drops (too few entries, misses good trades).

### SuperTrend ST2 Multiplier
| ST2 | PnL% | WR% | Trades | Sharpe |
|-----|------|-----|--------|--------|
| 2.0 | 31.91 | 39.47 | 38 | 1.65 |
| 3.0 (baseline) | 35.82 | 38.30 | 47 | 1.61 |
| 3.25 | **54.42** | 47.37 | 38 | 2.23 |
| 3.5 | 53.14 | 45.95 | 37 | 2.19 |
| 3.75 | 52.97 | 45.95 | 37 | 2.18 |
| 4.0 | 42.13 | 40.43 | 47 | 1.87 |
| 4.5 | 33.84 | 36.00 | 50 | 1.53 |

*Note: ST2 values tested with rsi=30; champion values with rsi=28*

**Finding:** ST2=3.25 optimal. Slightly wider than default gives better trend confirmation without being too loose.

### Take Profit (TP ATR mult)
| TP | PnL% | WR% | Trades |
|----|------|-----|--------|
| 15 | 26.30 | 40.38 | 52 |
| 18 | 19.31 | 33.96 | 53 |
| 20 (baseline) | 35.82 | 38.30 | 47 |
| 22 | 33.16 | 36.59 | 41 |
| 25 | 20.73 | 35.90 | 39 |

**Finding:** TP=20 confirmed as optimal. Non-monotonic curve - both tighter and wider TP hurt.

### Stop Loss (SL ATR mult)
| SL | PnL% | WR% | Trades |
|----|------|-----|--------|
| 3.0 | 31.56 | 25.76 | 66 |
| 4.0 | 25.11 | 29.51 | 61 |
| 5.0 (baseline) | 35.82 | 38.30 | 47 |
| 6.0 | 31.93 | 42.11 | 38 |

**Finding:** SL=5.0 confirmed optimal. Tighter SL causes too many whipsaws, wider reduces too many trades.

### Trailing ATR
| Trail | PnL% | Trades |
|-------|------|--------|
| 15 | 25.45 | 49 |
| 20 (baseline) | 35.82 | 47 |
| 25 | 22.55 | 48 |
| 30 | FAIL | - |

**Finding:** Trail=20 confirmed optimal.

### Squeeze
| Config | PnL% | Trades | Sharpe |
|--------|------|--------|--------|
| squeeze=true (baseline) | 35.82 | 47 | 1.61 |
| squeeze=false | 10.20 | 44 | 0.71 |
| min_duration=5 | 35.82 | 47 | 1.61 |
| min_duration=10 | 35.82 | 47 | 1.61 |
| min_duration=15 | 35.82 | 47 | 1.61 |

**Finding:** Squeeze is essential (+25% absolute contribution). min_duration has no effect (default handling is already optimal).

### Cooldown
| CD | PnL% | Trades |
|----|------|--------|
| 3 | 26.21 | 48 |
| 5 (baseline) | 35.82 | 47 |
| 10 | 30.92 | 42 |
| 20 | 24.90 | 44 |

**Finding:** CD=5 confirmed optimal.

---

## Key Insights

1. **RSI is the single most impactful parameter** - moving from 45 to 28 added +18.6% absolute PnL. TRUMP's high volatility means entering only at RSI extremes filters out bad entries massively.

2. **ST2=3.25 provides marginal but real improvement** - slightly wider SuperTrend band on the medium timeframe improves trend detection by ~2-3%.

3. **Risk params (TP/SL/Trail) were already near-optimal** - the baseline risk settings are well-tuned. No risk param change exceeded the original +35.82%.

4. **Squeeze is non-negotiable** - removing it drops performance by 25% absolute (35.82% -> 10.20%).

5. **Top-10 plateau** - configs #1-#10 are all within 54.42%-52.97%, a very tight range. This suggests we're near the ceiling for this strategy on TRUMPUSDT 15m.

6. **Quality over quantity** - best config has 38 trades (vs 47 baseline) but much higher WR (47.37% vs 38.30%) and Sharpe (2.23 vs 1.61).

---

## Comparison with Baseline

| Metric | Baseline | Optimized | Delta |
|--------|----------|-----------|-------|
| PnL% | +35.82% | **+54.42%** | **+18.60%** |
| Win Rate | 38.30% | 47.37% | +9.07% |
| Trades | 47 | 38 | -9 |
| Max DD | 13.48% | 9.19% | -4.29% |
| Sharpe | 1.61 | 2.23 | +0.62 |
| Profit Factor | 1.83 | 2.52 | +0.69 |

**Every metric improved.** Higher returns, fewer trades, lower drawdown, higher Sharpe.

---

## Total configs tested: 59 across 4 rounds
- Round 1: 12 configs (risk params)
- Round 2: 15 configs (combos + RSI/ST2 fine-tune)
- Round 3: 14 configs (RSI 25-33 + combos)
- Round 4: 11 configs (final fine-tune RSI 27-30 x ST2 3.0-3.75)
- Failed: 2 (tr=30 timeout, rsi30_tp22 timeout)
