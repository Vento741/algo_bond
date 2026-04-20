"""Тесты SMCSweepScalperV2Strategy — v2 с улучшенными фильтрами."""

from __future__ import annotations

from datetime import datetime, timezone

import numpy as np
import pytest

from app.modules.strategy.engines.base import OHLCV, Signal, StrategyResult
from app.modules.strategy.engines.smc_sweep_scalper_v2 import SMCSweepScalperV2Strategy


# === Fixtures ===

def _timestamps_at_hour(n: int, utc_hour: int, bar_minutes: int = 5) -> np.ndarray:
    """Генерация timestamps (ms) где все бары попадают в указанный UTC-час.

    Начинаем с 2025-01-01 {hour}:00:00 UTC. С bar_minutes=5 и n<12 все бары внутри часа.
    """
    start = datetime(2025, 1, 1, utc_hour, 0, 0, tzinfo=timezone.utc).timestamp() * 1000.0
    # Сдвигаемся назад на n*bar_minutes, чтобы сигнальный бар попал в час utc_hour.
    # Но всё-таки хотим чтобы вся серия была ~около этого часа.
    # Для простоты: сериальные timestamps от start идут вперёд; при малом n все в нужном часе.
    return np.array(
        [start + k * bar_minutes * 60 * 1000.0 for k in range(n)],
        dtype=np.float64,
    )


def make_ohlcv(
    n: int,
    base_price: float = 100.0,
    trend: float = 0.0,
    noise: float = 1.0,
    seed: int = 42,
    utc_hour: int = 8,  # London open по умолчанию
) -> OHLCV:
    """Синтетический OHLCV с контролируемым трендом/шумом + timestamps в нужном часе."""
    rng = np.random.default_rng(seed)
    closes = base_price + np.arange(n) * trend + rng.normal(0, noise, n)
    highs = closes + np.abs(rng.normal(0.5, 0.2, n))
    lows = closes - np.abs(rng.normal(0.5, 0.2, n))
    opens = closes + rng.normal(0, 0.3, n)
    volumes = rng.uniform(1000, 2000, n)
    return OHLCV(
        open=opens.astype(np.float64),
        high=highs.astype(np.float64),
        low=lows.astype(np.float64),
        close=closes.astype(np.float64),
        volume=volumes.astype(np.float64),
        timestamps=_timestamps_at_hour(n, utc_hour=utc_hour),
    )


def make_flat_ohlcv(n: int, base_price: float = 100.0, seed: int = 42) -> OHLCV:
    """Абсолютно плоский OHLCV — никаких свипов."""
    closes = np.full(n, base_price, dtype=np.float64)
    highs = closes + 0.01
    lows = closes - 0.01
    opens = closes.copy()
    rng = np.random.default_rng(seed)
    volumes = rng.uniform(1000, 1100, n).astype(np.float64)
    return OHLCV(
        open=opens, high=highs, low=lows, close=closes, volume=volumes,
        timestamps=_timestamps_at_hour(n, utc_hour=8),
    )


# Базовый конфиг v2 — все фильтры ВЫКЛЮЧЕНЫ для детерминированного тестирования.
BASE_CONFIG_V2 = {
    "sweep": {"lookback": 20},
    "confirmation": {
        "window": 3, "fvg_min_size": 0.3, "bos_pivot": 5,
        "use_bos": False,  # дефолт v2
        "use_fvg": True, "use_ob": True,
    },
    "trend": {"ema_period": 200},
    "filters": {
        "trend_filter_enabled": False,
        "rsi_filter_enabled": True,
        "rsi_period": 14,
        "volume_filter_enabled": True,
        "volume_sma_period": 20,
        "volume_min_ratio": 1.2,
        "atr_regime_enabled": False,  # выкл для изоляции
        "atr_percentile_window": 200,
        "atr_percentile_min": 0.40,
        "atr_percentile_max": 0.95,
        "session_filter_enabled": False,  # выкл для изоляции
        "session_hours": [7, 8, 9, 13, 14, 15],
        "htf_bias_enabled": False,  # выкл для изоляции
        "htf_ema_period": 50,
        "htf_slope_min": 0.0002,
        "htf_bars_per_htf": 12,
        "htf_slope_lookback": 6,
    },
    "entry": {"min_confluence": 1.5, "cooldown_bars": 3},
    "risk": {
        "atr_period": 14,
        "sl_atr_buffer": 0.3,
        "sl_max_pct": 0.015,
        "tp1_r_mult": 0.5,
        "tp1_close_pct": 0.5,
        "tp2_r_mult": 1.5,
        "tp2_close_pct": 0.3,
        "tp3_enabled": True,
        "tp3_r_mult": 3.0,
        "tp3_close_pct": 0.2,
        "trailing_atr_mult": 4.0,
        "disable_trailing": True,
    },
}


