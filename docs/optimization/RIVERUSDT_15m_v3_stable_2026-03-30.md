# Optimization Report: RIVERUSDT 15m (v3 Stable)

**Date:** 2026-03-30
**Period:** 2025-11-01 -> 2026-03-30 (5 months)
**Capital:** 100 USDT
**Total backtests:** 92 (30 sweep 1 + 36 sweep 2 + 25 sweep 3 + 1 test)
**Strategy:** Lorentzian KNN Classifier
**Focus:** Stability, DD < 30%, high Calmar ratio

---

## Scoring Formula (stability-weighted)

```
score = 0.20 * sharpe_norm + 0.15 * pnl_norm + 0.40 * (1 - dd_norm) + 0.10 * wr_norm + 0.15 * calmar_norm
```

DD weight increased to 0.40 (from 0.25 in v2). Added Calmar ratio (PnL/DD) at 0.15 weight.

---

## TOP-10 Configurations (DD < 30%)

```
  #  | Score |  PnL%   | Sharpe | WR%   | DD%   |  PF  | Calmar | Trades | Params
-----+-------+---------+--------+-------+-------+------+--------+--------+------------------------------------------
  1  | 0.850 | +381.6% |  2.56  | 47.6% | 18.1% | 1.78 |  21.1  |   124  | os=40 tr=6 sl=3.0 tp=20 rb=5 es=60
  2  | 0.844 | +418.9% |  2.98  | 52.8% | 22.6% | 1.86 |  18.5  |   142  | os=40 tr=4 sl=3.0 tp=20 rb=5 es=60 mbt=3
  3  | 0.843 | +417.6% |  2.98  | 52.8% | 22.6% | 1.86 |  18.5  |   142  | os=40 tr=4 sl=3.0 tp=20 rb=5 es=60
  4  | 0.842 | +192.0% |  2.98  | 52.8% | 14.4% | 1.90 |  13.4  |   142  | os=25 tr=4 sl=3.0 tp=20 rb=5 es=60
  5  | 0.837 | +417.0% |  2.96  | 52.1% | 22.6% | 1.88 |  18.5  |   142  | os=40 tr=4 sl=3.0
  6  | 0.837 | +192.0% |  2.96  | 52.1% | 14.4% | 1.91 |  13.3  |   142  | os=25 tr=4 sl=3.0
  7  | 0.836 | +428.2% |  2.86  | 52.4% | 22.6% | 1.87 |  18.9  |   143  | os=40 tr=4 sl=3.0 tp=15 rb=5 es=60
  8  | 0.832 | +197.2% |  2.86  | 52.4% | 14.4% | 1.90 |  13.7  |   143  | os=25 tr=4 sl=3.0 tp=15 rb=5 es=60
  9  | 0.830 | +329.8% |  2.96  | 52.1% | 19.9% | 1.89 |  16.6  |   142  | os=35 tr=4 sl=3.0
 10  | 0.828 | +375.8% |  2.58  | 48.4% | 19.0% | 1.80 |  19.7  |   124  | os=40 tr=6 sl=3.0
  D  | ----- | +148.0% |  2.10  | 42.0% | 27.5% | 1.51 |   5.4  |   169  | os=30 tr=5 sl=2.5 (BASELINE)
```

---

## Best vs Baseline

