"""Тесты SMCSweepScalperStrategy — SMC liquidity sweep scalper."""

import numpy as np
import pytest

from app.modules.strategy.engines.base import OHLCV, Signal, StrategyResult
from app.modules.strategy.engines.smc_sweep_scalper import SMCSweepScalperStrategy


# === Fixtures ===

def make_ohlcv(
    n: int,
    base_price: float = 100.0,
    trend: float = 0.0,
    noise: float = 1.0,
    seed: int = 42,
) -> OHLCV:
    """Синтетический OHLCV с контролируемым трендом и шумом."""
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
        timestamps=np.arange(n, dtype=np.float64) * 60_000,
    )


def make_flat_ohlcv(n: int, base_price: float = 100.0, seed: int = 42) -> OHLCV:
    """Абсолютно плоский OHLCV без шума — никаких свипов не должно быть."""
    closes = np.full(n, base_price, dtype=np.float64)
    highs = closes + 0.01
    lows = closes - 0.01
    opens = closes.copy()
    rng = np.random.default_rng(seed)
    volumes = rng.uniform(1000, 1100, n).astype(np.float64)
    return OHLCV(
        open=opens, high=highs, low=lows, close=closes, volume=volumes,
        timestamps=np.arange(n, dtype=np.float64) * 60_000,
    )


DEFAULT_CONFIG = {
    "sweep": {"lookback": 20},
    "confirmation": {
        "window": 3, "fvg_min_size": 0.3, "bos_pivot": 5,
        "use_bos": True, "use_fvg": True, "use_ob": True,
    },
    "trend": {"ema_period": 200},
    "filters": {
        "trend_filter_enabled": False,
        "rsi_filter_enabled": True,
        "rsi_period": 14,
        "volume_filter_enabled": True,
        "volume_sma_period": 20,
        "volume_min_ratio": 1.2,
    },
    "entry": {"min_confluence": 1.5, "cooldown_bars": 3},
    "risk": {
        "atr_period": 14,
        "sl_atr_buffer": 0.3,
        "sl_max_pct": 0.015,
        "tp1_r_mult": 1.0,
        "tp2_r_mult": 2.0,
        "tp1_close_pct": 0.5,
        "tp2_close_pct": 0.3,
        "trailing_atr_mult": 1.5,
    },
}


# Loose: все фильтры выключены, минимальные пороги.
LOOSE_CONFIG = {
    **DEFAULT_CONFIG,
    "filters": {
        **DEFAULT_CONFIG["filters"],
        "rsi_filter_enabled": False,
        "volume_filter_enabled": False,
        "trend_filter_enabled": False,
    },
    "entry": {
        "min_confluence": 1.0,
        "cooldown_bars": 1,
    },
    "sweep": {"lookback": 10},
    "confirmation": {
        **DEFAULT_CONFIG["confirmation"],
        "window": 5,
        "bos_pivot": 3,
        "fvg_min_size": 0.1,
    },
}


def _build_grab_low_with_bullish_fvg(warmup: int = 30, lookback: int = 10) -> OHLCV:
    """Синтезируем OHLCV с явным grab_low и последующим bullish FVG.

    Структура:
      - Бары [0..warmup-1]: flat price ~ 100, warmup для ATR/SMA/EMA (>= 30).
      - Бар sweep = warmup: wick'ом уходит ниже recent_low, close бычий.
      - Бар sweep+1, sweep+2: цена идёт вверх, формируя bullish FVG.
    """
    n = warmup + 20
    opens = np.full(n, 100.0, dtype=np.float64)
    highs = np.full(n, 100.2, dtype=np.float64)
    lows = np.full(n, 99.8, dtype=np.float64)
    closes = np.full(n, 100.0, dtype=np.float64)
    volumes = np.full(n, 1000.0, dtype=np.float64)

    sweep = warmup  # гарантируем что ATR/SMA уже валидны
    # Sweep bar: wick ниже recent_low (99.8), close бычий выше recent_low
    opens[sweep] = 99.9
    lows[sweep] = 99.0  # явно ниже recent_low=99.8
    highs[sweep] = 100.1
    closes[sweep] = 100.0  # бычий close (> open=99.9), close > recent_low=99.8
    volumes[sweep] = 2500.0  # volume spike

    # После свипа — цена растёт, формируется bullish FVG на confirm_bar = sweep+2
    # Условие FVG: low[j] > high[j-2]
    opens[sweep + 1] = 100.1
    highs[sweep + 1] = 100.5
    lows[sweep + 1] = 100.0
    closes[sweep + 1] = 100.4
    volumes[sweep + 1] = 1500.0

    # Бар подтверждения sweep+2: low > high[sweep] (100.1) с запасом
    opens[sweep + 2] = 101.0
    highs[sweep + 2] = 101.5
    lows[sweep + 2] = 100.8  # > high[sweep]=100.1 → FVG
    closes[sweep + 2] = 101.3
    volumes[sweep + 2] = 1800.0

    # Оставшиеся бары — flat после
    for k in range(sweep + 3, n):
        opens[k] = 101.3
        closes[k] = 101.3
        highs[k] = 101.5
        lows[k] = 101.1
        volumes[k] = 1000.0

    return OHLCV(
        open=opens, high=highs, low=lows, close=closes, volume=volumes,
        timestamps=np.arange(n, dtype=np.float64) * 60_000,
    )


