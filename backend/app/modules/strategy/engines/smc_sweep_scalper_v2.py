"""SMCSweepScalperV2Strategy — улучшенная версия SMC liquidity sweep scalper.

Основано на v1 + диагностике (optimize_results/smc_scalper_v1_diagnostic.log).

Ключевые фиксы относительно v1:
    FIX 1 — BOS confirmation выключен по умолчанию (WR 0-40%, токсично).
    FIX 2 — Trailing stop опционально отключается (`disable_trailing=True`),
            либо мультипликатор расширен до 4.0 чтобы не резать runners.
    FIX 3 — ATR-percentile regime gate: блокирует мёртвый рынок и news-spikes.
    FIX 4 — Session killzone filter: только London + NY AM hours (UTC).
    FIX 5 — TP3 на 3R с close_pct=20% как time-independent cap для runner.
    FIX 6 — HTF bias gate: 1h EMA(50) slope блокирует контр-трендовые входы.
    FIX 7 — Fee-beat TP distribution: TP1=0.5R/50%, TP2=1.5R/30%, TP3=3R/20%.
    FIX 8 — Confluence update: BOS снижен до +0.5, ATR-percentile sweet-spot +0.5.

Zero-impact design: новый файл, v1 не модифицируется.
"""

from __future__ import annotations

from datetime import datetime, timezone
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