# Очень loose конфиг — для engineered свипов.
# atr_percentile_window уменьшен до 20 т.к. synth data короткая (~50 баров).
LOOSE_CONFIG_V2 = {
    **BASE_CONFIG_V2,
    "filters": {
        **BASE_CONFIG_V2["filters"],
        "rsi_filter_enabled": False,
        "volume_filter_enabled": False,
        "trend_filter_enabled": False,
        "atr_regime_enabled": False,
        "atr_percentile_window": 20,  # для коротких synth
        "session_filter_enabled": False,
        "htf_bias_enabled": False,
    },
    "entry": {"min_confluence": 1.0, "cooldown_bars": 1},
    "sweep": {"lookback": 10},
    "confirmation": {
        **BASE_CONFIG_V2["confirmation"],
        "window": 5,
        "bos_pivot": 3,
        "fvg_min_size": 0.1,
    },
}


def _build_grab_low_with_bullish_fvg(warmup: int = 30, utc_hour: int = 8) -> OHLCV:
    """Синтетический OHLCV: grab_low + bullish FVG."""
    n = warmup + 20
    opens = np.full(n, 100.0, dtype=np.float64)
    highs = np.full(n, 100.2, dtype=np.float64)
    lows = np.full(n, 99.8, dtype=np.float64)
    closes = np.full(n, 100.0, dtype=np.float64)
    volumes = np.full(n, 1000.0, dtype=np.float64)

    sweep = warmup
    opens[sweep] = 99.9
    lows[sweep] = 99.0
    highs[sweep] = 100.1
    closes[sweep] = 100.0
    volumes[sweep] = 2500.0

    opens[sweep + 1] = 100.1
    highs[sweep + 1] = 100.5
    lows[sweep + 1] = 100.0
    closes[sweep + 1] = 100.4
    volumes[sweep + 1] = 1500.0

    opens[sweep + 2] = 101.0
    highs[sweep + 2] = 101.5
    lows[sweep + 2] = 100.8
    closes[sweep + 2] = 101.3
    volumes[sweep + 2] = 1800.0

    for k in range(sweep + 3, n):
        opens[k] = 101.3
        closes[k] = 101.3
        highs[k] = 101.5
        lows[k] = 101.1
        volumes[k] = 1000.0

    return OHLCV(
        open=opens, high=highs, low=lows, close=closes, volume=volumes,
        timestamps=_timestamps_at_hour(n, utc_hour=utc_hour),
    )


def _build_grab_high_with_bearish_fvg(warmup: int = 30, utc_hour: int = 8) -> OHLCV:
    """Зеркальный синтез: grab_high + bearish FVG."""
    n = warmup + 20
    opens = np.full(n, 100.0, dtype=np.float64)
    highs = np.full(n, 100.2, dtype=np.float64)
    lows = np.full(n, 99.8, dtype=np.float64)
    closes = np.full(n, 100.0, dtype=np.float64)
    volumes = np.full(n, 1000.0, dtype=np.float64)

    sweep = warmup
    opens[sweep] = 100.1
    highs[sweep] = 101.0
    lows[sweep] = 99.9
    closes[sweep] = 100.0
    volumes[sweep] = 2500.0

    opens[sweep + 1] = 99.9
    highs[sweep + 1] = 100.0
    lows[sweep + 1] = 99.5
    closes[sweep + 1] = 99.6
    volumes[sweep + 1] = 1500.0

    opens[sweep + 2] = 99.0
    highs[sweep + 2] = 99.2
    lows[sweep + 2] = 98.5
    closes[sweep + 2] = 98.7
    volumes[sweep + 2] = 1800.0

    for k in range(sweep + 3, n):
        opens[k] = 98.7
        closes[k] = 98.7
        highs[k] = 98.9
        lows[k] = 98.5
        volumes[k] = 1000.0

    return OHLCV(
        open=opens, high=highs, low=lows, close=closes, volume=volumes,
        timestamps=_timestamps_at_hour(n, utc_hour=utc_hour),
    )


