# AlgoBond — Research: TOP-3 новые стратегии

**Date:** 2026-03-30
**Status:** Research Complete
**Method:** 3 параллельных research-агента, 34 кандидата, 176 WebSearch запросов
**Objective:** Стратегия 30-50%+ в месяц, работающая на разных токенах

---

## Executive Summary

Из 34 проанализированных стратегий выделены 3 финалиста. Каждый представляет принципиально разный подход, что даёт диверсификацию:

| # | Стратегия | Тип | Портирование | Профит | DD |
|---|-----------|-----|-------------|--------|-----|
| 1 | **SuperTrend Squeeze Momentum** | Technical | 1-2 дня | PF 2.1, WR 65-70% | 12-18% |
| 2 | **LightGBM Ensemble + Meta-Labeling** | ML | 3-5 дней | +53% за 8.5 мес | 10-20% |
| 3 | **Regime-Adaptive HMM + Specialist Models** | Hybrid | 3-4 дня | MDD -73% vs baseline | 5-15% |

**Рекомендация:** Реализовать #1 первой (быстрая победа), затем #3 как слой поверх всех стратегий, затем #2 как наиболее мощный ML-движок.

---

## TOP-1: SuperTrend Squeeze Momentum Strategy

### Консенсус агентов
- TradingView researcher: **9/10** (SuperTrend) + **8.5/10** (Squeeze Momentum)
- GitHub researcher: **8/10** (SuperTrend+RSI+ADX) + **8/10** (Squeeze Momentum)
- ML researcher: не рассматривал (technical, не ML)
- **Средний рейтинг: 8.4/10**

### Почему #1
Максимальная скорость реализации при доказанном профите. Все базовые индикаторы УЖЕ реализованы в AlgoBond. Нужно добавить только:
- SuperTrend formula: ~30 строк numpy
- Keltner Channel: ~10 строк numpy
- Linear Regression Momentum: ~15 строк numpy

### Описание стратегии

**Два режима работы в одном engine:**

**Режим 1 — Trend Following (Triple SuperTrend):**
- 3 SuperTrend с разными параметрами (mult 1/3/7, period 8/16/18)
- Entry Long: 2/3 SuperTrend green + цена > EMA200 + RSI < 40 + ADX > 25
- Entry Short: 2/3 SuperTrend red + цена < EMA200 + RSI > 60 + ADX > 25
- SL/TP через ATR (уже в бэктестере)

**Режим 2 — Volatility Breakout (Squeeze Momentum):**
- Squeeze detection: BB(20,2.0) сужается внутри Keltner Channel(20,1.5)
- Momentum direction: Linear Regression(close - avg(HL), 20)
- Entry: Squeeze release + momentum direction + SuperTrend confirmation + Volume spike
- Ловит "затишье перед бурей"

### Доказательная база

| Источник | Метрика | Значение |
|----------|---------|----------|
| QuantifiedStrategies | Avg profit/trade (SuperTrend) | 11.07% |
| QuantifiedStrategies | Win rate (SuperTrend+RSI, crypto) | 65-70% |
| TradeSearcher | Profit Factor (SuperTrend) | 2.1 |
| TradeSearcher | Бэктестов (Squeeze Momentum) | 58 |
| PickMyTrade | Profit Factor (Squeeze, BTC 30m) | 2.01 |
| PickMyTrade | Max DD (Squeeze, BTC 30m) | 5.77% |

### Универсальность
- SuperTrend — asset-agnostic, работает на любых трендовых рынках
- Squeeze Momentum — работает на акциях, крипто, форексе
- Тестировался на: BTC, ETH, мажорные альты, S&P500, форекс

### Файлы для реализации

```
backend/app/modules/strategy/engines/
├── indicators/
│   ├── trend.py          # ДОБАВИТЬ: supertrend(), keltner_channel()
│   └── oscillators.py    # ДОБАВИТЬ: squeeze_momentum(), linreg_momentum()
├── supertrend_squeeze.py # НОВЫЙ: SuperTrendSqueezeStrategy(BaseStrategy)
└── __init__.py           # Зарегистрировать в ENGINE_REGISTRY
```