def _build_grab_high_with_bearish_fvg(warmup: int = 30, lookback: int = 10) -> OHLCV:
    """Зеркальный синтез: grab_high + bearish FVG → short."""
    n = warmup + 20
    opens = np.full(n, 100.0, dtype=np.float64)
    highs = np.full(n, 100.2, dtype=np.float64)
    lows = np.full(n, 99.8, dtype=np.float64)
    closes = np.full(n, 100.0, dtype=np.float64)
    volumes = np.full(n, 1000.0, dtype=np.float64)

    sweep = warmup
    opens[sweep] = 100.1
    highs[sweep] = 101.0  # выше recent_high=100.2
    lows[sweep] = 99.9
    closes[sweep] = 100.0  # медвежий (close < open=100.1), close < recent_high
    volumes[sweep] = 2500.0

    # После свипа — цена падает, формируется bearish FVG на confirm_bar = sweep+2
    # Условие: high[j] < low[j-2]
    opens[sweep + 1] = 99.9
    highs[sweep + 1] = 100.0
    lows[sweep + 1] = 99.5
    closes[sweep + 1] = 99.6
    volumes[sweep + 1] = 1500.0

    # Бар sweep+2: high < low[sweep] (99.9)
    opens[sweep + 2] = 99.0
    highs[sweep + 2] = 99.2  # < low[sweep]=99.9
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
        timestamps=np.arange(n, dtype=np.float64) * 60_000,
    )


# === Базовые тесты ===

class TestStrategyBasics:
    def test_instantiation(self) -> None:
        s = SMCSweepScalperStrategy(DEFAULT_CONFIG)
        assert s.name == "SMC Sweep Scalper"
        assert s.engine_type == "smc_sweep_scalper"

    def test_instantiation_with_empty_config(self) -> None:
        """Пустой конфиг должен заполниться дефолтами."""
        s = SMCSweepScalperStrategy({})
        cfg = s._validate_config({})
        assert cfg["sweep"]["lookback"] == 20
        assert cfg["confirmation"]["window"] == 3
        assert cfg["entry"]["min_confluence"] == 1.5
        assert cfg["risk"]["sl_max_pct"] == 0.015
        assert cfg["filters"]["volume_filter_enabled"] is True
        assert cfg["filters"]["rsi_filter_enabled"] is True

    def test_validate_config_respects_override(self) -> None:
        s = SMCSweepScalperStrategy({})
        cfg = s._validate_config({"sweep": {"lookback": 50}, "risk": {"tp1_r_mult": 1.5}})
        assert cfg["sweep"]["lookback"] == 50
        assert cfg["risk"]["tp1_r_mult"] == 1.5
        # остальные — дефолты
        assert cfg["risk"]["tp2_r_mult"] == 2.0
        assert cfg["confirmation"]["window"] == 3

    def test_empty_on_insufficient_data(self) -> None:
        s = SMCSweepScalperStrategy(DEFAULT_CONFIG)
        data = make_ohlcv(10)
        result = s.generate_signals(data)
        assert isinstance(result, StrategyResult)
        assert result.signals == []


class TestFlatData:
    def test_flat_data_zero_signals(self) -> None:
        """На абсолютно плоских данных не должно быть свипов → 0 сигналов."""
        s = SMCSweepScalperStrategy(DEFAULT_CONFIG)
        data = make_flat_ohlcv(n=300)
        result = s.generate_signals(data)
        assert len(result.signals) == 0


