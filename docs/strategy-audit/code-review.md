# SuperTrend Squeeze Momentum - Code Review

**Date:** 2026-04-10
**Scope:** `supertrend_squeeze.py`, `base.py`, `lorentzian_knn.py`, `__init__.py`, indicators, service.py, backtest_engine.py

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 2 |
| HIGH | 6 |
| LOW | 6 |

---

## CRITICAL

### CR-1: Отсутствие валидации конфига (supertrend_squeeze.py:47-83)

Все параметры читаются через `cfg.get("key", default)` без проверки типов и диапазонов.

- `st1_period = -5` - функция `atr()` вернет массив NaN, стратегия отработает без ошибки, но с бессмысленными сигналами
- `st1_period = "abc"` - numpy упадет с TypeError, пользователь получит невнятное "Ошибка стратегии"
- `stop_atr_mult = -3.0` - SL окажется выше entry для лонга, немедленное закрытие
- Type hints вроде `st1_period: int = st_cfg.get(...)` - декорация, Python не проверяет

**Рекомендация:** Pydantic-модель `SuperTrendSqueezeConfig` с `Field(ge=1)`, `Field(gt=0.0)`. Парсить в начале `generate_signals()`.

### CR-2: Дублирование exit-трекинга (supertrend_squeeze.py:183-208 vs backtest_engine.py:195-238)

Стратегия отслеживает SL/TP/trailing самостоятельно + backtest_engine делает свой трекинг с другой логикой:
- Стратегия: trailing по `data.high[i]`, backtest: по `bar_high` + breakeven + multi-TP
- Стратегия: `position_highest = max(data.high[i])`, backtest: `position_trailing_active` от entry_price
- SL/TP на одном баре: стратегия приоритет SL, backtest - аналогично но с trailing между

Два источника правды = сигналы на графике не соответствуют бэктесту.

**Рекомендация:** Стратегия определяет только entry conditions. Exit tracking - единственный в backtest_engine. Стратегия: упрощенный cooldown вместо полной SL/TP эмуляции.

---

## HIGH

### CR-3: StrategyResult - leaky abstraction (base.py:48-55)

`knn_scores`, `knn_classes`, `knn_confidence` специфичны для LorentzianKNN. SuperTrend возвращает пустые массивы. Service.py всё равно читает и возвращает "NEUTRAL" / 50.0.

**Рекомендация:** `engine_metadata: dict | None = None` вместо KNN-полей.

### CR-4: ATR вычисляется 4 раза (supertrend_squeeze.py:85-89, trend.py:270)

3 вызова `supertrend()` внутри каждый вычисляет ATR + явный `atr()` на строке 127. При совпадении периодов - дублирование.

**Рекомендация:** Параметр `precomputed_atr` в `supertrend()`.

### CR-5: Индикаторы вычисляются безусловно (supertrend_squeeze.py:117-124)

`volume_sma_line`, `dmi()` вычисляются всегда, `use_volume`/`use_adx` проверяются после. Squeeze - условный (правильно).

**Рекомендация:** Обернуть в условия аналогично squeeze.

### CR-6: Хардкод min_score = 5.0 (supertrend_squeeze.py:158)

ALL 5 фильтров должны совпасть. При отключении ADX + volume, max score = 3.0, trend entry никогда не сработает. Нет обратной связи пользователю.

**Рекомендация:** Динамический `min_score` или вынести в конфиг.

### CR-7: Signal.tp_levels и indicators не заполняются SuperTrend (base.py:43-44)

Lorentzian KNN заполняет, SuperTrend - нет. Multi-TP не работает для SuperTrend Squeeze.

**Рекомендация:** Добавить заполнение или задокументировать ограничение.

### CR-8: lorentzian_knn.py:261 - неэффективные boolean-массивы

`ribbon_filter_long = (~np.array([use_ribbon] * n)) | ribbon_bull` - создает Python-список из N элементов.

**Рекомендация:** `np.ones(n, dtype=bool)` при `not use_ribbon`.

---

## LOW

### CR-9: OHLCV NDArray без dtype (base.py:14-20)
`NDArray` без `NDArray[np.float64]`. Не критично но теряется self-documentation.

### CR-10: position_trailing не используется (supertrend_squeeze.py:237)
Переменная записывается но не читается. Trailing пересчитывается каждый бар.

### CR-11: Magic number 80 в knn_classify (lorentzian_knn.py:67)
`for i in range(80, n)` - хардкод вместо зависимости от lookback.

### CR-12: position_lowest = float("inf") (supertrend_squeeze.py:178)
Корректно, но unused при отсутствии short позиций.

### CR-13: generate_signals() слишком длинный (lorentzian_knn.py:166-619)
454 строки. Разбить на `_compute_indicators()`, `_compute_knn()`, `_compute_conditions()`, `_generate_signal_loop()`.

### CR-14: Thread safety - ОК
Engine создается fresh для каждого вызова, state в локальных переменных.

---

## Что хорошо

1. **Vectorized indicators** - все индикаторы корректно векторизованы
2. **Standalone indicator functions** - чистые функции без состояния
3. **Engine registry pattern** - чистый и расширяемый
4. **Redis caching** в service.py с graceful fallback
5. **Backtest engine** - хорошо структурирован, multi-TP, breakeven, trailing
6. **NaN handling** - последовательное использование np.nan_to_num()
7. **Squeeze release detection** - элегантная векторизация
8. **Memory** - ~2.2MB для 10K баров, приемлемо

---

**Вердикт: NEEDS_CHANGES** - критические проблемы (CR-1, CR-2) требуют внимания.
