---
name: market-check
description: Проверка рыночных данных по символу
user_invocable: true
---

# /market-check SYMBOL

1. Тикер через Bybit REST
2. 100 свечей (5m)
3. RSI, EMA 26/50/200, ATR, ADX
4. Тренд + KNN классификатор
5. Сводка с confluence score