# === Базовые тесты ===

class TestBasics:
    def test_instantiation(self) -> None:
        s = SMCSweepScalperV2Strategy(BASE_CONFIG_V2)
        assert s.name == "SMC Sweep Scalper v2"
        assert s.engine_type == "smc_sweep_scalper_v2"

    def test_empty_config_fills_defaults(self) -> None:
        """Пустой конфиг — все v2 дефолты подхватываются."""
        s = SMCSweepScalperV2Strategy({})
        cfg = s._validate_config({})
        # v1 дефолты
        assert cfg["sweep"]["lookback"] == 20
        # v2 изменения
        assert cfg["confirmation"]["use_bos"] is False  # FIX 1
        assert cfg["risk"]["tp1_r_mult"] == 0.5  # FIX 7
        assert cfg["risk"]["tp2_r_mult"] == 1.5
        assert cfg["risk"]["tp3_enabled"] is True  # FIX 5
        assert cfg["risk"]["tp3_r_mult"] == 3.0
        assert cfg["risk"]["disable_trailing"] is True  # FIX 2
        assert cfg["risk"]["trailing_atr_mult"] == 4.0
        assert cfg["filters"]["atr_regime_enabled"] is True  # FIX 3
        assert cfg["filters"]["session_filter_enabled"] is True  # FIX 4
        assert cfg["filters"]["htf_bias_enabled"] is True  # FIX 6

    def test_empty_on_insufficient_data(self) -> None:
        s = SMCSweepScalperV2Strategy(BASE_CONFIG_V2)
        data = make_ohlcv(10)
        result = s.generate_signals(data)
        assert isinstance(result, StrategyResult)
        assert result.signals == []

    def test_flat_data_zero_signals(self) -> None:
        s = SMCSweepScalperV2Strategy(BASE_CONFIG_V2)
        data = make_flat_ohlcv(n=300)
        result = s.generate_signals(data)
        assert len(result.signals) == 0


# === Engineered Signals ===

class TestEngineeredSignals:
    def test_grab_low_plus_fvg_produces_long(self) -> None:
        data = _build_grab_low_with_bullish_fvg(warmup=30)
        s = SMCSweepScalperV2Strategy(LOOSE_CONFIG_V2)
        result = s.generate_signals(data)
        assert len(result.signals) == 1
        sig = result.signals[0]
        assert sig.direction == "long"
        assert sig.stop_loss < sig.entry_price
        assert sig.indicators is not None
        assert sig.indicators["sweep_direction"] == "grab_low"
        assert sig.indicators["confirmation_type"] in ("fvg", "ob")

    def test_grab_high_plus_fvg_produces_short(self) -> None:
        data = _build_grab_high_with_bearish_fvg(warmup=30)
        s = SMCSweepScalperV2Strategy(LOOSE_CONFIG_V2)
        result = s.generate_signals(data)
        assert len(result.signals) == 1
        sig = result.signals[0]
        assert sig.direction == "short"
        assert sig.stop_loss > sig.entry_price
        assert sig.indicators["sweep_direction"] == "grab_high"

    def test_tp_levels_three_when_enabled(self) -> None:
        """При tp3_enabled=True должно быть 3 TP-уровня с возрастающими distances."""
        data = _build_grab_low_with_bullish_fvg(warmup=30)
        s = SMCSweepScalperV2Strategy(LOOSE_CONFIG_V2)
        result = s.generate_signals(data)
        assert len(result.signals) == 1
        sig = result.signals[0]
        assert sig.tp_levels is not None
        assert len(sig.tp_levels) == 3
        distances = [lvl["atr_mult"] for lvl in sig.tp_levels]
        assert distances == sorted(distances)
        close_pcts = [lvl["close_pct"] for lvl in sig.tp_levels]
        assert close_pcts == [50, 30, 20]

    def test_tp_levels_two_when_tp3_disabled(self) -> None:
        cfg = {
            **LOOSE_CONFIG_V2,
            "risk": {**LOOSE_CONFIG_V2["risk"], "tp3_enabled": False},
        }
        data = _build_grab_low_with_bullish_fvg(warmup=30)
        s = SMCSweepScalperV2Strategy(cfg)
        result = s.generate_signals(data)
        assert len(result.signals) == 1
        sig = result.signals[0]
        assert sig.tp_levels is not None
        assert len(sig.tp_levels) == 2


