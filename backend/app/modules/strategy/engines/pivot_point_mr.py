"""PivotPointMeanReversion — mean reversion стратегия на rolling pivot S/R.

Inspired by Rubicon BotMarket WLD Pivot Point S/R (winner of 36-bot AI competition).
Closes original weaknesses: regime detection, multi-zone entries, multi-TP,
noise filters (deadzone, cooldown, RSI, anti-impulse).

Zero-impact design: не модифицирует существующие модули.
См. спек: docs/superpowers/specs/2026-04-13-pivot-point-mean-reversion-design.md
"""

from __future__ import annotations

from typing import Any

import numpy as np
from numpy.typing import NDArray

from app.modules.strategy.engines.base import (
    OHLCV,
    BaseStrategy,
    Signal,
    StrategyResult,
)
from app.modules.strategy.engines.indicators.oscillators import squeeze_momentum
from app.modules.strategy.engines.indicators.pivot import pivot_velocity, rolling_pivot
from app.modules.strategy.engines.indicators.trend import atr, dmi, ema, rsi, sma


# Режимы рынка
REGIME_RANGE = 0
REGIME_WEAK_TREND = 1
REGIME_STRONG_TREND = 2

_REGIME_NAMES = {
    REGIME_RANGE: "range",
    REGIME_WEAK_TREND: "weak_trend",
    REGIME_STRONG_TREND: "strong_trend",
}


