"""Скрипт инициализации стратегий (Lorentzian KNN, SuperTrend Squeeze)."""

import asyncio
import sys
from pathlib import Path

# Добавить корень проекта в sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from app.database import async_session
from app.modules.auth.models import User  # noqa: F401 — нужен для relationship resolution
from app.modules.billing.models import Subscription  # noqa: F401 — нужен для relationship resolution
from app.modules.strategy.models import Strategy

STRATEGIES = [
    {
        "name": "Machine Learning: Lorentzian KNN Classifier",
        "slug": "lorentzian-knn",
        "engine_type": "lorentzian_knn",
        "description": (
            "Lorentzian KNN — ML-стратегия на основе Lorentzian distance metric. "
            "4 фичи (RSI, WaveTrend, CCI, ADX), inverse distance weighting, "
            "confluence scoring (max 5.5). Протестирована на RIVERUSDT: +985%."
        ),
        "is_public": True,
        "version": "1.0.0",
        "default_config": {
            "time_filter": {"use": False, "session": "01:30-23:45"},
            "trend": {"ema_fast": 26, "ema_slow": 40, "ema_filter": 200},
            "mtf": {"use": False, "timeframe": "1", "ema_fast": 25, "ema_slow": 50},
            "ribbon": {
                "use": True,
                "type": "EMA",
                "mas": [9, 14, 21, 35, 55, 89, 144, 233],
                "threshold": 5,
            },
            "order_flow": {
                "use": True,
                "show_vwap": True,
                "vwap_stds": [1, 2, 3],
                "cvd_period": 20,
                "cvd_threshold": 0.5,
                "show_vp_poc": True,
                "vp_bins": 20,
            },
            "smc": {
                "use": True,
                "order_blocks": True,
                "fvg": True,
                "liquidity": True,
                "bos": True,
                "demand_supply": True,
                "ob_lookback": 10,
                "fvg_min_size": 0.5,
                "liquidity_lookback": 20,
                "bos_pivot": 5,
                "ds_impulse_mult": 1.5,
                "ds_max_zones": 8,
            },
            "volatility": {
                "use": True,
                "bb_period": 20,
                "bb_mult": 2,
                "atr_percentile_period": 100,
                "expansion": 1.5,
                "contraction": 0.7,
            },
            "breakout": {"period": 15, "atr_mult": 1.5},
            "mean_reversion": {
                "bb_period": 20,
                "bb_std": 2,
                "rsi_period": 14,
                "rsi_ob": 70,
                "rsi_os": 30,
            },
            "risk": {
                "atr_period": 14,
                "stop_atr_mult": 2,
                "tp_atr_mult": 10,
                "use_trailing": True,
                "trailing_atr_mult": 4,
                "min_bars_trailing": 5,
                "cooldown_bars": 10,
            },
            "filters": {"adx_period": 15, "adx_threshold": 8, "volume_mult": 1, "min_confluence": 3.0},
            "knn": {
                "neighbors": 8,
                "lookback": 50,
                "weight": 0.5,
                "rsi_period": 15,
                "wt_ch_len": 10,
                "wt_avg_len": 21,
                "cci_period": 20,
                "adx_period": 14,
            },
            "kernel": {"show": True, "ema_length": 34, "atr_period": 20},
            "backtest": {
                "initial_capital": 100,
                "currency": "USDT",
                "order_size": 75,
                "order_size_type": "percent_equity",
                "pyramiding": 0,
                "commission": 0.05,
                "slippage": 0,
                "margin_long": 100,
                "margin_short": 100,
            },
            "live": {
                "order_size": 30,
                "leverage": 1,
                "on_reverse": "ignore",
            },
        },
    },
    {
        "name": "SuperTrend Squeeze Momentum",
        "slug": "supertrend-squeeze",
        "engine_type": "supertrend_squeeze",
        "description": (
            "Triple SuperTrend + Squeeze Momentum — мульти-пара стратегия. "
            "Trend following (2/3 SuperTrend + EMA200 + ADX + RSI) и volatility breakout "
            "(Squeeze release + momentum). Работает на BTC, ETH, альтах. PF 2.1, WR 65%."
        ),
        "is_public": True,
        "version": "1.0.0",
        "default_config": {
            "supertrend": {
                "st1_period": 10, "st1_mult": 1.0,
                "st2_period": 11, "st2_mult": 3.0,
                "st3_period": 10, "st3_mult": 7.0,
                "min_agree": 2,
            },
            "squeeze": {
                "use": True,
                "bb_period": 20, "bb_mult": 2.0,
                "kc_period": 20, "kc_mult": 1.5,
                "mom_period": 20,
            },
            "trend_filter": {
                "ema_period": 200,
                "use_adx": True,
                "adx_period": 14,
                "adx_threshold": 25,
            },
            "entry": {
                "rsi_period": 14,
                "rsi_long_max": 40,
                "rsi_short_min": 60,
                "use_volume": True,
                "volume_mult": 1.0,
            },
            "risk": {
                "atr_period": 14,
                "stop_atr_mult": 3.0,
                "tp_atr_mult": 10.0,
                "use_trailing": True,
                "trailing_atr_mult": 6.0,
                "min_bars_trailing": 5,
                "cooldown_bars": 10,
            },
            "backtest": {
                "initial_capital": 100,
                "currency": "USDT",
                "order_size": 40,
                "order_size_type": "percent_equity",
                "pyramiding": 0,
                "commission": 0.05,
                "slippage": 0,
                "margin_long": 100,
                "margin_short": 100,
            },
            "live": {
                "order_size": 30,
                "leverage": 1,
                "on_reverse": "ignore",
            },
        },
    },
    {
        "name": "Pivot Point Mean Reversion",
        "slug": "pivot-point-mr",
        "engine_type": "pivot_point_mr",
        "description": (
            "Mean reversion на rolling pivot point S/R уровнях. "
            "Вход против отклонения от pivot с ожиданием возврата к равновесию. "
            "Regime detection (ADX + pivot velocity + EMA), multi-zone entries (S1-S3/R1-R3) "
            "с зонально-адаптивным SL и multi-TP, RSI confirmation, squeeze filter, "
            "anti-impulse protection и cooldown. Оптимальна для волатильных альткойнов в range/low-ADX фазах. "
            "Inspired by Rubicon BotMarket Pivot Point S/R стратегией-победителем."
        ),
        "is_public": True,
        "version": "1.0.0",
        "default_config": {
            "pivot": {"period": 48, "velocity_lookback": 12},
            "trend": {"ema_period": 200},
            "regime": {
                "adx_weak_trend": 20,
                "adx_strong_trend": 30,
                "pivot_drift_max": 0.3,
                "allow_strong_trend": False,
            },
            "entry": {
                "min_distance_pct": 0.15,
                "min_confluence": 1.5,
                "use_deep_levels": True,
                "cooldown_bars": 3,
                "impulse_check_bars": 5,
            },
            "filters": {
                "adx_enabled": True,
                "adx_period": 14,
                "rsi_enabled": True,
                "rsi_period": 14,
                "rsi_oversold": 40,
                "rsi_overbought": 60,
                "squeeze_enabled": True,
                "squeeze_bb_len": 20,
                "squeeze_bb_mult": 2.0,
                "squeeze_kc_len": 20,
                "squeeze_kc_mult": 1.5,
                "volume_filter_enabled": False,
                "volume_sma_period": 20,
                "volume_min_ratio": 1.2,
            },
            "risk": {
                "sl_atr_mult": 0.5,
                "sl_max_pct": 0.02,
                "atr_period": 14,
                "tp1_close_pct": 0.6,
                "tp2_close_pct": 0.4,
                "trailing_atr_mult": 1.5,
                "max_hold_bars": 60,
            },
            "backtest": {
                "initial_capital": 100,
                "currency": "USDT",
                "order_size": 75,
                "order_size_type": "percent_equity",
                "pyramiding": 0,
                "commission": 0.06,
                "slippage": 0.03,
                "margin_long": 100,
                "margin_short": 100,
            },
            "live": {
                "order_size": 30,
                "leverage": 1,
                "on_reverse": "close",
            },
        },
    },
]


async def seed_strategies() -> None:
    """Создать начальные стратегии (идемпотентно)."""
    async with async_session() as db:
        for strategy_data in STRATEGIES:
            result = await db.execute(
                select(Strategy).where(Strategy.slug == strategy_data["slug"])
            )
            if result.scalar_one_or_none():
                print(f"  Стратегия '{strategy_data['name']}' уже существует, пропуск")
                continue

            strategy = Strategy(**strategy_data)
            db.add(strategy)
            print(f"  + Создана стратегия: {strategy_data['name']} (v{strategy_data['version']})")

        await db.commit()
    print("Seed завершён!")


if __name__ == "__main__":
    asyncio.run(seed_strategies())