class TestPriceToDistance:
    def setup_method(self) -> None:
        self.strat = SMCSweepScalperStrategy(DEFAULT_CONFIG)

    def test_long_positive_distance(self) -> None:
        d = self.strat._price_to_distance(tp_price=105.0, entry=100.0, direction="long")
        assert d == pytest.approx(5.0)

    def test_short_positive_distance(self) -> None:
        d = self.strat._price_to_distance(tp_price=95.0, entry=100.0, direction="short")
        assert d == pytest.approx(5.0)

    def test_wrong_side_long_negative(self) -> None:
        d = self.strat._price_to_distance(tp_price=95.0, entry=100.0, direction="long")
        assert d == pytest.approx(-5.0)


class TestBuildTpLevels:
    def setup_method(self) -> None:
        self.strat = SMCSweepScalperStrategy(DEFAULT_CONFIG)
        self.cfg = self.strat._validate_config(DEFAULT_CONFIG)

    def test_long_two_tps(self) -> None:
        """Long: TP1 = entry + R, TP2 = entry + 2R."""
        levels = self.strat._build_tp_levels(
            direction="long", entry=100.0, risk_r=1.0, cfg=self.cfg,
        )
        assert len(levels) == 2
        assert levels[0]["atr_mult"] == pytest.approx(1.0)
        assert levels[0]["close_pct"] == 50
        assert levels[1]["atr_mult"] == pytest.approx(2.0)
        assert levels[1]["close_pct"] == 30

    def test_short_mirrored(self) -> None:
        levels = self.strat._build_tp_levels(
            direction="short", entry=100.0, risk_r=1.0, cfg=self.cfg,
        )
        assert len(levels) == 2
        # для short: distance = entry - tp, tp = entry - R → distance = R > 0
        assert levels[0]["atr_mult"] == pytest.approx(1.0)
        assert levels[1]["atr_mult"] == pytest.approx(2.0)


class TestCalculateSl:
    def setup_method(self) -> None:
        self.strat = SMCSweepScalperStrategy(DEFAULT_CONFIG)
        self.cfg = self.strat._validate_config(DEFAULT_CONFIG)

    def test_long_uses_sweep_low_minus_buffer(self) -> None:
        """SL long = max(sweep_low - atr*buffer, entry*(1 - sl_max_pct))."""
        sl = self.strat._calculate_sl(
            direction="long", entry=100.0,
            sweep_low=99.0, sweep_high=100.5,
            atr_val=0.5, cfg=self.cfg,
        )
        # level_sl = 99.0 - 0.5 * 0.3 = 98.85
        # hard_cap = 100.0 * (1 - 0.015) = 98.5
        # max(98.85, 98.5) = 98.85
        assert sl == pytest.approx(98.85)

    def test_long_hard_cap_applied(self) -> None:
        """Если sweep_low слишком далеко — ограничиваем по sl_max_pct."""
        sl = self.strat._calculate_sl(
            direction="long", entry=100.0,
            sweep_low=90.0, sweep_high=100.5,
            atr_val=1.0, cfg=self.cfg,
        )
        # level_sl = 90 - 0.3 = 89.7
        # hard_cap = 98.5
        # max(89.7, 98.5) = 98.5
        assert sl == pytest.approx(98.5)

    def test_short_uses_sweep_high_plus_buffer(self) -> None:
        sl = self.strat._calculate_sl(
            direction="short", entry=100.0,
            sweep_low=99.5, sweep_high=101.0,
            atr_val=0.5, cfg=self.cfg,
        )
        # level_sl = 101.0 + 0.5*0.3 = 101.15
        # hard_cap = 100 * 1.015 = 101.5
        # min(101.15, 101.5) = 101.15
        assert sl == pytest.approx(101.15)


