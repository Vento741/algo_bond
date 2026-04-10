# SuperTrend Squeeze Momentum - Research Report

**Date:** 2026-04-10
**Scope:** Best practices, methodology gaps, enhancement opportunities

---

## 1. SuperTrend Variations

### Triple vs Dual SuperTrend (COMMON PRACTICE)

Dual SuperTrend: swing trading, higher TF. Triple SuperTrend (current): preferred for 1m-15m. `min_agree=2` ("2 of 3") - правильный выбор.

**Проблема с текущими параметрами:**

| Param | Current | Issue |
|-------|---------|-------|
| ST1 mult | 1.0 | Слишком tight, частые whipsaws |
| ST2 mult | 3.0 | Standard |
| ST3 mult | 7.0 | Слишком wide, почти не флипается |

ST2 становится решающим голосом = Triple фактически работает как Single.

**Рекомендация:** Rebalance к 1.0/3.0/5.0 или 1.0/2.0/3.0.

### RSI Thresholds (COMMON PRACTICE)

`rsi_long_max=40` - агрессивный pullback-фильтр. Блокирует momentum breakouts. Pine Script НЕ использует RSI для trend entries.

**Рекомендация:** Тестировать 40 vs 50 vs 70. Или убрать RSI-фильтр для trend entries (оставить только для squeeze).

---

## 2. Squeeze Momentum

### LazyBear vs TTM Squeeze (COMMON PRACTICE)

Текущая реализация - LazyBear с linear regression (лучше оригинала Carter). Но:
- Midline formula неверна: `SMA(HL2)` вместо `avg(avg(highest, lowest), close)`
- Keltner Channel: EMA basis вместо SMA (TTM оригинал)

### Squeeze Duration (EXPERIMENTAL)

Длинные squeeze (20+ баров) коррелируют с сильными breakouts. Текущая реализация не трекает duration.

**Рекомендация:** Считать consecutive True в `squeeze_on`. Использовать как multiplier в confluence scoring.

---

## 3. Backtest Methodology

### Commission (PROVEN - OUTDATED)

| | Current | Actual Bybit 2026 |
|---|---------|-------------------|
| Taker | 0.05% | 0.055% |
| Round trip | 0.10% | 0.11% |

На 100 сделок @ 10x leverage, разница ~1% капитала.

### Slippage (PROVEN - CRITICAL GAP)

Текущий slippage: **0%** (нереалистично).

| Условия | Slippage |
|---------|----------|
| BTC/ETH, normal | 0.01-0.05% |
| Mid-cap alts | 0.05-0.15% |
| High vol / news | 0.1-0.5%+ |

**Рекомендация:** Default 0.03-0.05% для majors, 0.1% для alts. Apply to entry + exit prices.

### Walk-Forward (PROVEN - MISSING)

Нет walk-forward validation = все результаты потенциально overfit.

**Рекомендация:** Anchored walk-forward: 180d train / 30d test, slide 30d.

### Statistical Significance (PROVEN)

- Минимум: 30 trades (едва значимо)
- Надёжно: 100+ trades
- Институциональный стандарт: 200-500 trades, bull + bear + sideways

### Sharpe Calculation (PROVEN - ISSUE)

`annualization = sqrt(min(len(returns), bars_per_year))` - нестандартно. Должно быть `sqrt(bars_per_year)`.

---

## 4. Risk Management Gaps

### Max Drawdown Circuit Breaker (COMMON PRACTICE - MISSING)

Threshold: 15-20% max DD. Stop new positions, manage existing. Resume at (peak - threshold/2) или manual override.

### Time-Based Exits (COMMON PRACTICE - MISSING)

`max_bars_in_trade: 100-200` depending on TF. Force-close stale positions.

### Volatility Regime Adaptation (COMMON PRACTICE - PARTIAL)

ATR-based stops адаптируются пассивно, но multipliers фиксированы.

**Рекомендация:** Rolling ATR percentile over 100 bars. Low vol: tighter stops, larger position. High vol: wider stops, smaller position.

### Correlation Risk (PROVEN - MISSING)

BTC/ETH корреляция 0.85+ (1.0 в crashes). Multi-pair without correlation-aware sizing = compounding DD.

### Kelly Criterion (PROVEN with caveats)

Half-Kelly: f*/2. Sacrifices ~25% growth rate, reduces DD ~50%. Cap at 20%.

---

## 5. Enhancement Priorities

| # | Enhancement | Category | Effort | Impact |
|---|------------|----------|--------|--------|
| 1 | Slippage + Commission fix | PROVEN | 1-2h | HIGH |
| 2 | Walk-Forward validation | PROVEN | 1-2d | CRITICAL |
| 3 | Max DD Circuit Breaker | COMMON | 2-4h | HIGH |
| 4 | Squeeze Duration tracking | EXPERIMENTAL | 2-4h | MEDIUM |
| 5 | Multi-TF confirmation | COMMON | 1-2d | HIGH |
| 6 | Session filtering | EXPERIMENTAL | 4-8h | MEDIUM |
| 7 | Adaptive ATR multipliers | COMMON | 4-8h | MEDIUM |
| 8 | KNN confidence overlay | EXPERIMENTAL | 1-2d | MEDIUM |
| 9 | VWAP integration | COMMON | 1d | MEDIUM |
| 10 | Time-based exit | COMMON | 2-4h | LOW-MED |

---

## Parameter Recommendations

| Parameter | Current | Recommended | Rationale |
|-----------|---------|-------------|-----------|
| commission_pct | 0.05% | 0.055% | Bybit taker fee 2026 |
| slippage_pct | 0% | 0.03-0.05% | Industry standard |
| ST1 mult | 1.0 | 1.0 (keep) | Fast/sensitive |
| ST2 mult | 3.0 | 2.0-3.0 | Standard |
| ST3 mult | 7.0 | 4.0-5.0 | 7.0 too wide |
| rsi_long_max | 40 | 40-50 | 40 aggressive |
| adx_threshold | 25 | 20-25 | 20 catches more |
| max_bars_in_trade | N/A | 100-200 | Force exit stale |
| max_drawdown_pct | N/A | 15-20% | Circuit breaker |

---

## References

- Bybit Trading Fee Structure - official
- QuantifiedStrategies - SuperTrend backtests
- LuxAlgo - ATR stop loss, backtesting limitations
- LazyBear Squeeze Momentum - TradingView original
- Lopez de Prado 2014 - statistical significance, CPCV
- QuantInsti - Kelly Criterion for trading