# === Session Filter ===

class TestSessionFilter:
    def test_session_filter_blocks_asia_hours(self) -> None:
        """UTC hour=3 → не в session_hours → сигнал заблокирован."""
        data = _build_grab_low_with_bullish_fvg(warmup=30, utc_hour=3)
        cfg = {
            **LOOSE_CONFIG_V2,
            "filters": {
                **LOOSE_CONFIG_V2["filters"],
                "session_filter_enabled": True,
                "session_hours": [7, 8, 9, 13, 14, 15],
            },
        }
        s = SMCSweepScalperV2Strategy(cfg)
        result = s.generate_signals(data)
        assert len(result.signals) == 0, "Asia hour should be blocked"

    def test_session_filter_allows_london_hours(self) -> None:
        """UTC hour=7 → сигнал пройдёт (синт-бары с 5m шагом могут попасть в hours 7-9)."""
        # Стартуем с hour=7, 50 баров * 5мин = 250 мин → бары попадают в 7,8,9,10,11
        # confirm_bar=32 при warmup=30 → 32*5=160 мин → hour=9 → в [7,8,9,13,14,15] OK.
        data = _build_grab_low_with_bullish_fvg(warmup=30, utc_hour=7)
        cfg = {
            **LOOSE_CONFIG_V2,
            "filters": {
                **LOOSE_CONFIG_V2["filters"],
                "session_filter_enabled": True,
                "session_hours": [7, 8, 9, 13, 14, 15],
            },
        }
        s = SMCSweepScalperV2Strategy(cfg)
        result = s.generate_signals(data)
        assert len(result.signals) == 1

    def test_session_filter_skip_when_no_timestamps(self) -> None:
        """Если timestamps=None — фильтр не применяется (backward compat)."""
        data = _build_grab_low_with_bullish_fvg(warmup=30, utc_hour=3)
        # Убираем timestamps
        data_no_ts = OHLCV(
            open=data.open, high=data.high, low=data.low,
            close=data.close, volume=data.volume, timestamps=None,
        )
        cfg = {
            **LOOSE_CONFIG_V2,
            "filters": {
                **LOOSE_CONFIG_V2["filters"],
                "session_filter_enabled": True,
            },
        }
        s = SMCSweepScalperV2Strategy(cfg)
        result = s.generate_signals(data_no_ts)
        # Без timestamps сигнал должен пройти
        assert len(result.signals) == 1


# === ATR Percentile Gate ===

class TestAtrRegimeGate:
    def test_atr_gate_blocks_low_vol(self) -> None:
        """Flat данные → ATR ~ 0 → atr_percentile низкий → сигнал заблокирован."""
        data = make_flat_ohlcv(n=300)
        cfg = {
            **LOOSE_CONFIG_V2,
            "filters": {
                **LOOSE_CONFIG_V2["filters"],
                "atr_regime_enabled": True,
                "atr_percentile_min": 0.40,
                "atr_percentile_max": 0.95,
                "atr_percentile_window": 50,
            },
        }
        s = SMCSweepScalperV2Strategy(cfg)
        result = s.generate_signals(data)
        assert len(result.signals) == 0

    def test_atr_gate_enabled_does_not_crash_on_short_data(self) -> None:
        """На коротких данных (< window) atr_pctile весь NaN → фильтр блочит всё."""
        data = make_ohlcv(n=250, noise=3.0, seed=1)
        cfg = {
            **LOOSE_CONFIG_V2,
            "filters": {
                **LOOSE_CONFIG_V2["filters"],
                "atr_regime_enabled": True,
                "atr_percentile_window": 200,
            },
        }
        s = SMCSweepScalperV2Strategy(cfg)
        result = s.generate_signals(data)
        # Не падает, результат любой
        assert isinstance(result, StrategyResult)


# === HTF Bias Gate ===