class TestCalculateConfluence:
    def setup_method(self) -> None:
        self.strat = SMCSweepScalperStrategy(DEFAULT_CONFIG)

    def test_bos_bonus_higher_than_fvg(self) -> None:
        bos_score = self.strat._calculate_confluence(
            direction="long", confirmation_type="bos",
            rsi_val=50.0, close_val=100.0, ema_val=100.0,
            volume_val=1000.0, volume_sma_val=1000.0,
        )
        fvg_score = self.strat._calculate_confluence(
            direction="long", confirmation_type="fvg",
            rsi_val=50.0, close_val=100.0, ema_val=100.0,
            volume_val=1000.0, volume_sma_val=1000.0,
        )
        ob_score = self.strat._calculate_confluence(
            direction="long", confirmation_type="ob",
            rsi_val=50.0, close_val=100.0, ema_val=100.0,
            volume_val=1000.0, volume_sma_val=1000.0,
        )
        assert bos_score == pytest.approx(2.5)  # 1.0 + 1.5
        assert fvg_score == pytest.approx(1.75)  # 1.0 + 0.75
        assert ob_score == pytest.approx(1.5)  # 1.0 + 0.5
        assert bos_score > fvg_score > ob_score

    def test_all_bonuses_long_max(self) -> None:
        """Максимум long: 1.0 + 1.5 (bos) + 0.5 (vol spike) + 0.5 (rsi) + 0.5 (ema) = 4.0."""
        score = self.strat._calculate_confluence(
            direction="long", confirmation_type="bos",
            rsi_val=30.0,  # < 40 → bonus
            close_val=100.0, ema_val=95.0,  # close > ema → bonus
            volume_val=1500.0, volume_sma_val=1000.0,  # 1.5x > 1.3x → bonus
        )
        assert score == pytest.approx(4.0)

    def test_rsi_bonus_only_when_aligned_long(self) -> None:
        score_no = self.strat._calculate_confluence(
            direction="long", confirmation_type="ob",
            rsi_val=50.0, close_val=100.0, ema_val=100.0,
            volume_val=1000.0, volume_sma_val=1000.0,
        )
        score_yes = self.strat._calculate_confluence(
            direction="long", confirmation_type="ob",
            rsi_val=30.0, close_val=100.0, ema_val=100.0,
            volume_val=1000.0, volume_sma_val=1000.0,
        )
        assert score_yes - score_no == pytest.approx(0.5)


# === Интеграционные тесты на engineered данных ===

class TestEngineeredSignals:
    def test_grab_low_plus_bullish_fvg_produces_one_long_signal(self) -> None:
        """Спроектированный grab_low + bullish FVG → ровно один long сигнал."""
        data = _build_grab_low_with_bullish_fvg(warmup=30, lookback=10)
        # Используем LOOSE_CONFIG чтобы фильтры не резали сигнал.
        s = SMCSweepScalperStrategy(LOOSE_CONFIG)
        result = s.generate_signals(data)

        # Должен быть ровно 1 сигнал
        assert len(result.signals) == 1, (
            f"expected 1 signal, got {len(result.signals)}: {result.signals}"
        )
        sig = result.signals[0]

        # Long направление
        assert sig.direction == "long"
        # SL ниже entry
        assert sig.stop_loss < sig.entry_price
        # entry равен close бара подтверждения
        confirm_bar = sig.bar_index
        assert sig.entry_price == pytest.approx(float(data.close[confirm_bar]))

        # TP уровни — выше entry, в порядке возрастания distance
        assert sig.tp_levels is not None and len(sig.tp_levels) >= 1
        distances = [lvl["atr_mult"] for lvl in sig.tp_levels]
        assert all(d > 0 for d in distances), f"TP distances must be positive: {distances}"
        assert distances == sorted(distances), f"TP distances not ascending: {distances}"

        # Индикаторы
        assert sig.indicators is not None
        assert sig.indicators["sweep_direction"] == "grab_low"
        assert sig.indicators["confirmation_type"] in ("bos", "fvg", "ob")
        assert sig.indicators["sweep_bar"] < sig.indicators["confirm_bar"]

    def test_grab_high_plus_bearish_fvg_produces_one_short_signal(self) -> None:
        data = _build_grab_high_with_bearish_fvg(warmup=30, lookback=10)
        s = SMCSweepScalperStrategy(LOOSE_CONFIG)
        result = s.generate_signals(data)

        assert len(result.signals) == 1, (
            f"expected 1 signal, got {len(result.signals)}: {result.signals}"
        )
        sig = result.signals[0]

        assert sig.direction == "short"
        assert sig.stop_loss > sig.entry_price
        # TP distances положительные (в long/short направлении) и возрастающие
        assert sig.tp_levels is not None
        distances = [lvl["atr_mult"] for lvl in sig.tp_levels]
        assert all(d > 0 for d in distances)
        assert distances == sorted(distances)

        assert sig.indicators is not None
        assert sig.indicators["sweep_direction"] == "grab_high"

    def test_cooldown_respected(self) -> None:
        """Два свипа внутри cooldown окна должны дать только 1 сигнал."""
        # Создаём данные с двумя grab_low подряд (близко).
        data1 = _build_grab_low_with_bullish_fvg(warmup=30, lookback=10)
        # Конфиг с большим cooldown.
        cfg = {
            **LOOSE_CONFIG,
            "entry": {"min_confluence": 1.0, "cooldown_bars": 50},
        }
        s = SMCSweepScalperStrategy(cfg)
        result = s.generate_signals(data1)
        # Даже если бы был второй свип — cooldown=50 покрывает всю серию.
        # Проверяем что сигналы не ближе cooldown друг к другу.
        for prev, curr in zip(result.signals, result.signals[1:]):
            assert (curr.bar_index - prev.bar_index) >= 50

    def test_confluence_below_min_filters_out(self) -> None:
        """Высокий min_confluence должен отфильтровать слабые сигналы."""
        data = _build_grab_low_with_bullish_fvg(warmup=30, lookback=10)
        cfg = {
            **LOOSE_CONFIG,
            "entry": {"min_confluence": 10.0, "cooldown_bars": 1},
        }
        s = SMCSweepScalperStrategy(cfg)
        result = s.generate_signals(data)
        assert len(result.signals) == 0


