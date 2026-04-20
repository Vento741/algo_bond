"""SMCSweepScalperStrategy — скальпер на liquidity sweeps с SMC-подтверждением.

Идея: после ложного пробоя локального high/low (liquidity grab)
умные деньги часто разворачивают цену. Сигнал возникает на баре,
где в окне подтверждения (confirmation_window) после свипа появляется
структурный сигнал — Break of Structure, Fair Value Gap или Order Block.

Target: 5-10 signals/day/symbol на TF=5m.
Zero-impact design: не модифицирует существующие модули.
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
from app.modules.strategy.engines.indicators.smc import (
    break_of_structure,
    fair_value_gaps,
    liquidity_sweeps,
    order_blocks,
)
from app.modules.strategy.engines.indicators.trend import atr, ema, rsi, sma


class SMCSweepScalperStrategy(BaseStrategy):
    """SMC liquidity sweep scalper для крипто-фьючерсов."""

    @property
    def name(self) -> str:
        return "SMC Sweep Scalper"

    @property
    def engine_type(self) -> str:
        return "smc_sweep_scalper"

    def _validate_config(self, raw: dict) -> dict:
        """Заполнить отсутствующие ключи дефолтами. Все optional."""
        sweep_cfg = raw.get("sweep", {}) or {}
        confirm_cfg = raw.get("confirmation", {}) or {}
        trend_cfg = raw.get("trend", {}) or {}
        filters_cfg = raw.get("filters", {}) or {}
        entry_cfg = raw.get("entry", {}) or {}
        risk_cfg = raw.get("risk", {}) or {}

        return {
            "sweep": {
                "lookback": int(sweep_cfg.get("lookback", 20)),
            },
            "confirmation": {
                "window": int(confirm_cfg.get("window", 3)),
                "fvg_min_size": float(confirm_cfg.get("fvg_min_size", 0.3)),
                "bos_pivot": int(confirm_cfg.get("bos_pivot", 5)),
                "use_bos": bool(confirm_cfg.get("use_bos", True)),
                "use_fvg": bool(confirm_cfg.get("use_fvg", True)),
                "use_ob": bool(confirm_cfg.get("use_ob", True)),
            },
            "trend": {
                "ema_period": int(trend_cfg.get("ema_period", 200)),
            },
            "filters": {
                "trend_filter_enabled": bool(filters_cfg.get("trend_filter_enabled", False)),
                "rsi_filter_enabled": bool(filters_cfg.get("rsi_filter_enabled", True)),
                "rsi_period": int(filters_cfg.get("rsi_period", 14)),
                "volume_filter_enabled": bool(filters_cfg.get("volume_filter_enabled", True)),
                "volume_sma_period": int(filters_cfg.get("volume_sma_period", 20)),
                "volume_min_ratio": float(filters_cfg.get("volume_min_ratio", 1.2)),
            },
            "entry": {
                "min_confluence": float(entry_cfg.get("min_confluence", 1.5)),
                "cooldown_bars": int(entry_cfg.get("cooldown_bars", 3)),
            },
            "risk": {
                "atr_period": int(risk_cfg.get("atr_period", 14)),
                "sl_atr_buffer": float(risk_cfg.get("sl_atr_buffer", 0.3)),
                "sl_max_pct": float(risk_cfg.get("sl_max_pct", 0.015)),
                "tp1_r_mult": float(risk_cfg.get("tp1_r_mult", 1.0)),
                "tp2_r_mult": float(risk_cfg.get("tp2_r_mult", 2.0)),
                "tp1_close_pct": float(risk_cfg.get("tp1_close_pct", 0.5)),
                "tp2_close_pct": float(risk_cfg.get("tp2_close_pct", 0.3)),
                "trailing_atr_mult": float(risk_cfg.get("trailing_atr_mult", 1.5)),
            },
        }

    @staticmethod
    def _price_to_distance(tp_price: float, entry: float, direction: str) -> float:
        """Конвертировать абсолютную TP цену в raw distance для Signal.tp_levels.

        Поле `atr_mult` в Signal.tp_levels исторически названо,
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
        entry: float,
        risk_r: float,
        cfg: dict,
    ) -> list[dict]:
        """Построить multi-TP levels на основе R-multiple.

        Распределение:
            TP1 = entry ± R * tp1_r_mult, close tp1_close_pct
            TP2 = entry ± R * tp2_r_mult, close tp2_close_pct
            Runner = остаток через trailing_atr
        """
        tp1_pct = int(round(cfg["risk"]["tp1_close_pct"] * 100))
        tp2_pct = int(round(cfg["risk"]["tp2_close_pct"] * 100))

        if direction == "long":
            tp1_price = entry + risk_r * cfg["risk"]["tp1_r_mult"]
            tp2_price = entry + risk_r * cfg["risk"]["tp2_r_mult"]
        else:
            tp1_price = entry - risk_r * cfg["risk"]["tp1_r_mult"]
            tp2_price = entry - risk_r * cfg["risk"]["tp2_r_mult"]

        levels: list[dict] = []
        for tp_price, close_pct in [(tp1_price, tp1_pct), (tp2_price, tp2_pct)]:
            atr_dist = self._price_to_distance(tp_price, entry, direction)
            if atr_dist <= 0:
                continue
            levels.append({"atr_mult": float(atr_dist), "close_pct": int(close_pct)})
        return levels

    def _calculate_sl(
        self,
        direction: str,
        entry: float,
        sweep_low: float,
        sweep_high: float,
        atr_val: float,
        cfg: dict,
    ) -> float:
        """SL привязан к экстремуму свип-бара + ATR buffer с hard cap по %.

        LONG:  SL = max(sweep_low - atr*sl_atr_buffer, entry*(1 - sl_max_pct))
        SHORT: SL = min(sweep_high + atr*sl_atr_buffer, entry*(1 + sl_max_pct))
        """
        buf = cfg["risk"]["sl_atr_buffer"]
        max_pct = cfg["risk"]["sl_max_pct"]

        if direction == "long":
            level_sl = sweep_low - atr_val * buf
            hard_cap = entry * (1.0 - max_pct)
            return max(level_sl, hard_cap)
        else:
            level_sl = sweep_high + atr_val * buf
            hard_cap = entry * (1.0 + max_pct)
            return min(level_sl, hard_cap)

    def _calculate_confluence(
        self,
        direction: str,
        confirmation_type: str,
        rsi_val: float,
        close_val: float,
        ema_val: float,
        volume_val: float,
        volume_sma_val: float,
    ) -> float:
        """Confluence score для сигнала. Минимум 1.0 (базовый), максимум ~5.0.

        Breakdown:
            +1.0  базовый (sweep + любое подтверждение)
            +1.5  BOS подтверждение (сильнейшее структурное)
            +0.75 FVG подтверждение
            +0.5  OB подтверждение
            +0.5  volume spike (volume > sma * 1.3)
            +0.5  RSI aligned (< 40 для long, > 60 для short)
            +0.5  EMA trend aligned
        """
        score = 1.0

        # Тип подтверждения — взаимоисключающие бонусы
        if confirmation_type == "bos":
            score += 1.5
        elif confirmation_type == "fvg":
            score += 0.75
        elif confirmation_type == "ob":
            score += 0.5

        # Volume spike на свип-баре
        if volume_sma_val > 0 and volume_val > volume_sma_val * 1.3:
            score += 0.5

        # RSI aligned на свип-баре
        if not np.isnan(rsi_val):
            if direction == "long" and rsi_val < 40.0:
                score += 0.5
            elif direction == "short" and rsi_val > 60.0:
                score += 0.5

        # EMA trend aligned на баре подтверждения
        if not np.isnan(ema_val):
            if direction == "long" and close_val > ema_val:
                score += 0.5
            elif direction == "short" and close_val < ema_val:
                score += 0.5

        return score

    def generate_signals(self, data: OHLCV) -> StrategyResult:
        """Главный метод — проход по барам с детекцией свипов и поиском подтверждения."""
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

        min_required = max(
            cfg["sweep"]["lookback"] + 2,
            cfg["risk"]["atr_period"] + 2,
            cfg["confirmation"]["bos_pivot"] * 2 + 2,
        )
        if n < min_required:
            return empty_result

        # === Фаза 0: расчёт индикаторов (один раз, векторно) ===
        atr_arr = atr(data.high, data.low, data.close, cfg["risk"]["atr_period"])
        ema_arr = ema(data.close, cfg["trend"]["ema_period"])
        rsi_arr = rsi(data.close, cfg["filters"]["rsi_period"])
        volume_sma = sma(data.volume, cfg["filters"]["volume_sma_period"])

        grab_high, grab_low = liquidity_sweeps(
            data.high, data.low, data.open, data.close,
            lookback=cfg["sweep"]["lookback"],
        )
        bull_fvg, bear_fvg = fair_value_gaps(
            data.high, data.low, atr_arr,
            fvg_min_size=cfg["confirmation"]["fvg_min_size"],
        )
        bull_ob, bear_ob = order_blocks(data.open, data.close, data.high, data.low)
        bull_bos, bear_bos = break_of_structure(
            data.high, data.low, data.close,
            pivot_len=cfg["confirmation"]["bos_pivot"],
        )

        # Per-bar confluence arrays (для UI overlay — на баре подтверждения)
        conf_long = np.zeros(n, dtype=np.float64)
        conf_short = np.zeros(n, dtype=np.float64)

        signals: list[Signal] = []
        last_signal_bar = -10_000
        window = cfg["confirmation"]["window"]
        use_bos = cfg["confirmation"]["use_bos"]
        use_fvg = cfg["confirmation"]["use_fvg"]
        use_ob = cfg["confirmation"]["use_ob"]

        # === Главный цикл: для каждого свип-бара i ищем подтверждение в [i+1, i+window] ===
        for i in range(cfg["sweep"]["lookback"] + 1, n):
            # Определяем направление свипа
            if grab_low[i]:
                direction = "long"
            elif grab_high[i]:
                direction = "short"
            else:
                continue

            # Свип-бар volume filter (на свип-баре должен быть всплеск объёма)
            if cfg["filters"]["volume_filter_enabled"]:
                vol_sma_i = volume_sma[i]
                if np.isnan(vol_sma_i) or vol_sma_i <= 0:
                    continue
                if data.volume[i] < vol_sma_i * cfg["filters"]["volume_min_ratio"]:
                    continue

            # Свип-бар RSI filter
            if cfg["filters"]["rsi_filter_enabled"]:
                rsi_i = rsi_arr[i]
                if np.isnan(rsi_i):
                    continue
                if direction == "long" and rsi_i >= 50.0:
                    continue
                if direction == "short" and rsi_i <= 50.0:
                    continue

            # Поиск первого подтверждающего бара в окне [i+1, i+window]
            confirm_bar = -1
            confirmation_type = ""
            for j in range(i + 1, min(i + window + 1, n)):
                if direction == "long":
                    if use_bos and bull_bos[j]:
                        confirm_bar = j
                        confirmation_type = "bos"
                        break
                    if use_fvg and bull_fvg[j]:
                        confirm_bar = j
                        confirmation_type = "fvg"
                        break
                    if use_ob and bull_ob[j]:
                        confirm_bar = j
                        confirmation_type = "ob"
                        break
                else:  # short
                    if use_bos and bear_bos[j]:
                        confirm_bar = j
                        confirmation_type = "bos"
                        break
                    if use_fvg and bear_fvg[j]:
                        confirm_bar = j
                        confirmation_type = "fvg"
                        break
                    if use_ob and bear_ob[j]:
                        confirm_bar = j
                        confirmation_type = "ob"
                        break

            if confirm_bar < 0:
                continue

            # Валидация ATR на баре подтверждения
            atr_val = atr_arr[confirm_bar]
            if np.isnan(atr_val) or atr_val < 1e-8:
                continue

            # Фильтр: cooldown (по бару подтверждения — это бар входа)
            if (confirm_bar - last_signal_bar) < cfg["entry"]["cooldown_bars"]:
                continue

            # Фильтр: trend (EMA) — на баре подтверждения (баре входа)
            close_j = float(data.close[confirm_bar])
            ema_j = ema_arr[confirm_bar]
            ema_aligned = False
            if not np.isnan(ema_j):
                if direction == "long" and close_j > ema_j:
                    ema_aligned = True
                elif direction == "short" and close_j < ema_j:
                    ema_aligned = True

            if cfg["filters"]["trend_filter_enabled"]:
                if np.isnan(ema_j):
                    continue
                if direction == "long" and close_j <= ema_j:
                    continue
                if direction == "short" and close_j >= ema_j:
                    continue

            # Confluence (бонусы — по свип-бару RSI/volume и EMA на баре входа)
            vol_sma_val = volume_sma[i] if not np.isnan(volume_sma[i]) else 0.0
            rsi_val_i = rsi_arr[i] if not np.isnan(rsi_arr[i]) else float("nan")
            score = self._calculate_confluence(
                direction=direction,
                confirmation_type=confirmation_type,
                rsi_val=float(rsi_val_i) if not np.isnan(rsi_val_i) else float("nan"),
                close_val=close_j,
                ema_val=float(ema_j) if not np.isnan(ema_j) else float("nan"),
                volume_val=float(data.volume[i]),
                volume_sma_val=float(vol_sma_val),
            )

            if direction == "long":
                conf_long[confirm_bar] = max(conf_long[confirm_bar], score)
            else:
                conf_short[confirm_bar] = max(conf_short[confirm_bar], score)

            if score < cfg["entry"]["min_confluence"]:
                continue

            # SL: привязан к экстремумам свип-бара + баров подтверждения
            window_lo = float(np.min(data.low[i:confirm_bar + 1]))
            window_hi = float(np.max(data.high[i:confirm_bar + 1]))
            entry = close_j

            sl = self._calculate_sl(
                direction=direction,
                entry=entry,
                sweep_low=window_lo,
                sweep_high=window_hi,
                atr_val=float(atr_val),
                cfg=cfg,
            )

            # Risk R
            risk_r = abs(entry - sl)
            if risk_r <= 0:
                continue

            # Multi-TP levels
            tp_levels = self._build_tp_levels(
                direction=direction, entry=entry, risk_r=risk_r, cfg=cfg,
            )
            if not tp_levels:
                continue

            # Первая TP цена для legacy поля Signal.take_profit
            first_tp_price = (
                entry + tp_levels[0]["atr_mult"]
                if direction == "long"
                else entry - tp_levels[0]["atr_mult"]
            )

            # signal_type: BOS → breakout (структурный пробой), FVG/OB → mean_reversion (ретрейс в дисбаланс)
            signal_type = "breakout" if confirmation_type == "bos" else "mean_reversion"

            # Confluence tier для UI
            if score >= 4.0:
                tier = "strong"
            elif score >= 2.5:
                tier = "normal"
            else:
                tier = "weak"

            volume_ratio = (
                float(data.volume[i] / vol_sma_val)
                if vol_sma_val > 0 else 0.0
            )

            signal = Signal(
                bar_index=confirm_bar,  # ВАЖНО: вход на баре подтверждения, не на свип-баре
                direction=direction,
                entry_price=entry,
                stop_loss=float(sl),
                take_profit=float(first_tp_price),
                trailing_atr=float(atr_val * cfg["risk"]["trailing_atr_mult"]),
                confluence_score=float(score),
                signal_type=signal_type,
                tp_levels=tp_levels,
                indicators={
                    "sweep_direction": "grab_low" if direction == "long" else "grab_high",
                    "confirmation_type": confirmation_type,
                    "sweep_bar": int(i),
                    "confirm_bar": int(confirm_bar),
                    "risk_r": float(risk_r),
                    "atr": float(atr_val),
                    "rsi": float(rsi_val_i) if not np.isnan(rsi_val_i) else 0.0,
                    "volume_ratio": float(volume_ratio),
                    "ema_aligned": bool(ema_aligned),
                    "confluence_tier": tier,
                },
            )
            signals.append(signal)
            last_signal_bar = confirm_bar

        return StrategyResult(
            signals=signals,
            confluence_scores_long=conf_long,
            confluence_scores_short=conf_short,
            knn_scores=empty_arr.copy(),
            knn_classes=empty_arr.copy(),
            knn_confidence=empty_arr.copy(),
        )