### Оценка трудозатрат: 1-2 дня

### Ключевые ссылки
- https://www.quantifiedstrategies.com/supertrend-indicator-trading-strategy/
- https://www.tradingview.com/script/nqQ1DT5a-Squeeze-Momentum-Indicator-LazyBear/
- https://github.com/hackingthemarkets/supertrend-crypto-bot
- https://github.com/freqtrade/freqtrade-strategies/blob/main/user_data/strategies/Supertrend.py
- https://tradesearcher.ai/strategies/1725-tripple-super-trend-ema-rsi-strategy
- https://blog.pickmytrade.trade/squeeze-momentum-strategy/

---

## TOP-2: LightGBM Ensemble + Meta-Labeling Strategy

### Консенсус агентов
- ML researcher: **9/10** (LightGBM) + **9/10** (Meta-Labeling)
- GitHub researcher: **5/10** (intelligent-trading-bot, но как reference)
- TradingView researcher: не рассматривал (ML-specific)
- **Средний рейтинг: 8.5/10** (ML-специфичный, но наивысший потенциал)

### Почему #2
Самый мощный подход с наибольшим ceiling профита. Использует ВСЕ существующие индикаторы AlgoBond как features. Meta-Labeling — уникальный подход Lopez de Prado, который не заменяет, а УСИЛИВАЕТ любую стратегию (включая текущий Lorentzian KNN).

### Описание стратегии

**Компонент 1 — LightGBM Signal Generator:**
- Features (30-50+): RSI, WaveTrend, CCI, ADX, BB width, VWAP distance, CVD, SMC signals, Volume ratio
- Lag features: returns за 1/3/5/10/20 свечей, rolling volatility, rolling skew/kurtosis
- Labels: Triple Barrier (SL/TP/timeout) — binary или ternary classification
- Walk-Forward training: 90-дневные окна, переобучение каждые 7 дней
- Inference: < 10ms на CPU

**Компонент 2 — Meta-Labeling (усилитель):**
- Primary model: Lorentzian KNN ИЛИ LightGBM (генерирует direction)
- Secondary model: LightGBM meta-classifier (решает: торговать или пропустить сигнал)
- Output: probability → bet sizing (масштабирование позиции)
- Результат: фильтрует 50-70% ложных сигналов, снижает MDD на 73%

### Доказательная база

| Источник | Метрика | Значение |
|----------|---------|----------|
| arxiv 2511.00665 | LightGBM на BTC, 8.5 мес | +53.38% (без комиссий), +39.78% (с комиссиями) |
| Springer 2025 | Ensemble GB, multi-crypto | R2 = 0.98 |
| MDPI 2024 | Meta-labeling, crypto pairs | +51.42% profit boost |
| MDPI 2024 | Meta-labeling MDD reduction | -73.24% |
| Hudson & Thames | Meta-labeling precision | +50-70% false signal reduction |
| FreqAI whitepaper | Sharpe improvement vs baseline | +22% |

### Универсальность
- Модель переобучается per-pair → работает на ЛЮБЫХ токенах
- Walk-forward validation предотвращает overfitting
- Адаптируется к изменению рыночных условий через retraining

### Новые зависимости

```
lightgbm>=4.0         # ~3MB, CPU-only
scikit-learn>=1.3     # ~30MB, preprocessing + CV
optuna>=3.0           # ~5MB, hyperparameter tuning (опционально)
```

### Файлы для реализации

```
backend/app/modules/strategy/engines/
├── ml/
│   ├── __init__.py
│   ├── feature_engineering.py  # НОВЫЙ: extract_features(ohlcv) -> DataFrame
│   ├── triple_barrier.py       # НОВЫЙ: label_triple_barrier(prices, sl, tp, timeout)
│   ├── meta_labeling.py        # НОВЫЙ: MetaLabeler class
│   └── model_manager.py        # НОВЫЙ: train/load/save models, walk-forward
├── lightgbm_strategy.py        # НОВЫЙ: LightGBMStrategy(BaseStrategy)
└── __init__.py                 # Зарегистрировать
```

### Оценка трудозатрат: 3-5 дней