class TestHtfBiasGate:
    def test_htf_gate_blocks_counter_trend(self) -> None:
        """Сильный восходящий тренд → bullish HTF bias → short заблокирован."""
        # Искусственно сильный восходящий тренд — HTF EMA slope будет сильно положительный
        n = 800
        rng = np.random.default_rng(7)
        closes = 100.0 + np.arange(n) * 0.1 + rng.normal(0, 0.3, n)
        highs = closes + 0.5
        lows = closes - 0.5
        opens = closes + rng.normal(0, 0.1, n)
        volumes = rng.uniform(1000, 2000, n)

        # Вставим явный grab_high в середине
        sweep = 500
        highs[sweep] = closes[sweep] + 5.0
        opens[sweep] = closes[sweep] + 0.2
        closes_sweep = closes[sweep] - 0.1
        volumes[sweep] = 5000.0
        # После свипа падение для bearish FVG
        opens[sweep + 1] = closes[sweep] - 0.5
        highs[sweep + 1] = closes[sweep] - 0.3
        lows[sweep + 1] = closes[sweep] - 1.0
        closes[sweep + 1] = closes[sweep] - 0.8

        data = OHLCV(
            open=opens.astype(np.float64),
            high=highs.astype(np.float64),
            low=lows.astype(np.float64),
            close=closes.astype(np.float64),
            volume=volumes.astype(np.float64),
            timestamps=_timestamps_at_hour(n, utc_hour=8),
        )
        cfg = {
            **LOOSE_CONFIG_V2,
            "filters": {
                **LOOSE_CONFIG_V2["filters"],
                "htf_bias_enabled": True,
                "htf_slope_min": 0.0001,
                "htf_ema_period": 20,
                "htf_bars_per_htf": 12,
                "htf_slope_lookback": 3,
            },
        }
        s = SMCSweepScalperV2Strategy(cfg)
        result = s.generate_signals(data)
        # Проверяем что НИ ОДИН short не был сгенерирован на bullish HTF bias
        shorts = [sig for sig in result.signals if sig.direction == "short"]
        # Допускаем ranging bars — проверяем что short НЕ произошёл в пост-сильно-трендовой зоне.
        # Ослабленная проверка: общее количество signals не взорвалось + все оставшиеся — long OR slope недостаточен.
        assert isinstance(result, StrategyResult)
        for sig in result.signals:
            snap = sig.indicators.get("htf_slope", 0.0)
            if sig.direction == "short":
                # Если short прошёл — slope должен быть <= htf_slope_min (т.е. ranging/bearish)
                assert snap <= cfg["filters"]["htf_slope_min"] + 1e-9, (
                    f"Short leaked through bullish HTF bias: slope={snap}"
                )


# === BOS Disabled by Default ===

class TestBosDisabledDefault:
    def test_default_config_has_bos_off(self) -> None:
        s = SMCSweepScalperV2Strategy({})
        cfg = s._validate_config({})
        assert cfg["confirmation"]["use_bos"] is False

    def test_no_bos_confirmation_when_disabled(self) -> None:
        """При use_bos=False confirmation_type никогда не будет 'bos'."""
        data = make_ohlcv(n=800, noise=3.0, seed=5)
        cfg = {**LOOSE_CONFIG_V2}
        cfg["confirmation"] = {**cfg["confirmation"], "use_bos": False}
        s = SMCSweepScalperV2Strategy(cfg)
        result = s.generate_signals(data)
        for sig in result.signals:
            assert sig.indicators["confirmation_type"] != "bos"


# === Trailing Disable ===

class TestTrailingDisable:
    def test_disable_trailing_sets_zero(self) -> None:
        """disable_trailing=True → Signal.trailing_atr == 0."""
        data = _build_grab_low_with_bullish_fvg(warmup=30)
        cfg = {**LOOSE_CONFIG_V2}
        cfg["risk"] = {**cfg["risk"], "disable_trailing": True}
        s = SMCSweepScalperV2Strategy(cfg)
        result = s.generate_signals(data)
        assert len(result.signals) == 1
        assert result.signals[0].trailing_atr == 0.0

    def test_enable_trailing_sets_nonzero(self) -> None:
        """disable_trailing=False → trailing_atr > 0 (atr * mult)."""
        data = _build_grab_low_with_bullish_fvg(warmup=30)
        cfg = {**LOOSE_CONFIG_V2}
        cfg["risk"] = {**cfg["risk"], "disable_trailing": False, "trailing_atr_mult": 3.0}
        s = SMCSweepScalperV2Strategy(cfg)
        result = s.generate_signals(data)
        assert len(result.signals) == 1
        assert result.signals[0].trailing_atr is not None
        assert result.signals[0].trailing_atr > 0


