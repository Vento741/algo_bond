# Bot Worker Quality Fixes - Spec

**Date:** 2026-04-07
**Status:** Approved
**Scope:** Пакет 1 - критические фиксы для live бота

---

## Контекст

Live бот "RIVER 15m Stable v4" (RIVERUSDT, 10x leverage) выявил ряд проблем при работе на реальных деньгах. Глубокий анализ 4 агентами + 3 верификационных агента подтвердили 5 реальных проблем.

## Проблемы и решения

### 1. Reverse Signal Handling (CRITICAL)

**Проблема:** bot_worker.py:91-94 делает `return` при открытой позиции ДО запуска стратегии. Стратегия (lorentzian_knn.py:431-436) корректно генерирует reversal сигналы (нет `continue` после reverse-exit, falls through к новому entry), но bot_worker их никогда не видит.

**Решение:** Configurable параметр `on_reverse` в секции `live` конфига.

Новый flow в `run_bot_cycle`:
```
sync → fetch candles → run strategy (ВСЕГДА, даже при открытой позиции)
     → open_position? 
       → YES: signal opposite direction?
         → YES: check on_reverse config
           → "reverse": close market + sync + open reverse
           → "close": close market only
           → "ignore": manage as before + LOG warning
         → NO (same direction or no signal): manage position
       → NO: signal? → place_order
```

Конфиг:
```json
"live": {
    "order_size": 30,
    "leverage": 10,
    "on_reverse": "ignore"
}
```

Default = `"ignore"` (обратная совместимость).

Close + Open как 2 отдельных шага:
1. Market close (opposite side, same qty)
2. _sync_positions - убедиться что позиция закрыта на бирже
3. Market open (new direction) - только если close подтвержден
4. Если open fails - бот flat, следующий цикл подхватит сигнал

Новый helper `_close_position_market(db, bot, client, position)`:
- Размещает market ордер в противоположном направлении на qty позиции
- Создает Order record в БД
- Обновляет Position.status = CLOSED
- Логирует действие

### 2. Smart Cycle (beat 1 мин + skip без новой свечи)

**Проблема:** Celery beat каждые 5 мин для 15m бота. Спам логов "Цикл бота запущен" 3 раза за свечу. Нет привязки к таймфрейму.

**Решение:**

Beat interval: `celery_app.py schedule: 60.0` (1 мин).

Логика skip в `run_bot_cycle` через Redis:
```python
last_candle_time = candles[-1]["timestamp"]
last_run_key = f"bot:{bot.id}:last_candle"
prev_candle_time = await redis.get(last_run_key)

has_new_candle = (prev_candle_time != str(last_candle_time))
has_position = open_position is not None
```

3 режима цикла:

| Условие | Действие | Лог |
|---------|----------|-----|
| Новая свеча | Полный цикл: стратегия + сигналы + ордера | info: "Новая свеча {time}, запуск стратегии" |
| Нет новой свечи + есть позиция | Manage-only: sync + manage | Только при реальных действиях |
| Нет новой свечи + нет позиции | Skip | Нет лога |

API нагрузка: 1 call при skip/manage, 5-8 calls при сигнале. Bybit rate limit 10-20 req/s - безопасно.

Redis ключ `bot:{bot_id}:last_candle` с TTL = 2 * timeframe_seconds (автоочистка).

### 3. Logging Silent Paths

**Проблема:** 3 места где бот молча пропускает действия без лога.

**Решение:**

| Line | Ситуация | Уровень | Лог |
|------|----------|---------|-----|
| 94 | Position open, manage | info (раз в свечу) | "Управление позицией {side} {symbol}" |
| 94 | Reverse signal detected | warn | "Обратный сигнал {dir} при открытой {side}, on_reverse={val}" |
| 125 | Signal too old | debug | "Сигнал устарел: bar {idx} < {min}" |
| 505 | SL fallback failed | error | "SL не установлен - аварийное закрытие" |

Убираем безусловный `_log("Цикл бота запущен")` (line 78).

Принцип: info = действия, warn = внимание, error = сбои, debug = рутина.

### 4. ATR Fix в _manage_position

**Проблема:** bot_worker.py:282-291 - ATR hardcoded 14 баров, timeframe hardcoded "15", simple mean вместо Wilder ATR.

**Решение:**
- `atr_period` из `config["risk"]["atr_period"]`
- `timeframe` из аргумента функции (передается из strategy_config.timeframe)
- Импорт `atr` из `app.modules.strategy.engines.indicators.trend` - тот же Wilder smoothed ATR что использует стратегия

```python
from app.modules.strategy.engines.indicators.trend import atr as calc_atr

atr_period = risk_cfg.get("atr_period", 14)
candles = client.get_klines(symbol, timeframe, atr_period + 10)
highs = np.array([c["high"] for c in candles])
lows = np.array([c["low"] for c in candles])
closes = np.array([c["close"] for c in candles])
atr_vals = calc_atr(highs, lows, closes, atr_period)
current_atr = float(atr_vals[-1])
```

### 5. SL Safety Net

**Проблема:** bot_worker.py:505-510 - если оба set_trading_stop падают, позиция на бирже без SL. DB записывает SL как будто он установлен.

**Решение:** Если SL не установился - аварийное закрытие позиции market ордером.

```python
except BybitAPIError as e2:
    logger.error("CRITICAL - SL not set, emergency close: %s", e2.message)
    await _log(db, bot.id, "error", "SL не установлен - аварийное закрытие позиции")
    try:
        client.place_order(symbol=symbol, side=opposite_side, qty=str(qty), order_type="Market")
    except BybitAPIError as e3:
        logger.error("EMERGENCY CLOSE ALSO FAILED: %s", e3.message)
    # Position будет закрыта через _sync_positions
```

Позиция без SL на реальных деньгах недопустима.

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `backend/app/modules/trading/bot_worker.py` | Основные изменения: reverse handling, smart cycle, logging, ATR fix, SL safety |
| `backend/app/celery_app.py` | Beat interval 300 → 60 |
| `backend/app/modules/trading/celery_tasks.py` | Без изменений |
| `frontend/src/pages/StrategyDetail.tsx` | Добавить поле `on_reverse` в LiveConfig и UI |
| `backend/scripts/seed_strategy.py` | Добавить `on_reverse: "ignore"` в default live config |

## Не входит в этот пакет

- Deep merge конфига (dormant risk, не баг сейчас)
- UNIQUE constraint на open positions
- Trailing stop + breakeven координация
- Exponential backoff для API
- TP2 от цены TP1 вместо entry

## Тестирование

- Существующие тесты bot_worker (10 тестов) должны проходить
- Новые тесты для reverse signal handling
- Новые тесты для smart cycle skip logic
- Ручная проверка на live боте после деплоя