class PivotPointMeanReversion(BaseStrategy):
    """Mean reversion стратегия на pivot S/R уровнях."""

    @property
    def name(self) -> str:
        return "Pivot Point Mean Reversion"

    @property
    def engine_type(self) -> str:
        return "pivot_point_mr"

    def _validate_config(self, raw: dict) -> dict:
        """Заполнить отсутствующие ключи дефолтами. Все optional."""
        pivot_cfg = raw.get("pivot", {}) or {}
        trend_cfg = raw.get("trend", {}) or {}
        regime_cfg = raw.get("regime", {}) or {}
        entry_cfg = raw.get("entry", {}) or {}
        filters_cfg = raw.get("filters", {}) or {}
        risk_cfg = raw.get("risk", {}) or {}

        return {
            "pivot": {
                "period": int(pivot_cfg.get("period", 48)),
                "velocity_lookback": int(pivot_cfg.get("velocity_lookback", 12)),
            },
            "trend": {
                "ema_period": int(trend_cfg.get("ema_period", 200)),
            },
            "regime": {
                "adx_weak_trend": float(regime_cfg.get("adx_weak_trend", 20)),
                "adx_strong_trend": float(regime_cfg.get("adx_strong_trend", 30)),
                "pivot_drift_max": float(regime_cfg.get("pivot_drift_max", 0.3)),
                "allow_strong_trend": bool(regime_cfg.get("allow_strong_trend", False)),
            },
            "entry": {
                "min_distance_pct": float(entry_cfg.get("min_distance_pct", 0.15)),
                "min_confluence": float(entry_cfg.get("min_confluence", 1.5)),
                "use_deep_levels": bool(entry_cfg.get("use_deep_levels", True)),
                "cooldown_bars": int(entry_cfg.get("cooldown_bars", 3)),
                "impulse_check_bars": int(entry_cfg.get("impulse_check_bars", 5)),
            },
            "filters": {
                "adx_enabled": bool(filters_cfg.get("adx_enabled", True)),
                "adx_period": int(filters_cfg.get("adx_period", 14)),
                "rsi_enabled": bool(filters_cfg.get("rsi_enabled", True)),
                "rsi_period": int(filters_cfg.get("rsi_period", 14)),
                "rsi_oversold": float(filters_cfg.get("rsi_oversold", 40)),
                "rsi_overbought": float(filters_cfg.get("rsi_overbought", 60)),
                "squeeze_enabled": bool(filters_cfg.get("squeeze_enabled", True)),
                "squeeze_bb_len": int(filters_cfg.get("squeeze_bb_len", 20)),
                "squeeze_bb_mult": float(filters_cfg.get("squeeze_bb_mult", 2.0)),
                "squeeze_kc_len": int(filters_cfg.get("squeeze_kc_len", 20)),
                "squeeze_kc_mult": float(filters_cfg.get("squeeze_kc_mult", 1.5)),
                "volume_filter_enabled": bool(filters_cfg.get("volume_filter_enabled", False)),
                "volume_sma_period": int(filters_cfg.get("volume_sma_period", 20)),
                "volume_min_ratio": float(filters_cfg.get("volume_min_ratio", 1.2)),
            },
            "risk": {
                "sl_atr_mult": float(risk_cfg.get("sl_atr_mult", 0.5)),
                "sl_max_pct": float(risk_cfg.get("sl_max_pct", 0.02)),
                "atr_period": int(risk_cfg.get("atr_period", 14)),
                "tp1_close_pct": float(risk_cfg.get("tp1_close_pct", 0.6)),
                "tp2_close_pct": float(risk_cfg.get("tp2_close_pct", 0.4)),
                "trailing_atr_mult": float(risk_cfg.get("trailing_atr_mult", 1.5)),
                "max_hold_bars": int(risk_cfg.get("max_hold_bars", 60)),  # MVP: no-op
            },
        }

    def _detect_regime(self, adx_val: float, pv_val: float, cfg: dict) -> int:
        """Определить текущий рыночный режим.

        RANGE (0)          — ADX < adx_weak_trend и нет дрейфа pivot
        WEAK_TREND (1)     — ADX между weak/strong или pivot дрейфует
        STRONG_TREND (2)   — ADX > adx_strong_trend

        NaN ADX → RANGE (безопасное значение по умолчанию).
        """
        if np.isnan(adx_val):
            return REGIME_RANGE

        regime = REGIME_RANGE
        if adx_val > cfg["regime"]["adx_strong_trend"]:
            regime = REGIME_STRONG_TREND
        elif adx_val > cfg["regime"]["adx_weak_trend"]:
            regime = REGIME_WEAK_TREND

        # Pivot drift override: если pivot сам ползёт — рынок трендовый
        if not np.isnan(pv_val) and abs(pv_val) > cfg["regime"]["pivot_drift_max"]:
            regime = max(regime, REGIME_WEAK_TREND)

        return regime

    def _detect_zone(
        self,
        close_val: float,
        pivot_val: float,
        s1: float,
        s2: float,
        r1: float,
        r2: float,
    ) -> tuple[str, int] | None:
        """Определить зону входа по положению цены относительно pivot и S/R.

        LONG зоны (цена ниже pivot):
            ZONE_1: s1 <= close < pivot       — стандартная глубина
            ZONE_2: s2 <= close < s1          — глубокая
            ZONE_3: close < s2                — экстремальная

        SHORT зоны зеркально относительно r1/r2.

        Returns: (direction, zone) или None если цена ровно на pivot.
        """
        if close_val < pivot_val:
            if s1 <= close_val < pivot_val:
                return ("long", 1)
            if s2 <= close_val < s1:
                return ("long", 2)
            if close_val < s2:
                return ("long", 3)
        elif close_val > pivot_val:
            if pivot_val < close_val <= r1:
                return ("short", 1)
            if r1 < close_val <= r2:
                return ("short", 2)
            if close_val > r2:
                return ("short", 3)
        return None

    @staticmethod
    def _price_to_distance(tp_price: float, entry: float, direction: str) -> float:
        """Конвертировать абсолютную TP цену в raw distance для Signal.tp_levels.

        ВАЖНО: поле `atr_mult` в Signal.tp_levels исторически названо,
        но backtest_engine.py:299 использует его как raw price distance:
            tp_price = entry + atr_dist  (long)
            tp_price = entry - atr_dist  (short)
        """
        if direction == "long":
            return tp_price - entry
        return entry - tp_price  # short

    def _build_tp_levels(
        self,
        direction: str,
        zone: int,
        entry: float,
        pivot: float,
        s1: float,
        s2: float,
        s3: float,
        r1: float,
        r2: float,
        r3: float,
        cfg: dict,
    ) -> list[dict]:
        """Построить список tp_levels в формате платформы.

        Распределение по зонам:
            ZONE 1: [TP1=pivot (tp1_pct), TP2=r1/s1 (tp2_pct)]
            ZONE 2: [TP1=s1/r1 (40%), TP2=pivot (40%), TP3=r1/s1 (20%)]
            ZONE 3: [TP1=s2/r2 (30%), TP2=s1/r1 (30%), TP3=pivot (30%), TP4=r1/s1 (10%)]

        ZONE 1 percentages — из config (tp1_close_pct, tp2_close_pct).
        ZONE 2/3 percentages — hardcoded (см. спек).
        Фильтрует уровни с NaN или неправильной стороной от entry.
        """
        tp1_pct = int(cfg["risk"]["tp1_close_pct"] * 100)
        tp2_pct = int(cfg["risk"]["tp2_close_pct"] * 100)

        if direction == "long":
            if zone == 1:
                tp_prices = [(pivot, tp1_pct), (r1, tp2_pct)]
            elif zone == 2:
                tp_prices = [(s1, 40), (pivot, 40), (r1, 20)]
            else:  # zone 3
                tp_prices = [(s2, 30), (s1, 30), (pivot, 30), (r1, 10)]
        else:  # short
            if zone == 1:
                tp_prices = [(pivot, tp1_pct), (s1, tp2_pct)]
            elif zone == 2:
                tp_prices = [(r1, 40), (pivot, 40), (s1, 20)]
            else:  # zone 3
                tp_prices = [(r2, 30), (r1, 30), (pivot, 30), (s1, 10)]

        levels: list[dict] = []
        for tp_price, close_pct in tp_prices:
            if np.isnan(tp_price):
                continue
            atr_dist = self._price_to_distance(tp_price, entry, direction)
            if atr_dist <= 0:  # TP на неправильной стороне
                continue
            levels.append({"atr_mult": float(atr_dist), "close_pct": int(close_pct)})
        return levels

    def _calculate_sl(
        self,
        direction: str,
        zone: int,
        entry: float,
        atr_val: float,
        s1: float,
        s2: float,
        s3: float,
        r1: float,
        r2: float,
        r3: float,
        cfg: dict,
        regime: int,
    ) -> float:
        """SL привязан к зональному S/R уровню + ATR buffer с hard cap по %.

        LONG:  SL = max(level_sl - atr*sl_atr_mult, entry*(1 - sl_max_pct))
        SHORT: SL = min(level_sl + atr*sl_atr_mult, entry*(1 + sl_max_pct))

        В STRONG_TREND (если разрешён) sl_max_pct умножается на 1.5.
        """
        sl_atr = cfg["risk"]["sl_atr_mult"]
        sl_max = cfg["risk"]["sl_max_pct"]
        if regime == REGIME_STRONG_TREND:
            sl_max *= 1.5

        if direction == "long":
            level_map = {1: s1, 2: s2, 3: s3}
            level = level_map[zone]
            level_sl = level - atr_val * sl_atr
            hard_cap = entry * (1.0 - sl_max)
            return max(level_sl, hard_cap)
        else:  # short
            level_map = {1: r1, 2: r2, 3: r3}
            level = level_map[zone]
            level_sl = level + atr_val * sl_atr
            hard_cap = entry * (1.0 + sl_max)
            return min(level_sl, hard_cap)

    def _calculate_confluence(
        self,
        zone: int,
        direction: str,
        regime: int,
        rsi_val: float,
        squeeze: bool,
        close_val: float,
        ema_val: float,
        volume_val: float,
        volume_sma_val: float,
        cfg: dict,
    ) -> float:
        """Confluence score для сигнала. Минимум 1.0 (базовый), максимум ~5.0.

        Breakdown:
            +1.0  базовый сигнал (валидная зона)
            +1.0  ZONE 2
            +1.5  ZONE 3
            +0.5  regime == RANGE (низкий ADX — идеал для mean reversion)
            +0.5  RSI подтверждает (oversold для long, overbought для short)
            +0.5  Squeeze ON (сжатие BB в Keltner)
            +0.5  Volume > SMA * 1.2
            +0.5  Направление сигнала совпадает с EMA trend
        """
        score = 1.0

        # Глубина зоны
        if zone == 2:
            score += 1.0
        elif zone == 3:
            score += 1.5

        # Range regime
        if regime == REGIME_RANGE:
            score += 0.5

        # RSI подтверждение
        if not np.isnan(rsi_val):
            if direction == "long" and rsi_val < cfg["filters"]["rsi_oversold"]:
                score += 0.5
            elif direction == "short" and rsi_val > cfg["filters"]["rsi_overbought"]:
                score += 0.5

        # Squeeze ON
        if squeeze:
            score += 0.5

        # Повышенный объём (фиксированный порог 1.2x, не из config)
        if volume_sma_val > 0 and volume_val > volume_sma_val * 1.2:
            score += 0.5

        # EMA trend alignment
        if not np.isnan(ema_val):
            if direction == "long" and close_val > ema_val:
                score += 0.5
            elif direction == "short" and close_val < ema_val:
                score += 0.5

        return score

    def generate_signals(self, data: OHLCV) -> StrategyResult:
        """Главный метод — проход по барам с фильтрами и генерацией сигналов."""
        cfg = self._validate_config(self.config)
        n = len(data)
        empty_arr = np.zeros(n, dtype=np.float64)
        empty_result = StrategyResult(
            signals=[],
            confluence_scores_long=empty_arr.copy(),
            confluence_scores_short=empty_arr.copy(),
            knn_scores=empty_arr.copy(),
            knn_classes=empty_arr.copy(),
            knn_confidence=empty_arr.copy(),
        )

        if n < cfg["pivot"]["period"] + cfg["trend"]["ema_period"] // 4:
            return empty_result

        # === Фаза 0: расчёт всех индикаторов ===
        pivot, r1, s1, r2, s2, r3, s3 = rolling_pivot(
            data.high, data.low, data.close, cfg["pivot"]["period"]
        )
        pv = pivot_velocity(pivot, cfg["pivot"]["velocity_lookback"])

        atr_arr = atr(data.high, data.low, data.close, cfg["risk"]["atr_period"])
        _, _, adx_arr = dmi(data.high, data.low, data.close, cfg["filters"]["adx_period"])
        ema_arr = ema(data.close, cfg["trend"]["ema_period"])
        rsi_arr = rsi(data.close, cfg["filters"]["rsi_period"])
        volume_sma = sma(data.volume, cfg["filters"]["volume_sma_period"])

        squeeze_on, _, _ = squeeze_momentum(
            data.high, data.low, data.close,
            bb_period=cfg["filters"]["squeeze_bb_len"],
            bb_mult=cfg["filters"]["squeeze_bb_mult"],
            kc_period=cfg["filters"]["squeeze_kc_len"],
            kc_mult=cfg["filters"]["squeeze_kc_mult"],
        )

        # Дистанция цены от pivot в %
        distance_pct = np.full(n, np.nan, dtype=np.float64)
        valid_pivot = (pivot > 0) & ~np.isnan(pivot)
        distance_pct[valid_pivot] = (
            (data.close[valid_pivot] - pivot[valid_pivot]) / pivot[valid_pivot] * 100.0
        )

        # Per-bar confluence arrays (для UI overlay)
        conf_long = np.zeros(n, dtype=np.float64)
        conf_short = np.zeros(n, dtype=np.float64)

        signals: list[Signal] = []
        last_signal_bar = -10_000

        # === Главный цикл ===
        for i in range(cfg["pivot"]["period"], n):
            pivot_val = pivot[i]
            if np.isnan(pivot_val):
                continue

            atr_val = atr_arr[i]
            if np.isnan(atr_val) or atr_val < 1e-8:
                continue

            close_val = float(data.close[i])
            distance = distance_pct[i]

            # Фильтр: deadzone (минимальное отклонение от pivot)
            if np.isnan(distance) or abs(distance) < cfg["entry"]["min_distance_pct"]:
                continue

            # Определение зоны
            zone_result = self._detect_zone(
                close_val=close_val,
                pivot_val=float(pivot_val),
                s1=float(s1[i]), s2=float(s2[i]),
                r1=float(r1[i]), r2=float(r2[i]),
            )
            if zone_result is None:
                continue
            direction, zone = zone_result

            # Regime detection
            regime = self._detect_regime(
                adx_val=float(adx_arr[i]),
                pv_val=float(pv[i]),
                cfg=cfg,
            )

            # STRONG_TREND gate
            if regime == REGIME_STRONG_TREND:
                if not cfg["regime"]["allow_strong_trend"]:
                    continue
                # Если разрешён — только по тренду
                ema_val = ema_arr[i]
                if np.isnan(ema_val):
                    continue
                if direction == "long" and close_val <= ema_val:
                    continue
                if direction == "short" and close_val >= ema_val:
                    continue

            # WEAK_TREND: только по тренду
            if regime == REGIME_WEAK_TREND:
                ema_val = ema_arr[i]
                if np.isnan(ema_val):
                    continue
                if direction == "long" and close_val <= ema_val:
                    continue
                if direction == "short" and close_val >= ema_val:
                    continue

            # Фильтр: RSI
            if cfg["filters"]["rsi_enabled"]:
                rsi_val = rsi_arr[i]
                if np.isnan(rsi_val):
                    continue
                if direction == "long" and rsi_val >= cfg["filters"]["rsi_oversold"]:
                    continue
                if direction == "short" and rsi_val <= cfg["filters"]["rsi_overbought"]:
                    continue

            # Фильтр: volume
            if cfg["filters"]["volume_filter_enabled"]:
                vol_sma = volume_sma[i]
                if np.isnan(vol_sma) or vol_sma <= 0:
                    continue
                if data.volume[i] < vol_sma * cfg["filters"]["volume_min_ratio"]:
                    continue

            # Фильтр: cooldown
            if (i - last_signal_bar) < cfg["entry"]["cooldown_bars"]:
                continue

            # Фильтр: anti-impulse (не ловим падающий нож)
            window = cfg["entry"]["impulse_check_bars"]
            if i >= window:
                last_bars = data.close[i - window + 1:i + 1] - data.open[i - window + 1:i + 1]
                if direction == "long" and np.all(last_bars < 0):
                    continue
                if direction == "short" and np.all(last_bars > 0):
                    continue

            # Confluence
            score = self._calculate_confluence(
                zone=zone,
                direction=direction,
                regime=regime,
                rsi_val=float(rsi_arr[i]),
                squeeze=bool(squeeze_on[i]) if cfg["filters"]["squeeze_enabled"] else False,
                close_val=close_val,
                ema_val=float(ema_arr[i]) if not np.isnan(ema_arr[i]) else float("nan"),
                volume_val=float(data.volume[i]),
                volume_sma_val=float(volume_sma[i]) if not np.isnan(volume_sma[i]) else 0.0,
                cfg=cfg,
            )

            if direction == "long":
                conf_long[i] = score
            else:
                conf_short[i] = score

            if score < cfg["entry"]["min_confluence"]:
                continue

            # Build SL
            sl = self._calculate_sl(
                direction=direction, zone=zone, entry=close_val, atr_val=float(atr_val),
                s1=float(s1[i]), s2=float(s2[i]), s3=float(s3[i]),
                r1=float(r1[i]), r2=float(r2[i]), r3=float(r3[i]),
                cfg=cfg, regime=regime,
            )

            # Build TP levels
            tp_levels = self._build_tp_levels(
                direction=direction, zone=zone, entry=close_val,
                pivot=float(pivot_val),
                s1=float(s1[i]), s2=float(s2[i]), s3=float(s3[i]),
                r1=float(r1[i]), r2=float(r2[i]), r3=float(r3[i]),
                cfg=cfg,
            )
            if not tp_levels:
                continue  # нет валидных TP — пропускаем сигнал

            # Первая TP цена для legacy поля Signal.take_profit
            first_tp_price = (
                close_val + tp_levels[0]["atr_mult"]
                if direction == "long"
                else close_val - tp_levels[0]["atr_mult"]
            )

            # Confluence tier для UI
            if score >= 4.0:
                tier = "strong"
            elif score >= 2.5:
                tier = "normal"
            else:
                tier = "weak"

            signal = Signal(
                bar_index=i,
                direction=direction,
                entry_price=close_val,
                stop_loss=float(sl),
                take_profit=float(first_tp_price),
                trailing_atr=float(atr_val * cfg["risk"]["trailing_atr_mult"]),
                confluence_score=float(score),
                signal_type="mean_reversion",
                tp_levels=tp_levels,
                indicators={
                    "pivot": float(pivot_val),
                    "s1": float(s1[i]), "s2": float(s2[i]), "s3": float(s3[i]),
                    "r1": float(r1[i]), "r2": float(r2[i]), "r3": float(r3[i]),
                    "zone": int(zone),
                    "regime": _REGIME_NAMES[regime],
                    "rsi": float(rsi_arr[i]) if not np.isnan(rsi_arr[i]) else 0.0,
                    "adx": float(adx_arr[i]) if not np.isnan(adx_arr[i]) else 0.0,
                    "distance_pct": float(distance),
                    "pivot_velocity": float(pv[i]) if not np.isnan(pv[i]) else 0.0,
                    "squeeze_on": bool(squeeze_on[i]),
                    "confluence_tier": tier,
                },
            )
            signals.append(signal)
            last_signal_bar = i

        return StrategyResult(
            signals=signals,
            confluence_scores_long=conf_long,
            confluence_scores_short=conf_short,
            knn_scores=empty_arr.copy(),
            knn_classes=empty_arr.copy(),
            knn_confidence=empty_arr.copy(),
        )