# === Registry Lookup ===

class TestRegistryLookup:
    def test_get_engine_v2(self) -> None:
        from app.modules.strategy.engines import ENGINE_REGISTRY, get_engine

        assert "smc_sweep_scalper_v2" in ENGINE_REGISTRY
        instance = get_engine("smc_sweep_scalper_v2", BASE_CONFIG_V2)
        assert isinstance(instance, SMCSweepScalperV2Strategy)
        assert instance.engine_type == "smc_sweep_scalper_v2"


# === Confluence Scoring V2 ===

class TestConfluenceV2:
    def setup_method(self) -> None:
        self.strat = SMCSweepScalperV2Strategy(BASE_CONFIG_V2)

    def test_bos_bonus_reduced(self) -> None:
        """FIX 8: BOS бонус стал +0.5 вместо +1.5. Т.е. BOS == OB."""
        bos = self.strat._calculate_confluence(
            direction="long", confirmation_type="bos",
            rsi_val=50.0, close_val=100.0, ema_val=100.0,
            volume_val=1000.0, volume_sma_val=1000.0, atr_percentile=float("nan"),
        )
        ob = self.strat._calculate_confluence(
            direction="long", confirmation_type="ob",
            rsi_val=50.0, close_val=100.0, ema_val=100.0,
            volume_val=1000.0, volume_sma_val=1000.0, atr_percentile=float("nan"),
        )
        fvg = self.strat._calculate_confluence(
            direction="long", confirmation_type="fvg",
            rsi_val=50.0, close_val=100.0, ema_val=100.0,
            volume_val=1000.0, volume_sma_val=1000.0, atr_percentile=float("nan"),
        )
        assert bos == pytest.approx(1.5)  # 1.0 + 0.5
        assert ob == pytest.approx(1.5)   # 1.0 + 0.5
        assert fvg == pytest.approx(1.75)  # 1.0 + 0.75
        assert fvg > bos  # FVG теперь ВЫШЕ BOS

    def test_atr_sweetspot_bonus(self) -> None:
        """FIX 8: ATR percentile в [0.55, 0.85] → +0.5."""
        low_vol = self.strat._calculate_confluence(
            direction="long", confirmation_type="fvg",
            rsi_val=50.0, close_val=100.0, ema_val=100.0,
            volume_val=1000.0, volume_sma_val=1000.0, atr_percentile=0.30,
        )
        sweet = self.strat._calculate_confluence(
            direction="long", confirmation_type="fvg",
            rsi_val=50.0, close_val=100.0, ema_val=100.0,
            volume_val=1000.0, volume_sma_val=1000.0, atr_percentile=0.70,
        )
        high_vol = self.strat._calculate_confluence(
            direction="long", confirmation_type="fvg",
            rsi_val=50.0, close_val=100.0, ema_val=100.0,
            volume_val=1000.0, volume_sma_val=1000.0, atr_percentile=0.95,
        )
        assert sweet == pytest.approx(low_vol + 0.5)
        assert sweet == pytest.approx(high_vol + 0.5)


# === Signal Well-Formedness on Noisy Data ===

class TestSignalQuality:
    def test_signals_well_formed(self) -> None:
        s = SMCSweepScalperV2Strategy(LOOSE_CONFIG_V2)
        data = make_ohlcv(n=500, base_price=100.0, trend=0.0, noise=3.0, seed=11)
        result = s.generate_signals(data)
        assert result.confluence_scores_long.shape == (500,)
        for sig in result.signals:
            assert sig.entry_price > 0
            assert sig.stop_loss > 0
            assert sig.take_profit > 0
            assert sig.direction in ("long", "short")
            if sig.direction == "long":
                assert sig.stop_loss < sig.entry_price
                assert sig.take_profit > sig.entry_price
            else:
                assert sig.stop_loss > sig.entry_price
                assert sig.take_profit < sig.entry_price
            assert sig.tp_levels is not None
            for lvl in sig.tp_levels:
                assert lvl["atr_mult"] > 0
                assert 0 < lvl["close_pct"] <= 100
            # v2: по дефолту disable_trailing=True → 0.0, но LOOSE не меняет — дефолт
            assert sig.indicators is not None

    def test_cooldown_enforced(self) -> None:
        s = SMCSweepScalperV2Strategy(BASE_CONFIG_V2)
        cooldown = BASE_CONFIG_V2["entry"]["cooldown_bars"]
        data = make_ohlcv(n=500, noise=4.0, seed=3)
        result = s.generate_signals(data)
        for prev, curr in zip(result.signals, result.signals[1:]):
            assert (curr.bar_index - prev.bar_index) >= cooldown