class SMCSweepScalperV2Strategy(BaseStrategy):
    """SMC liquidity sweep scalper v2 — с ATR-regime, session, HTF-bias фильтрами."""

    @property
    def name(self) -> str:
        return "SMC Sweep Scalper v2"

    @property
    def engine_type(self) -> str:
        return "smc_sweep_scalper_v2"

    def _validate_config(self, raw: dict) -> dict:
        """Заполнить отсутствующие ключи дефолтами. Все optional."""
        sweep_cfg = raw.get("sweep", {}) or {}
        confirm_cfg = raw.get("confirmation", {}) or {}
        trend_cfg = raw.get("trend", {}) or {}
        filters_cfg = raw.get("filters", {}) or {}
        entry_cfg = raw.get("entry", {}) or {}
        risk_cfg = raw.get("risk", {}) or {}

        # Дефолтный список session hours: London open (7-9 UTC) + NY AM (13-15 UTC)
        default_session_hours = [7, 8, 9, 13, 14, 15]

        return {
            "sweep": {
                "lookback": int(sweep_cfg.get("lookback", 20)),
            },
            "confirmation": {
                "window": int(confirm_cfg.get("window", 3)),
                "fvg_min_size": float(confirm_cfg.get("fvg_min_size", 0.3)),
                "bos_pivot": int(confirm_cfg.get("bos_pivot", 5)),
                # FIX 1: BOS выключен по умолчанию — в v1 давал WR 0-40%.
                "use_bos": bool(confirm_cfg.get("use_bos", False)),
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
                # FIX 3: ATR percentile regime gate
                "atr_regime_enabled": bool(filters_cfg.get("atr_regime_enabled", True)),
                "atr_percentile_window": int(filters_cfg.get("atr_percentile_window", 200)),
                "atr_percentile_min": float(filters_cfg.get("atr_percentile_min", 0.40)),
                "atr_percentile_max": float(filters_cfg.get("atr_percentile_max", 0.95)),
                # FIX 4: Session killzone filter
                "session_filter_enabled": bool(filters_cfg.get("session_filter_enabled", True)),
                "session_hours": list(filters_cfg.get("session_hours", default_session_hours)),
                # FIX 6: HTF bias gate (1h EMA slope)
                "htf_bias_enabled": bool(filters_cfg.get("htf_bias_enabled", True)),
                "htf_ema_period": int(filters_cfg.get("htf_ema_period", 50)),
                "htf_slope_min": float(filters_cfg.get("htf_slope_min", 0.0002)),
                "htf_bars_per_htf": int(filters_cfg.get("htf_bars_per_htf", 12)),
                "htf_slope_lookback": int(filters_cfg.get("htf_slope_lookback", 6)),
            },
            "entry": {
                "min_confluence": float(entry_cfg.get("min_confluence", 1.5)),
                "cooldown_bars": int(entry_cfg.get("cooldown_bars", 3)),
            },
            "risk": {
                "atr_period": int(risk_cfg.get("atr_period", 14)),
                "sl_atr_buffer": float(risk_cfg.get("sl_atr_buffer", 0.3)),
                "sl_max_pct": float(risk_cfg.get("sl_max_pct", 0.015)),
                # FIX 7: Fee-beat TP distribution
                "tp1_r_mult": float(risk_cfg.get("tp1_r_mult", 0.5)),
                "tp1_close_pct": float(risk_cfg.get("tp1_close_pct", 0.5)),
                "tp2_r_mult": float(risk_cfg.get("tp2_r_mult", 1.5)),
                "tp2_close_pct": float(risk_cfg.get("tp2_close_pct", 0.3)),
                # FIX 5: TP3 cap на runner
                "tp3_enabled": bool(risk_cfg.get("tp3_enabled", True)),
                "tp3_r_mult": float(risk_cfg.get("tp3_r_mult", 3.0)),
                "tp3_close_pct": float(risk_cfg.get("tp3_close_pct", 0.2)),
                # FIX 2: Trailing управление
                "trailing_atr_mult": float(risk_cfg.get("trailing_atr_mult", 4.0)),
                "disable_trailing": bool(risk_cfg.get("disable_trailing", True)),
            },
        }

    @staticmethod
    def _price_to_distance(tp_price: float, entry: float, direction: str) -> float:
        """Конвертировать абсолютную TP цену в raw distance для Signal.tp_levels.

        Поле `atr_mult` в Signal.tp_levels исторически названо,
        но backtest_engine.py использует его как raw price distance:
            tp_price = entry + atr_dist  (long)
            tp_price = entry - atr_dist  (short)
        """
        if direction == "long":
            return tp_price - entry
        return entry - tp_price

    def _build_tp_levels(
        self,
        direction: str,
        entry: float,
        risk_r: float,
        cfg: dict,
    ) -> list[dict]:
        """Построить multi-TP levels на основе R-multiple (до 3 уровней).

        TP1 = entry ± R * tp1_r_mult  (close tp1_close_pct)
        TP2 = entry ± R * tp2_r_mult  (close tp2_close_pct)
        TP3 = entry ± R * tp3_r_mult  (close tp3_close_pct) — только если tp3_enabled
        """
        risk_cfg = cfg["risk"]
        tp1_pct = int(round(risk_cfg["tp1_close_pct"] * 100))
        tp2_pct = int(round(risk_cfg["tp2_close_pct"] * 100))
        tp3_pct = int(round(risk_cfg["tp3_close_pct"] * 100))

        tp_defs: list[tuple[float, int]] = []
        if direction == "long":
            tp_defs.append((entry + risk_r * risk_cfg["tp1_r_mult"], tp1_pct))
            tp_defs.append((entry + risk_r * risk_cfg["tp2_r_mult"], tp2_pct))
            if risk_cfg["tp3_enabled"]:
                tp_defs.append((entry + risk_r * risk_cfg["tp3_r_mult"], tp3_pct))
        else:
            tp_defs.append((entry - risk_r * risk_cfg["tp1_r_mult"], tp1_pct))
            tp_defs.append((entry - risk_r * risk_cfg["tp2_r_mult"], tp2_pct))
            if risk_cfg["tp3_enabled"]:
                tp_defs.append((entry - risk_r * risk_cfg["tp3_r_mult"], tp3_pct))

        levels: list[dict] = []
        for tp_price, close_pct in tp_defs:
            atr_dist = self._price_to_distance(tp_price, entry, direction)
            if atr_dist <= 0 or close_pct <= 0:
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
        """SL привязан к экстремуму свип-бара + ATR buffer с hard cap по %."""
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
        atr_percentile: float,
    ) -> float:
        """Confluence score. Базовый 1.0, бонусы до ~4.25.

        FIX 8 изменения:
            +0.5   BOS (снижен с +1.5 — в v1 был токсичным)
            +0.75  FVG (без изменений)
            +0.5   OB (без изменений)
            +0.5   volume spike
            +0.5   RSI aligned
            +0.5   EMA trend aligned
            +0.5   ATR percentile в sweet-spot [0.55, 0.85]
        """
        score = 1.0

        # Тип подтверждения
        if confirmation_type == "bos":
            score += 0.5  # FIX 8: снижено с 1.5
        elif confirmation_type == "fvg":
            score += 0.75
        elif confirmation_type == "ob":
            score += 0.5

        # Volume spike
        if volume_sma_val > 0 and volume_val > volume_sma_val * 1.3:
            score += 0.5

        # RSI aligned
        if not np.isnan(rsi_val):
            if direction == "long" and rsi_val < 40.0:
                score += 0.5
            elif direction == "short" and rsi_val > 60.0:
                score += 0.5

        # EMA trend aligned
        if not np.isnan(ema_val):
            if direction == "long" and close_val > ema_val:
                score += 0.5
            elif direction == "short" and close_val < ema_val:
                score += 0.5

        # FIX 8: ATR percentile sweet-spot
        if not np.isnan(atr_percentile) and 0.55 <= atr_percentile <= 0.85:
            score += 0.5

        return score

    # === Новые хелперы для v2 фильтров ===

    @staticmethod
    def _atr_percentile(atr_arr: NDArray, window: int) -> NDArray:
        """Rolling percentile rank ATR в окне `window`, векторно.

        Для каждого бара i: доля значений в [i-window+1 .. i], которые ≤ atr[i].
        Результат в [0, 1]. Первые (window-1) баров → NaN. NaN-значения игнорируются.
        """
        n = len(atr_arr)
        out = np.full(n, np.nan, dtype=np.float64)
        if n < window:
            return out

        # sliding_window_view → (n-window+1, window)
        windows = np.lib.stride_tricks.sliding_window_view(atr_arr, window)
        current = atr_arr[window - 1:][:, None]  # (m, 1) — последний элемент каждого окна
        # NaN-aware: считаем только non-NaN значения
        valid_mask = ~np.isnan(windows)
        le_mask = (windows <= current) & valid_mask
        valid_cnt = valid_mask.sum(axis=1)
        le_cnt = le_mask.sum(axis=1)
        # Требуем минимум 2 валидных значения в окне, иначе NaN
        safe = valid_cnt >= 2
        ranks = np.full(windows.shape[0], np.nan, dtype=np.float64)
        ranks[safe] = le_cnt[safe] / valid_cnt[safe]
        # Если текущий элемент NaN — результат NaN
        cur_flat = current[:, 0]
        ranks[np.isnan(cur_flat)] = np.nan
        out[window - 1:] = ranks
        return out

    @staticmethod
    def _compute_htf_ema_slope(
        close: NDArray,
        timestamps: NDArray | None,
        bars_per_htf: int,
        ema_period: int,
        slope_lookback: int,
    ) -> tuple[NDArray, NDArray]:
        """HTF EMA slope: ресемплим 5m → 1h, EMA(50), forward-fill, slope.

        Возвращает (htf_ema_ffilled, htf_slope_ffilled), длина = len(close).
        Slope считается как (ema[i] - ema[i-slope_lookback]) / ema[i-slope_lookback]
        на HTF-индексах, затем forward-fill на LTF.

        Если `timestamps is None` — считаем что каждый bars_per_htf-ый бар = 1 HTF-бар.
        """
        n = len(close)
        ema_full = np.full(n, np.nan, dtype=np.float64)
        slope_full = np.full(n, np.nan, dtype=np.float64)

        if n < bars_per_htf * ema_period:
            return ema_full, slope_full

        # Берём каждый bars_per_htf-ый close (имитация ресемплинга OHLC close за час)
        htf_indices = np.arange(bars_per_htf - 1, n, bars_per_htf)
        if len(htf_indices) < ema_period + slope_lookback:
            return ema_full, slope_full

        htf_close = close[htf_indices]
        htf_ema = ema(htf_close, ema_period)

        # HTF slope: (ema[i] - ema[i-L]) / ema[i-L]
        htf_slope = np.full_like(htf_ema, np.nan)
        for k in range(slope_lookback, len(htf_ema)):
            prev = htf_ema[k - slope_lookback]
            if np.isnan(prev) or np.isnan(htf_ema[k]) or abs(prev) < 1e-12:
                continue
            htf_slope[k] = (htf_ema[k] - prev) / prev

        # Forward-fill на LTF: на баре i берём последний HTF-индекс ≤ i
        last_htf_ema = np.nan
        last_htf_slope = np.nan
        htf_pos = 0
        for i in range(n):
            # Продвигаем htf_pos пока его анкорный LTF-индекс ≤ i
            while htf_pos < len(htf_indices) and htf_indices[htf_pos] <= i:
                last_htf_ema = htf_ema[htf_pos]
                last_htf_slope = htf_slope[htf_pos]
                htf_pos += 1
            ema_full[i] = last_htf_ema
            slope_full[i] = last_htf_slope

        return ema_full, slope_full

    @staticmethod
    def _get_utc_hour(timestamp_ms: float) -> int | None:
        """UNIX ms → UTC hour (0-23). Возвращает None при невалидных данных."""
        if np.isnan(timestamp_ms) or timestamp_ms <= 0:
            return None
        try:
            dt = datetime.fromtimestamp(timestamp_ms / 1000.0, tz=timezone.utc)
            return dt.hour
        except (OverflowError, OSError, ValueError):
            return None

    def generate_signals(self, data: OHLCV) -> StrategyResult:
        """Главный метод — проход по барам с детекцией свипов + v2 фильтрами."""
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
            cfg["filters"]["atr_percentile_window"] + 2,
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

        # FIX 3: ATR percentile для regime gate
        atr_pctile = self._atr_percentile(
            atr_arr, window=cfg["filters"]["atr_percentile_window"],
        )

        # FIX 6: HTF EMA slope
        htf_ema_ff, htf_slope_ff = self._compute_htf_ema_slope(
            close=data.close,
            timestamps=data.timestamps,
            bars_per_htf=cfg["filters"]["htf_bars_per_htf"],
            ema_period=cfg["filters"]["htf_ema_period"],
            slope_lookback=cfg["filters"]["htf_slope_lookback"],
        )

        # Per-bar confluence arrays
        conf_long = np.zeros(n, dtype=np.float64)
        conf_short = np.zeros(n, dtype=np.float64)

        signals: list[Signal] = []
        last_signal_bar = -10_000
        window = cfg["confirmation"]["window"]
        use_bos = cfg["confirmation"]["use_bos"]
        use_fvg = cfg["confirmation"]["use_fvg"]
        use_ob = cfg["confirmation"]["use_ob"]

        session_enabled = cfg["filters"]["session_filter_enabled"]
        session_hours_set = set(int(h) for h in cfg["filters"]["session_hours"])
        atr_regime_enabled = cfg["filters"]["atr_regime_enabled"]
        atr_pct_min = cfg["filters"]["atr_percentile_min"]
        atr_pct_max = cfg["filters"]["atr_percentile_max"]
        htf_enabled = cfg["filters"]["htf_bias_enabled"]
        htf_slope_min = cfg["filters"]["htf_slope_min"]

        # === Главный цикл ===
        for i in range(cfg["sweep"]["lookback"] + 1, n):
            # Свип?
            if grab_low[i]:
                direction = "long"
            elif grab_high[i]:
                direction = "short"
            else:
                continue

            # Volume filter на свип-баре
            if cfg["filters"]["volume_filter_enabled"]:
                vol_sma_i = volume_sma[i]
                if np.isnan(vol_sma_i) or vol_sma_i <= 0:
                    continue
                if data.volume[i] < vol_sma_i * cfg["filters"]["volume_min_ratio"]:
                    continue

            # RSI filter на свип-баре
            if cfg["filters"]["rsi_filter_enabled"]:
                rsi_i = rsi_arr[i]
                if np.isnan(rsi_i):
                    continue
                if direction == "long" and rsi_i >= 50.0:
                    continue
                if direction == "short" and rsi_i <= 50.0:
                    continue

            # FIX 3: ATR percentile regime gate (на свип-баре)
            if atr_regime_enabled:
                ap = atr_pctile[i]
                if np.isnan(ap) or ap < atr_pct_min or ap > atr_pct_max:
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
                else:
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

            # ATR на баре подтверждения
            atr_val = atr_arr[confirm_bar]
            if np.isnan(atr_val) or atr_val < 1e-8:
                continue

            # Cooldown
            if (confirm_bar - last_signal_bar) < cfg["entry"]["cooldown_bars"]:
                continue

            # FIX 4: Session killzone filter (по бару входа)
            if session_enabled and data.timestamps is not None and len(data.timestamps) > confirm_bar:
                utc_hour = self._get_utc_hour(float(data.timestamps[confirm_bar]))
                if utc_hour is not None and utc_hour not in session_hours_set:
                    continue
                # Если timestamps невалидный — skip фильтр, не сигнал

            # Trend EMA на баре подтверждения
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

            # FIX 6: HTF bias gate (на баре подтверждения)
            if htf_enabled:
                hslope = htf_slope_ff[confirm_bar]
                if not np.isnan(hslope):
                    if hslope > htf_slope_min:
                        # Bullish bias — блокируем short
                        if direction == "short":
                            continue
                    elif hslope < -htf_slope_min:
                        # Bearish bias — блокируем long
                        if direction == "long":
                            continue
                    # else: |slope| < min → ranging → allow both

            # Confluence (бонусы — по свип-бару + sweet-spot ATR)
            # NaN-значения пробрасываем как есть — _calculate_confluence проверяет np.isnan.
            vol_sma_val = 0.0 if np.isnan(volume_sma[i]) else float(volume_sma[i])
            rsi_val_i = float(rsi_arr[i])
            ap_i = float(atr_pctile[i])
            score = self._calculate_confluence(
                direction=direction,
                confirmation_type=confirmation_type,
                rsi_val=rsi_val_i,
                close_val=close_j,
                ema_val=float(ema_j),
                volume_val=float(data.volume[i]),
                volume_sma_val=vol_sma_val,
                atr_percentile=ap_i,
            )

            if direction == "long":
                conf_long[confirm_bar] = max(conf_long[confirm_bar], score)
            else:
                conf_short[confirm_bar] = max(conf_short[confirm_bar], score)

            if score < cfg["entry"]["min_confluence"]:
                continue

            # SL — экстремумы свип-окна
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

            risk_r = abs(entry - sl)
            if risk_r <= 0:
                continue

            # Multi-TP levels (до 3)
            tp_levels = self._build_tp_levels(
                direction=direction, entry=entry, risk_r=risk_r, cfg=cfg,
            )
            if not tp_levels:
                continue

            # Первая TP цена для legacy Signal.take_profit
            first_tp_price = (
                entry + tp_levels[0]["atr_mult"]
                if direction == "long"
                else entry - tp_levels[0]["atr_mult"]
            )

            # FIX 2: Trailing — disable или широкий
            if cfg["risk"]["disable_trailing"]:
                trailing_atr_val = 0.0
            else:
                trailing_atr_val = float(atr_val * cfg["risk"]["trailing_atr_mult"])

            # signal_type
            signal_type = "breakout" if confirmation_type == "bos" else "mean_reversion"

            # Tier
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

            # HTF slope snapshot для diagnostics (NaN → 0.0 для JSON-safety)
            htf_slope_raw = htf_slope_ff[confirm_bar]
            htf_slope_val = 0.0 if np.isnan(htf_slope_raw) else float(htf_slope_raw)

            signal = Signal(
                bar_index=confirm_bar,
                direction=direction,
                entry_price=entry,
                stop_loss=float(sl),
                take_profit=float(first_tp_price),
                trailing_atr=trailing_atr_val,
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
                    "atr_percentile": 0.0 if np.isnan(ap_i) else ap_i,
                    "rsi": 0.0 if np.isnan(rsi_val_i) else rsi_val_i,
                    "volume_ratio": float(volume_ratio),
                    "ema_aligned": bool(ema_aligned),
                    "htf_slope": htf_slope_val,
                    "confluence_tier": tier,
                    "tp_count": int(len(tp_levels)),
                    "disable_trailing": bool(cfg["risk"]["disable_trailing"]),
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
