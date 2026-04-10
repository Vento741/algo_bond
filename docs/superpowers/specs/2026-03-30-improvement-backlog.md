# AlgoBond — Backlog доработок (по результатам аудита v0.9.0)

**Date:** 2026-03-30
**Status:** Approved
**Source:** Глубокий анализ кодовой базы + документации

---

## Критические (влияют на торговлю)

### 1. KNN Redundancy — ML-компонент не работает
- **Проблема:** KNN parameters (neighbors, lookback, weight) имеют НУЛЕВОЙ эффект на результаты. Ribbon filter (threshold=5) полностью перекрывает KNN.
- **Влияние:** "Machine Learning" в стратегии — фактически no-op. Реальные сигналы генерирует MA Ribbon + trailing stop tuning.
- **Решение:** Либо ослабить ribbon filter для активации KNN, либо упростить стратегию и убрать KNN overhead.
- **Приоритет:** HIGH

### 2. Out-of-sample validation отсутствует
- **Проблема:** Все 300+ бэктестов на одном периоде (5 мес, Nov 2025 — Mar 2026). Нет walk-forward, нет cross-validation.
- **Влияние:** Высокий риск overfitting — стратегия может не работать на новых данных.
- **Решение:** Добавить walk-forward optimization: train на 3 мес, test на 1 мес, скользящее окно. Добавить Monte Carlo simulation.
- **Приоритет:** HIGH

### 3. Стратегия работает только на RIVER
- **Проблема:** RIVER: +381% | TRUMP: +16.4% | ETH: +19.1%. Стратегия заточена под один токен.
- **Влияние:** Зависимость от одного инструмента = высокий идиосинкратический риск.
- **Решение:** Добавить вторую стратегию, работающую на нескольких токенах (см. отдельный таск).
- **Приоритет:** HIGH

---

## Архитектурные

### 4. bybit_listener.py — 993 строки, нужна декомпозиция
- **Проблема:** Самый большой файл в проекте, смешивает WebSocket management, position sync, order monitoring.
- **Решение:** Разделить на: `ws_client.py` (подключение), `position_sync.py` (синхронизация), `order_monitor.py` (мониторинг).
- **Приоритет:** MEDIUM

### 5. Модуль notifications не реализован
- **Проблема:** Описан в спецификации (таблица 5.7), но код модуля отсутствует.
- **Решение:** Реализовать notifications module: модель, сервис, WebSocket push, toast в UI.
- **Приоритет:** MEDIUM

### 6. demo_balances таблица отсутствует
- **Проблема:** Описана в спецификации (5.6), но не создана в БД и не используется.
- **Решение:** Alembic миграция + интеграция с demo mode ботов.
- **Приоритет:** LOW

### 7. Нет интеграционных тестов bot_worker → Bybit
- **Проблема:** 141 тест, но нет e2e цепочки: signal → order → position → close.
- **Решение:** Mock Bybit API, прогнать полный цикл бота в тесте.
- **Приоритет:** MEDIUM

---

## Frontend / UX

### 8. Onboarding tour не реализован
- **Проблема:** Спецификация предусматривает 3-5 шагов для новых пользователей.
- **Решение:** react-joyride или shepherd.js, 5 шагов: Dashboard → Strategies → Backtest → Bots → Chart.
- **Приоритет:** LOW

### 9. Light theme toggle отсутствует
- **Проблема:** Dark default по спецификации, но toggle не реализован.
- **Решение:** CSS variables + Zustand theme store + toggle в Settings.
- **Приоритет:** LOW

### 10. Кастомные индикаторы на графике не реализованы
- **Проблема:** Спецификация предусматривает: KNN confidence overlay, Kernel Envelope, SMC zones, MA Ribbon на TradingView chart.
- **Решение:** Lightweight Charts custom series / markers API.
- **Приоритет:** MEDIUM

### 11. Email verification отложена
- **Проблема:** `is_verified` поле есть в БД, но flow не реализован.
- **Решение:** SMTP + verification token + redirect. Отмечено как последняя очередь.
- **Приоритет:** LOW

---

## Оптимизация стратегии

### 12. Walk-forward optimizer
- **Решение:** Автоматический walk-forward: train window → test window → сдвиг → повтор. Метрика: стабильность OOS vs IS.
- **Приоритет:** HIGH

### 13. Multi-symbol portfolio backtest
- **Решение:** Бэктест портфеля из нескольких токенов одновременно с учётом корреляций и общего drawdown.
- **Приоритет:** MEDIUM

### 14. Автоматический re-optimization (scheduled)
- **Решение:** Celery beat: раз в неделю запускать grid search на последних данных, сравнивать с текущим конфигом.
- **Приоритет:** LOW

---

## Инфраструктура

### 15. CI/CD pipeline
- **Проблема:** Деплой через ручной `git push` + SSH. Нет GitHub Actions.
- **Решение:** GitHub Actions: lint → test → build → deploy on push to main.
- **Приоритет:** LOW

### 16. Мониторинг / алертинг
- **Проблема:** Нет Prometheus/Grafana, нет алертов при падении бота.
- **Решение:** Prometheus metrics в FastAPI + Grafana dashboard + Telegram алерты.
- **Приоритет:** MEDIUM
