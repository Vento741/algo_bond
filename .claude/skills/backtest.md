---
name: backtest
description: Запуск бэктеста торговой стратегии
user_invocable: true
---

# /backtest SYMBOL TIMEFRAME START END

1. Загрузить OHLCV с Bybit
2. Инициализировать стратегию
3. Прогнать по свечам
4. Метрики: win rate, profit factor, drawdown, Sharpe
5. Equity curve + отчёт