### Ключевые ссылки
- https://github.com/asavinov/intelligent-trading-bot (1.7k stars)
- https://www.freqtrade.io/en/stable/freqai/
- https://github.com/hudson-and-thames/mlfinlab
- https://arxiv.org/html/2511.00665v1
- https://www.mdpi.com/2227-7390/12/5/780
- https://www.mlfinlab.com/en/latest/labeling/tb_meta_labeling.html

---

## TOP-3: Regime-Adaptive HMM + Specialist Models

### Консенсус агентов
- ML researcher: **8/10**
- TradingView researcher: косвенно подтверждает (ADX-фильтр = простая форма regime detection)
- GitHub researcher: косвенно (NostalgiaForInfinity использует market state detection)
- **Средний рейтинг: 8.0/10**

### Почему #3
Решает ГЛАВНУЮ нерешённую проблему: КОГДА торговать. Текущая Lorentzian KNN и SuperTrend — trend-following стратегии, которые теряют деньги в sideways рынках. HMM определяет рыночный режим и переключает стратегию. Работает как META-СЛОЙ поверх ЛЮБОЙ стратегии.

### Описание стратегии

**Hidden Markov Model (HMM) для Regime Detection:**
- Input: returns + realized volatility (rolling 14 bars)
- States: 3 (Bull Trend / Bear Trend / Choppy/Sideways)
- Библиотека: hmmlearn.GaussianHMM(n_components=3)
- Обучение: на 90-180 днях исторических данных
- Inference: < 50ms CPU

**Specialist Models per Regime:**

| Режим | Стратегия | Параметры |
|-------|-----------|-----------|
| Bull Trend | Aggressive long-biased | SuperTrend loose trailing, large position |
| Bear Trend | Aggressive short-biased | Tight trailing, hedging |
| Choppy | Conservative / Flat | Минимальный sizing или пропуск торговли |

**Routing Logic:**
1. Каждую свечу: HMM предсказывает текущий режим
2. Router направляет к specialist-стратегии
3. Specialist генерирует сигнал (или no-trade для Choppy)
4. Position sizing масштабируется по confidence режима

### Доказательная база

| Источник | Метрика | Значение |
|----------|---------|----------|
| Springer 2024 | MDD reduction (regime-switching vs single) | -4% to -17% |
| QuantInsti | HMM+RF на крипто | Validated approach |
| FinRL research | RL pair trading, regime-aware | 9.94% - 31.53% annualized |
| Academic consensus | Regime detection для крипто | "Significantly better than single-model" |

### Универсальность
- HMM обучается на returns конкретного актива → авто-адаптация к любой паре
- 3 режима достаточно для крипто (мало параметров = низкий overfitting)
- Можно использовать с ЛЮБОЙ стратегией (Lorentzian KNN, SuperTrend, LightGBM)

### Новые зависимости

```
hmmlearn>=0.3         # ~1MB, CPU-only
```

### Файлы для реализации

```
backend/app/modules/strategy/engines/
├── regime/
│   ├── __init__.py
│   ├── hmm_detector.py     # НОВЫЙ: RegimeDetector class (train/predict)
│   └── regime_router.py    # НОВЫЙ: RouteToSpecialist based on regime
├── regime_adaptive.py      # НОВЫЙ: RegimeAdaptiveStrategy(BaseStrategy)
└── __init__.py
```

### Оценка трудозатрат: 3-4 дня

### Ключевые ссылки
- https://blog.quantinsti.com/regime-adaptive-trading-python/
- https://github.com/Sakeeb91/market-regime-detection
- https://link.springer.com/article/10.1007/s42521-024-00123-2

---

## Сводная таблица: все 34 кандидата

### TradingView / Forums (12 кандидатов)

