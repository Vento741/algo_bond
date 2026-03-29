---
name: strategy-test
description: Тест стратегии на live-данных Bybit WebSocket
user_invocable: true
---

# /strategy-test SYMBOL TIMEFRAME [MINUTES]

1. Bybit WebSocket подключение
2. Загрузка начальных свечей
3. На каждой закрытой свече: сигнал
4. Лог: timestamp, цена, сигнал, confluence, KNN
5. Сводка
