"""Hybrid KNN + SuperTrend Strategy.

Композиция двух движков:
1. Lorentzian KNN — ML-классификатор, даёт quality score для каждого бара
2. SuperTrend Squeeze — trend following, даёт entry сигналы с SL/TP/trailing

Логика: SuperTrend генерирует сигналы, KNN фильтрует.
Сигнал проходит только если KNN confidence > threshold и KNN direction совпадает.

Это НОВЫЙ engine, НЕ модифицирует KNN и SuperTrend.
"""

import numpy as np
from numpy.typing import NDArray

from app.modules.strategy.engines.base import OHLCV, BaseStrategy, Signal, StrategyResult
from app.modules.strategy.engines.lorentzian_knn import LorentzianKNNStrategy
from app.modules.strategy.engines.supertrend_squeeze import SuperTrendSqueezeStrategy


class HybridKNNSuperTrendStrategy(BaseStrategy):
    """Гибрид: KNN quality filter + SuperTrend entry/risk."""

    @property
    def name(self) -> str:
        return "Hybrid KNN + SuperTrend"

    @property
    def engine_type(self) -> str:
        return "hybrid_knn_supertrend"

    def generate_signals(self, data: OHLCV) -> StrategyResult:
        """Генерация сигналов: SuperTrend entries отфильтрованные KNN confidence."""
        cfg = self.config
        hybrid_cfg = cfg.get("hybrid", {})

        # --- Hybrid config ---
        knn_min_confidence: float = hybrid_cfg.get("knn_min_confidence", 55.0)
        knn_min_score: float = hybrid_cfg.get("knn_min_score", 0.1)
        knn_boost_threshold: float = hybrid_cfg.get("knn_boost_threshold", 75.0)
        knn_boost_mult: float = hybrid_cfg.get("knn_boost_mult", 1.3)
        use_knn_direction: bool = hybrid_cfg.get("use_knn_direction", True)

        # --- Запуск обоих движков на тех же данных ---
        # KNN: нужен свой конфиг (knn, trend, ribbon, order_flow, smc, risk, filters)
        knn_config = {
            "knn": cfg.get("knn", {"neighbors": 8, "lookback": 50, "weight": 0.5,
                                    "rsi_period": 15, "wt_ch_len": 10, "wt_avg_len": 21,
                                    "cci_period": 20, "adx_period": 14}),
            "trend": cfg.get("trend", {}),
            "ribbon": cfg.get("ribbon", {}),
            "order_flow": cfg.get("order_flow", {}),
            "smc": cfg.get("smc", {}),
            "volatility": cfg.get("volatility", {}),
            "risk": cfg.get("risk", {}),
            "filters": cfg.get("filters", {"min_confluence": 0.0}),
            "breakout": cfg.get("breakout", {}),
            "mean_reversion": cfg.get("mean_reversion", {}),
            "kernel": cfg.get("kernel", {}),
            "backtest": cfg.get("backtest", {}),
        }
        knn_engine = LorentzianKNNStrategy(knn_config)
        knn_result = knn_engine.generate_signals(data)

        # SuperTrend: свой конфиг
        st_config = {
            "supertrend": cfg.get("supertrend", {}),
            "squeeze": cfg.get("squeeze", {}),
            "trend_filter": cfg.get("trend_filter", {}),
            "entry": cfg.get("entry", {}),
            "risk": cfg.get("risk", {}),
            "regime": cfg.get("regime", {}),
            "multi_tf": cfg.get("multi_tf", {}),
            "time_filter": cfg.get("time_filter", {}),
            "backtest": cfg.get("backtest", {}),
        }
        st_engine = SuperTrendSqueezeStrategy(st_config)
        st_result = st_engine.generate_signals(data)

        # --- KNN массивы (per-bar) ---
        n = len(data)
        knn_scores = knn_result.knn_scores if len(knn_result.knn_scores) == n else np.zeros(n)
        knn_conf = knn_result.knn_confidence if len(knn_result.knn_confidence) == n else np.full(n, 50.0)
        knn_classes = knn_result.knn_classes if len(knn_result.knn_classes) == n else np.zeros(n)

        # --- Фильтрация ST сигналов по KNN ---
        filtered_signals: list[Signal] = []

        for sig in st_result.signals:
            bar = sig.bar_index
            if bar >= n:
                continue

            conf = float(knn_conf[bar])
            score = float(knn_scores[bar])
            knn_class = float(knn_classes[bar])

            # Фильтр 1: KNN confidence >= threshold
            if conf < knn_min_confidence:
                continue

            # Фильтр 2: KNN score magnitude >= min_score
            if abs(score) < knn_min_score:
                continue

            # Фильтр 3: KNN direction совпадает с сигналом
            if use_knn_direction:
                if sig.direction == "long" and score < 0:
                    continue
                if sig.direction == "short" and score > 0:
                    continue

            # Boost: высокий KNN confidence усиливает confluence score
            boosted_score = sig.confluence_score
            if conf >= knn_boost_threshold:
                boosted_score *= knn_boost_mult

            filtered_signals.append(Signal(
                bar_index=sig.bar_index,
                direction=sig.direction,
                entry_price=sig.entry_price,
                stop_loss=sig.stop_loss,
                take_profit=sig.take_profit,
                trailing_atr=sig.trailing_atr,
                confluence_score=boosted_score,
                signal_type=sig.signal_type,
                tp_levels=sig.tp_levels,
                indicators=sig.indicators,
            ))

        return StrategyResult(
            signals=filtered_signals,
            confluence_scores_long=st_result.confluence_scores_long,
            confluence_scores_short=st_result.confluence_scores_short,
            knn_scores=knn_scores,
            knn_classes=knn_classes,
            knn_confidence=knn_conf,
        )
