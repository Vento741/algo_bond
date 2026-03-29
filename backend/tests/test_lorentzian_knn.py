"""Тесты Lorentzian KNN классификатора и стратегии."""

import numpy as np
import pytest

from app.modules.strategy.engines.base import OHLCV, StrategyResult
from app.modules.strategy.engines.lorentzian_knn import (
    LorentzianKNNStrategy,
    detect_crossover,
    detect_crossunder,
    knn_classify,
    normalize_feature,
)


np.random.seed(42)
_trend = np.linspace(100, 150, 200)
_noise = np.random.normal(0, 1.5, 200)
CLOSE_200 = _trend + _noise
HIGH_200 = CLOSE_200 + np.abs(np.random.normal(1, 0.5, 200))
LOW_200 = CLOSE_200 - np.abs(np.random.normal(1, 0.5, 200))
OPEN_200 = CLOSE_200 + np.random.normal(0, 0.5, 200)
VOLUME_200 = np.random.uniform(500, 2000, 200)


class TestNormalizeFeature:
    def test_zero_std(self) -> None:
        flat = np.full(100, 50.0)
        result = normalize_feature(flat, 50)
        assert all(v == pytest.approx(0.0) for v in result)

    def test_z_score_distribution(self) -> None:
        data = np.random.normal(50, 10, 200)
        result = normalize_feature(data, 50)
        valid = result[50:]
        assert np.abs(np.mean(valid)) < 1.0


class TestKNNClassify:
    def test_returns_correct_shapes(self) -> None:
        f1 = normalize_feature(np.random.normal(0, 1, 200), 50)
        f2 = normalize_feature(np.random.normal(0, 1, 200), 50)
        f3 = normalize_feature(np.random.normal(0, 1, 200), 50)
        f4 = normalize_feature(np.random.normal(0, 1, 200), 50)
        close = np.linspace(100, 150, 200)

        score, conf = knn_classify(f1, f2, f3, f4, close, neighbors=8, lookback=50)
        assert len(score) == 200
        assert len(conf) == 200

    def test_score_range(self) -> None:
        f = normalize_feature(np.random.normal(0, 1, 200), 50)
        close = np.linspace(100, 150, 200)
        score, conf = knn_classify(f, f, f, f, close)
        valid = score[80:]
        assert all(-1 <= v <= 1 for v in valid)

    def test_confidence_range(self) -> None:
        f = normalize_feature(np.random.normal(0, 1, 200), 50)
        close = np.linspace(100, 150, 200)
        score, conf = knn_classify(f, f, f, f, close)
        valid = conf[80:]
        assert all(50 <= v <= 100 for v in valid)


class TestCrossover:
    def test_crossover(self) -> None:
        fast = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        slow = np.array([3.0, 3.0, 3.0, 3.0, 3.0])
        result = detect_crossover(fast, slow)
        assert result[3] == True

    def test_crossunder(self) -> None:
        fast = np.array([5.0, 4.0, 3.0, 2.0, 1.0])
        slow = np.array([3.0, 3.0, 3.0, 3.0, 3.0])
        result = detect_crossunder(fast, slow)
        assert result[3] == True


class TestLorentzianKNNStrategy:
    @pytest.fixture
    def strategy(self) -> LorentzianKNNStrategy:
        config = {
            "trend": {"ema_fast": 26, "ema_slow": 50, "ema_filter": 200},
            "ribbon": {"use": True, "type": "EMA", "mas": [9, 14, 21, 35, 55, 89, 144, 233], "threshold": 4},
            "order_flow": {"use": True, "cvd_period": 20, "cvd_threshold": 0.7},
            "smc": {"use": True, "fvg_min_size": 0.5, "liquidity_lookback": 20, "bos_pivot": 5},
            "volatility": {"use": True},
            "risk": {"atr_period": 14, "stop_atr_mult": 2, "tp_atr_mult": 30, "use_trailing": True, "trailing_atr_mult": 10},
            "filters": {"adx_period": 15, "adx_threshold": 10, "volume_mult": 1},
            "knn": {"neighbors": 8, "lookback": 50, "weight": 0.5, "rsi_period": 15, "wt_ch_len": 10, "wt_avg_len": 21, "cci_period": 20, "adx_period": 14},
            "breakout": {"period": 15},
            "mean_reversion": {"bb_period": 20, "bb_std": 2, "rsi_period": 14, "rsi_ob": 70, "rsi_os": 30},
        }
        return LorentzianKNNStrategy(config)

    @pytest.fixture
    def ohlcv(self) -> OHLCV:
        return OHLCV(
            open=OPEN_200,
            high=HIGH_200,
            low=LOW_200,
            close=CLOSE_200,
            volume=VOLUME_200,
        )

    def test_generates_result(self, strategy: LorentzianKNNStrategy, ohlcv: OHLCV) -> None:
        result = strategy.generate_signals(ohlcv)
        assert isinstance(result, StrategyResult)
        assert len(result.confluence_scores_long) == 200
        assert len(result.knn_scores) == 200

    def test_signals_have_risk_params(self, strategy: LorentzianKNNStrategy, ohlcv: OHLCV) -> None:
        result = strategy.generate_signals(ohlcv)
        for sig in result.signals:
            assert sig.stop_loss > 0
            assert sig.take_profit > 0
            assert sig.direction in ("long", "short")
            assert sig.confluence_score >= 0

    def test_name_and_engine_type(self, strategy: LorentzianKNNStrategy) -> None:
        assert strategy.name == "Machine Learning: Lorentzian KNN Classifier"
        assert strategy.engine_type == "lorentzian_knn"

    def test_confluence_max_55(self, strategy: LorentzianKNNStrategy, ohlcv: OHLCV) -> None:
        result = strategy.generate_signals(ohlcv)
        assert np.max(result.confluence_scores_long) <= 5.6
        assert np.max(result.confluence_scores_short) <= 5.6

    def test_knn_classes_values(self, strategy: LorentzianKNNStrategy, ohlcv: OHLCV) -> None:
        result = strategy.generate_signals(ohlcv)
        unique = set(np.unique(result.knn_classes))
        assert unique.issubset({-1, 0, 1})