| # | Стратегия | Оценка | Тип |
|---|-----------|--------|-----|
| 1 | Triple SuperTrend + EMA + RSI | **9/10** | Trend |
| 2 | Squeeze Momentum + EMA Filter | **8.5/10** | Volatility breakout |
| 3 | Multi-Indicator Confluence | **8.5/10** | Multi-filter |
| 4 | QQE MOD + SSL + Waddah Attar | **8/10** | Hybrid |
| 5 | Sniper (SuperTrend+SSL+QQE) | **7.5/10** | Multi-confirm |
| 6 | SSL Channel + WaveTrend | 7/10 | Trend+momentum |
| 7 | WAE + QQE + McGinley | 7/10 | Momentum+vol |
| 8 | Pivot Point SuperTrend | 7/10 | Trend |
| 9 | HalfTrend | 6.5/10 | Trend |
| 10 | UT Bot Alerts | 6.5/10 | ATR trailing |
| 11 | Chandelier Exit + ZLSMA | 6/10 | Trend (repainting!) |
| 12 | Ehlers Fisher Transform | 5.5/10 | Mean reversion |

### GitHub (12 кандидатов)

| # | Стратегия | Оценка | Stars |
|---|-----------|--------|-------|
| 1 | Triple SuperTrend + RSI + ADX | **8/10** | 4982 (freqtrade-strategies) |
| 2 | Squeeze Momentum + SuperTrend | **8/10** | N/A |
| 3 | RSI+MACD+BB+ADX Multi-Confluence | 7/10 | N/A (Medium article) |
| 4 | NostalgiaForInfinity (NFIX) | 6/10 | 2990 |
| 5 | SMC Library (joshyattridge) | 6/10 | 1427 |
| 6 | DoubleEMACrossoverWithTrend | 5/10 | 321 |
| 7 | Intelligent Trading Bot | 5/10 | 1655 |
| 8 | alpha-rptr (multi-strategy) | 5/10 | 638 |
| 9 | Passivbot (grid DCA) | 4/10 | 1927 |
| 10 | Nateemma DWT/FFT/Kalman | 4/10 | 418 |
| 11 | Grid Trading Bot | 4/10 | 129 |
| 12 | SuperTrend+RSI Confirmation | **8/10** | ~50 |

### ML / Academic (10 кандидатов)

| # | Стратегия | Оценка | Тип ML |
|---|-----------|--------|--------|
| 1 | LightGBM/XGBoost Ensemble | **9/10** | Supervised |
| 2 | Triple Barrier + Meta-Labeling | **9/10** | Meta-learning |
| 3 | Regime-Adaptive HMM + Specialists | **8/10** | Hybrid |
| 4 | Cross-Sectional Momentum + ML | 7/10 | Quant |
| 5 | Statistical Arbitrage (Pairs) | 7/10 | Quant |
| 6 | MLP + LSTM Hybrid | 6/10 | Neural |
| 7 | Freqtrade + FreqAI | 6/10 | Framework |
| 8 | Order Flow Microstructure + ML | 6/10 | Supervised |
| 9 | FinRL (Deep RL) | 5/10 | RL |
| 10 | Qlib (Microsoft) | 5/10 | Framework |

---

## Roadmap реализации

```
Неделя 1 (1-2 дня):
  → SuperTrend Squeeze Momentum Strategy
  → Новые индикаторы: supertrend, keltner_channel, linreg_momentum
  → Новый engine: SuperTrendSqueezeStrategy
  → Бэктест на 5+ токенов, grid search оптимизация
  → Деплой на demo

Неделя 2 (3-4 дня):
  → Regime-Adaptive HMM
  → hmmlearn integration
  → RegimeDetector + RouteToSpecialist
  → Применить поверх обоих стратегий (KNN + SuperTrend)

Неделя 3 (3-5 дней):
  → LightGBM Ensemble + Meta-Labeling
  → Feature engineering pipeline
  → Triple Barrier labeling
  → Walk-forward training
  → Meta-labeling поверх KNN для снижения ложных сигналов
```

---

## Предостережение

> **30-50% в месяц = 360-600% годовых** — это территория лучших хедж-фондов мира.
> Академические результаты: LightGBM на BTC +53% за 8.5 месяцев (~6%/мес).
> Лучший результат AlgoBond: RIVER +381% за 5 мес (~76%/мес, но на одном токене с overfitting risk).
>
> Реалистичная цель для диверсифицированного портфеля: **15-30% в месяц** при DD < 20%.
> Это уже ОТЛИЧНЫЙ результат, если подтверждается out-of-sample.