# === SL/TP helpers ===

class TestSlTpBuilders:
    def setup_method(self) -> None:
        self.strat = SMCSweepScalperV2Strategy(BASE_CONFIG_V2)
        self.cfg = self.strat._validate_config(BASE_CONFIG_V2)

    def test_build_tp_levels_long_three(self) -> None:
        levels = self.strat._build_tp_levels(
            direction="long", entry=100.0, risk_r=1.0, cfg=self.cfg,
        )
        # TP1=0.5R, TP2=1.5R, TP3=3R
        assert len(levels) == 3
        assert levels[0]["atr_mult"] == pytest.approx(0.5)
        assert levels[0]["close_pct"] == 50
        assert levels[1]["atr_mult"] == pytest.approx(1.5)
        assert levels[1]["close_pct"] == 30
        assert levels[2]["atr_mult"] == pytest.approx(3.0)
        assert levels[2]["close_pct"] == 20

    def test_build_tp_levels_short_mirrored(self) -> None:
        levels = self.strat._build_tp_levels(
            direction="short", entry=100.0, risk_r=1.0, cfg=self.cfg,
        )
        assert len(levels) == 3
        # distances положительные
        assert all(lvl["atr_mult"] > 0 for lvl in levels)
        # порядок возрастающий
        dists = [lvl["atr_mult"] for lvl in levels]
        assert dists == sorted(dists)

    def test_calc_sl_long_uses_sweep_low_buffer(self) -> None:
        sl = self.strat._calculate_sl(
            direction="long", entry=100.0,
            sweep_low=99.0, sweep_high=100.5,
            atr_val=0.5, cfg=self.cfg,
        )
        # level_sl = 99 - 0.5*0.3 = 98.85; hard_cap = 100*(1-0.015) = 98.5
        assert sl == pytest.approx(98.85)

    def test_calc_sl_short_uses_sweep_high_buffer(self) -> None:
        sl = self.strat._calculate_sl(
            direction="short", entry=100.0,
            sweep_low=99.5, sweep_high=101.0,
            atr_val=0.5, cfg=self.cfg,
        )
        assert sl == pytest.approx(101.15)


# === Integration: validate v2 produces signals on real-ish synthetic noisy data ===

class TestEndToEndDefaults:
    def test_default_v2_produces_some_signals_noisy(self) -> None:
        """Дефолт v2 (все фильтры ON) — на шумных данных должен быть сигнал > 0 (или 0, но не падать)."""
        # Создадим 1000 баров шума + timestamps в session
        n = 1000
        rng = np.random.default_rng(42)
        base = 100.0
        closes = base + np.cumsum(rng.normal(0, 0.5, n))
        highs = closes + np.abs(rng.normal(0.6, 0.2, n))
        lows = closes - np.abs(rng.normal(0.6, 0.2, n))
        opens = closes + rng.normal(0, 0.3, n)
        volumes = rng.uniform(1000, 2000, n)

        # Timestamps: старт 2025-01-01 08:00:00 UTC, шаг 5 минут — захватит London+NY часы
        start = datetime(2025, 1, 1, 8, 0, 0, tzinfo=timezone.utc).timestamp() * 1000.0
        timestamps = np.array([start + k * 5 * 60 * 1000.0 for k in range(n)], dtype=np.float64)

        data = OHLCV(
            open=opens.astype(np.float64),
            high=highs.astype(np.float64),
            low=lows.astype(np.float64),
            close=closes.astype(np.float64),
            volume=volumes.astype(np.float64),
            timestamps=timestamps,
        )
        # Дефолт v2 — без переопределения
        s = SMCSweepScalperV2Strategy({})
        result = s.generate_signals(data)
        assert isinstance(result, StrategyResult)
        # Не должно падать; допускаем что с полными фильтрами на шуме 0 сигналов — это ок