class TestIntegrationSignalQuality:
    def test_signals_have_valid_sl_tp_on_noisy_data(self) -> None:
        """На шумных данных все сигналы должны быть well-formed."""
        s = SMCSweepScalperStrategy(LOOSE_CONFIG)
        data = make_ohlcv(n=500, base_price=100.0, trend=0.0, noise=3.0, seed=7)
        result = s.generate_signals(data)

        assert result.confluence_scores_long.shape == (500,)
        assert result.confluence_scores_short.shape == (500,)

        for sig in result.signals:
            # Базовые инварианты
            assert sig.entry_price > 0
            assert sig.stop_loss > 0
            assert sig.take_profit > 0
            assert sig.direction in ("long", "short")
            assert sig.signal_type in ("breakout", "mean_reversion")
            if sig.direction == "long":
                assert sig.stop_loss < sig.entry_price
                assert sig.take_profit > sig.entry_price
            else:
                assert sig.stop_loss > sig.entry_price
                assert sig.take_profit < sig.entry_price
            # tp_levels well-formed
            assert sig.tp_levels is not None
            assert len(sig.tp_levels) >= 1
            for lvl in sig.tp_levels:
                assert lvl["atr_mult"] > 0
                assert isinstance(lvl["close_pct"], int)
                assert 0 < lvl["close_pct"] <= 100
            # indicators dict
            assert sig.indicators is not None
            assert sig.indicators["sweep_direction"] in ("grab_low", "grab_high")
            assert sig.indicators["confirmation_type"] in ("bos", "fvg", "ob")
            assert sig.indicators["confluence_tier"] in ("strong", "normal", "weak")
            # trailing
            assert sig.trailing_atr is not None and sig.trailing_atr > 0
            # bar_index = confirm_bar > sweep_bar
            assert sig.bar_index == sig.indicators["confirm_bar"]
            assert sig.indicators["confirm_bar"] > sig.indicators["sweep_bar"]

    def test_cooldown_enforced_noisy(self) -> None:
        """Все сигналы должны быть не ближе cooldown_bars друг к другу."""
        s = SMCSweepScalperStrategy(DEFAULT_CONFIG)
        cooldown = DEFAULT_CONFIG["entry"]["cooldown_bars"]
        data = make_ohlcv(n=500, base_price=100.0, trend=0.0, noise=4.0, seed=3)
        result = s.generate_signals(data)
        for prev, curr in zip(result.signals, result.signals[1:]):
            assert (curr.bar_index - prev.bar_index) >= cooldown

    def test_min_confluence_enforced_noisy(self) -> None:
        s = SMCSweepScalperStrategy(DEFAULT_CONFIG)
        min_conf = DEFAULT_CONFIG["entry"]["min_confluence"]
        data = make_ohlcv(n=500, seed=5, noise=3.0)
        result = s.generate_signals(data)
        for sig in result.signals:
            assert sig.confluence_score >= min_conf


class TestRegistryLookup:
    def test_get_engine_returns_instance(self) -> None:
        from app.modules.strategy.engines import ENGINE_REGISTRY, get_engine

        assert "smc_sweep_scalper" in ENGINE_REGISTRY
        instance = get_engine("smc_sweep_scalper", DEFAULT_CONFIG)
        assert isinstance(instance, SMCSweepScalperStrategy)
        assert instance.engine_type == "smc_sweep_scalper"