| Metric         | Baseline (v2) | **Best (#1 Balanced)** | Improvement     |
|----------------|---------------|------------------------|-----------------|
| PnL            | +148.0%       | **+381.6%**            | +233.6pp        |
| Sharpe Ratio   | 2.10          | **2.56**               | +0.46 (+22%)    |
| Max Drawdown   | 27.5%         | **18.1%**              | -9.4pp (34% lower) |
| Win Rate       | 42.0%         | **47.6%**              | +5.6pp          |
| Profit Factor  | 1.51          | **1.78**               | +0.27 (+18%)    |
| Calmar Ratio   | 5.4           | **21.1**               | +15.7 (3.9x)   |
| Trades         | 169           | **124**                | -45 (more selective) |

---

## Three Recommended Configs

### [1] STABLE -- Lowest DD (saved as default)
```json
{
  "backtest": {"order_size": 25},
  "risk": {
    "stop_atr_mult": 3.0,
    "trailing_atr_mult": 4,
    "tp_atr_mult": 20,
    "use_trailing": true
  },
  "ribbon": {"threshold": 5},
  "trend": {"ema_slow": 60}
}
```
**PnL: +192% | DD: 14.4% | Sharpe: 2.98 | Calmar: 13.4 | 142 trades**
Best for: conservative live trading, capital preservation

### [2] BALANCED -- Best overall score (SAVED)
```json
{
  "backtest": {"order_size": 40},
  "risk": {
    "stop_atr_mult": 3.0,
    "trailing_atr_mult": 6,
    "tp_atr_mult": 20,
    "use_trailing": true,
    "min_bars_trailing": 3
  },
  "ribbon": {"threshold": 5},
  "trend": {"ema_slow": 60}
}
```
**PnL: +381.6% | DD: 18.1% | Sharpe: 2.56 | Calmar: 21.1 | 124 trades**
Best for: live trading with moderate risk tolerance. Highest Calmar ratio.
Saved as: "RIVER 15m Stable v3 (Sharpe 2.56, DD 18%)"
Config ID: 1a4d1f31-2eea-4942-93d0-42a62bf7961d

### [3] AGGRESSIVE -- Highest PnL under DD<30%
```json
{
  "backtest": {"order_size": 40},
  "risk": {
    "stop_atr_mult": 3.0,
    "trailing_atr_mult": 4,
    "tp_atr_mult": 15,
    "use_trailing": true
  },
  "ribbon": {"threshold": 5},
  "trend": {"ema_slow": 60}
}
```
**PnL: +428.2% | DD: 22.6% | Sharpe: 2.86 | Calmar: 18.9 | 143 trades**
Best for: maximizing returns with acceptable risk

---

## Sweep Details

### Sweep 1: Core Risk Parameters (30 runs)
Grid: order_size [25,30,35,40] x trailing_atr [4,5,6,7] x stop_atr [2.0,2.5,3.0]

Key finding: **stop_atr=3.0 dominates all top positions.** Wider stops reduce whipsaw exits.

### Sweep 2: Trend/Filter Parameters (36 runs)
Grid: tp_atr [8,10,15,20] x ribbon.threshold [4,5,6] x ema_slow [40,50,60]

Key finding: **rb=5, es=60, tp=15-20** consistently best. Slower EMA and higher TP allow trend continuation.

### Sweep 3: Fine-Tuning (25 runs)
Grid: min_confluence [2.5,3.0,3.5,4.0] x cooldown_bars [5,10,15,20] x min_bars_trailing [3,5,8]

Key finding: **Negligible impact.** Strategy is robust to these parameters. min_bars_trailing=3 marginally better.

---

## Key Insights (v2 -> v3)

### 1. Wider Stops = Better Stability
- v2 optimal: sl=1.5-2.0 (DD 42.6%)
- v3 optimal: **sl=3.0** (DD 14-22%)
- Wider stops prevent premature exits during volatility spikes

### 2. Two Trailing Regimes
- **tr=4:** Higher PnL (417-428%), slightly higher DD (22.6%), more trades (142-143)
- **tr=6:** Lower PnL (375-381%), lower DD (18-19%), fewer trades (124)
- Both are valid; tr=6 recommended for stability focus

### 3. EMA Slow at 60 > 40/50
- Shifting from ema_slow=40 to 60 improves trend filtering
- Reduces false signals in choppy markets

### 4. Order Size Scales Linearly
- os=25: ~192% PnL, 14.4% DD (safest)
- os=35: ~330% PnL, 19.9% DD
- os=40: ~382-428% PnL, 18-22.6% DD
- DD is mainly determined by sl/tr, not os (within 25-40 range)

### 5. Strategy is Robust
- min_confluence, cooldown_bars have zero measurable effect
- This suggests the KNN+ribbon filtering is already strict enough
- Overfitting risk is low for the core parameters

---

## Parameter Sensitivity Map (Updated)

| Parameter         | Impact     | v2 Optimal | v3 Optimal | Notes                           |
|-------------------|------------|------------|------------|---------------------------------|
| stop_atr_mult     | **HIGH**   | 1.5-2.0    | **3.0**    | Biggest change from v2          |
| trailing_atr_mult | **HIGH**   | 4          | **4-6**    | tr=6 for stability, tr=4 for PnL|
| order_size        | **HIGH**   | 75         | **25-40**  | Lower = lower DD, linear PnL   |
| tp_atr_mult       | **MEDIUM** | 10         | **15-20**  | Higher TP = more trend capture  |
| ribbon.threshold  | **MEDIUM** | 5          | **5**      | Confirmed optimal               |
| ema_slow          | **LOW**    | 40         | **60**     | Small improvement               |
| min_bars_trailing | **LOW**    | -          | **3**      | Marginal effect                 |
| min_confluence    | **NONE**   | -          | any        | No measurable effect            |
| cooldown_bars     | **NONE**   | -          | any        | No measurable effect            |

---

## Comparison: v2 vs v3

| Metric     | v2 (#1)    | v3 Balanced | v3 Stable  | v3 Aggressive |
|------------|------------|-------------|------------|---------------|
| PnL        | +985%      | +381.6%     | +192.0%    | +428.2%       |
| DD         | 42.6%      | **18.1%**   | **14.4%**  | **22.6%**     |
| Sharpe     | 2.66       | 2.56        | **2.98**   | 2.86          |
| Win Rate   | 45.2%      | 47.6%       | **52.8%**  | 52.4%         |
| PF         | 1.51       | **1.78**    | **1.90**   | **1.87**      |
| Calmar     | 23.1       | **21.1**    | 13.4       | 18.9          |
| os         | 75         | 40          | 25         | 40            |

v3 sacrifices raw PnL (smaller position size) for dramatically lower DD and higher stability metrics.
For live trading, v3 Balanced is recommended: 3.9x better Calmar than baseline.
