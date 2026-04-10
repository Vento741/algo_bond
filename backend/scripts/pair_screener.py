"""Auto Pair Screening - поиск пар для SuperTrend Squeeze стратегии.

Сканирует Bybit USDT linear futures, оценивает по метрикам волатильности,
тренда и squeeze-частоты, прогоняет бэктест на top кандидатах.

Использование:
  python scripts/pair_screener.py
  python scripts/pair_screener.py --top 20 --timeframe 15
"""

import argparse
import json
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.modules.backtest.backtest_engine import run_backtest
from app.modules.market.bybit_client import BybitClient
from app.modules.strategy.engines import get_engine
from app.modules.strategy.engines.base import OHLCV
from app.modules.strategy.engines.indicators.trend import atr as calc_atr, dmi
from app.modules.strategy.engines.indicators.oscillators import squeeze_momentum

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger("pair_screener")
logger.setLevel(logging.INFO)

# === Defaults ===
MIN_DAILY_VOLUME_USD = 1_000_000
MIN_ATR_PCT = 1.0
MAX_ATR_PCT = 15.0
MIN_ADX = 15
TIMEFRAME = "15"
TF_MINUTES = 15
CANDLES = 500
TOP_N = 10
INITIAL_CAPITAL = 100.0
COMMISSION = 0.055

# Best config из оптимизации 15m
BEST_CONFIG: dict = {
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
        "min_duration": 0,
        "duration_norm": 30,
        "max_weight": 1.0,
    },
    "trend_filter": {
        "ema_period": 200,
        "use_adx": True,
        "adx_period": 14,
        "adx_threshold": 15,
    },
    "entry": {
        "rsi_period": 14,
        "rsi_long_max": 45,
        "rsi_short_min": 55,
        "use_volume": True,
        "volume_mult": 1.0,
    },
    "risk": {
        "atr_period": 14,
        "stop_atr_mult": 5.0,
        "tp_atr_mult": 15.0,
        "use_trailing": True,
        "trailing_atr_mult": 20.0,
        "cooldown_bars": 5,
        "adaptive_trailing": False,
        "trail_low_mult": 3.0,
        "trail_high_mult": 8.0,
    },
    "regime": {"use": False},
    "multi_tf": {"use": False},
    "backtest": {
        "initial_capital": 100,
        "order_size": 75,
        "commission": 0.05,
    },
}


def get_all_usdt_futures() -> list[dict]:
    """Получить список всех USDT linear futures с Bybit."""
    client = BybitClient()
    result = client.client.get_instruments_info(category="linear")
    symbols = []
    for item in result["result"]["list"]:
        if item["quoteCoin"] == "USDT" and item["status"] == "Trading":
            symbols.append({
                "symbol": item["symbol"],
                "base_coin": item["baseCoin"],
            })
    logger.info("Найдено %d USDT linear futures", len(symbols))
    return symbols


def fetch_candles(
    client: BybitClient, symbol: str, timeframe: str, limit: int = 500,
) -> list[dict]:
    """Загрузить свечи с Bybit."""
    try:
        candles = client.get_klines(symbol, timeframe, limit)
        return candles
    except Exception as e:
        logger.warning("Ошибка загрузки %s: %s", symbol, e)
        return []


def candles_to_ohlcv(candles: list[dict]) -> OHLCV:
    """Конвертировать свечи в OHLCV."""
    return OHLCV(
        open=np.array([c["open"] for c in candles], dtype=np.float64),
        high=np.array([c["high"] for c in candles], dtype=np.float64),
        low=np.array([c["low"] for c in candles], dtype=np.float64),
        close=np.array([c["close"] for c in candles], dtype=np.float64),
        volume=np.array([c["volume"] for c in candles], dtype=np.float64),
        timestamps=np.array([c["timestamp"] for c in candles], dtype=np.float64),
    )


def calculate_metrics(ohlcv: OHLCV) -> dict | None:
    """Рассчитать метрики для пары.

    Returns dict с метриками или None если данных недостаточно.
    """
    n = len(ohlcv)
    if n < 200:
        return None

    # ATR% - Average True Range в процентах от цены
    atr_vals = calc_atr(ohlcv.high, ohlcv.low, ohlcv.close, 14)
    valid_atr = atr_vals[~np.isnan(atr_vals)]
    if len(valid_atr) < 50:
        return None

    avg_price = np.mean(ohlcv.close[-100:])
    if avg_price <= 0:
        return None

    atr_pct = float(np.mean(valid_atr[-100:])) / avg_price * 100

    # Average daily range
    daily_range = (ohlcv.high - ohlcv.low) / ohlcv.close * 100
    avg_daily_range = float(np.mean(daily_range[-100:]))

    # Volume (USD) - средний за последние 100 баров
    # Примерный daily volume = vol_per_bar * bars_per_day
    bars_per_day = 24 * 60 / TF_MINUTES
    avg_bar_volume = float(np.mean(ohlcv.volume[-100:])) * avg_price
    avg_daily_volume = avg_bar_volume * bars_per_day

    # ADX - trend strength
    _, _, adx_vals = dmi(ohlcv.high, ohlcv.low, ohlcv.close, 14)
    valid_adx = adx_vals[~np.isnan(adx_vals)]
    avg_adx = float(np.mean(valid_adx[-50:])) if len(valid_adx) >= 50 else 0.0

    # Squeeze frequency - % баров в squeeze
    squeeze_on, _, _ = squeeze_momentum(
        ohlcv.high, ohlcv.low, ohlcv.close,
        20, 2.0, 20, 1.5, 20,
    )
    squeeze_pct = float(np.sum(squeeze_on[-200:])) / min(200, n) * 100

    return {
        "atr_pct": round(atr_pct, 3),
        "avg_daily_range": round(avg_daily_range, 3),
        "avg_daily_volume_usd": round(avg_daily_volume, 0),
        "avg_adx": round(avg_adx, 2),
        "squeeze_pct": round(squeeze_pct, 1),
        "avg_price": round(avg_price, 6),
    }


def composite_score(metrics: dict) -> float:
    """Composite score для ранжирования пар.

    Формула: взвешенная сумма нормализованных метрик.
    Хотим: высокий ATR% (в пределах), высокий ADX, средний squeeze_pct.
    """
    # ATR score: bell curve - лучше 3-8%, хуже <1% и >15%
    atr = metrics["atr_pct"]
    if atr < MIN_ATR_PCT or atr > MAX_ATR_PCT:
        return 0.0
    atr_score = min(atr / 5.0, 1.0) * (1.0 - max(0, atr - 8.0) / 7.0)

    # ADX score: линейный, больше = лучше (до 50)
    adx_score = min(metrics["avg_adx"] / 40.0, 1.0)

    # Squeeze score: bell curve - лучше 20-50%, хуже <10% и >80%
    sq = metrics["squeeze_pct"]
    sq_score = min(sq / 30.0, 1.0) * (1.0 - max(0, sq - 50.0) / 50.0)

    # Volume score: log-scaled, больше = лучше
    vol = metrics["avg_daily_volume_usd"]
    vol_score = min(np.log10(max(vol, 1)) / 8.0, 1.0)  # $100M = score 1.0

    return round(
        atr_score * 0.3 + adx_score * 0.3 + sq_score * 0.25 + vol_score * 0.15,
        4,
    )


def run_pair_backtest(ohlcv: OHLCV, config: dict) -> dict:
    """Запустить бэктест SuperTrend Squeeze на паре."""
    try:
        engine = get_engine("supertrend_squeeze", config)
        result = engine.generate_signals(ohlcv)

        risk_cfg = config.get("risk", {})
        bt_cfg = config.get("backtest", {})
        metrics = run_backtest(
            ohlcv=ohlcv,
            signals=result.signals,
            initial_capital=bt_cfg.get("initial_capital", INITIAL_CAPITAL),
            commission_pct=bt_cfg.get("commission", COMMISSION),
            order_size_pct=bt_cfg.get("order_size", 75),
            min_bars_trailing=risk_cfg.get("min_bars_trailing", 0),
            timeframe_minutes=TF_MINUTES,
        )
        return {
            "total_trades": metrics.total_trades,
            "win_rate": metrics.win_rate,
            "total_pnl_pct": metrics.total_pnl_pct,
            "max_drawdown": metrics.max_drawdown,
            "sharpe_ratio": metrics.sharpe_ratio,
            "profit_factor": metrics.profit_factor,
        }
    except Exception as e:
        logger.warning("Backtest error: %s", e)
        return {"error": str(e)}


def main() -> None:
    """Главная функция скрининга."""
    parser = argparse.ArgumentParser(description="Pair Screener для SuperTrend Squeeze")
    parser.add_argument("--top", type=int, default=TOP_N, help="Количество top пар")
    parser.add_argument("--timeframe", default=TIMEFRAME, help="Таймфрейм (5, 15, 60)")
    parser.add_argument("--min-volume", type=float, default=MIN_DAILY_VOLUME_USD, help="Min daily volume USD")
    parser.add_argument("--backtest", action="store_true", help="Запустить бэктест на top парах")
    parser.add_argument("--output", default=None, help="Путь для JSON результатов")
    args = parser.parse_args()

    logger.info("=== Pair Screener: SuperTrend Squeeze ===")
    logger.info("Timeframe: %sm, Top: %d, Min volume: $%s", args.timeframe, args.top, f"{args.min_volume:,.0f}")

    # 1. Получить список пар
    symbols = get_all_usdt_futures()

    # 2. Загрузить данные и рассчитать метрики
    client = BybitClient()
    results: list[dict] = []
    total = len(symbols)

    for idx, sym_info in enumerate(symbols):
        symbol = sym_info["symbol"]
        if idx % 50 == 0:
            logger.info("Прогресс: %d/%d", idx, total)

        candles = fetch_candles(client, symbol, args.timeframe, CANDLES)
        if len(candles) < 200:
            continue

        ohlcv = candles_to_ohlcv(candles)
        metrics = calculate_metrics(ohlcv)
        if metrics is None:
            continue

        # Фильтр по volume
        if metrics["avg_daily_volume_usd"] < args.min_volume:
            continue

        # Фильтр по ATR%
        if metrics["atr_pct"] < MIN_ATR_PCT or metrics["atr_pct"] > MAX_ATR_PCT:
            continue

        # Фильтр по ADX
        if metrics["avg_adx"] < MIN_ADX:
            continue

        score = composite_score(metrics)
        results.append({
            "symbol": symbol,
            "score": score,
            **metrics,
        })

        # Rate limit
        time.sleep(0.05)

    # 3. Отсортировать по composite score
    results.sort(key=lambda x: x["score"], reverse=True)
    top_results = results[:args.top]

    # 4. Вывести таблицу
    logger.info("\n=== Top %d пар (из %d прошедших фильтр) ===", args.top, len(results))
    header = f"{'#':>3} {'Symbol':<16} {'Score':>6} {'ATR%':>6} {'ADX':>5} {'Sq%':>5} {'Vol($M)':>8}"
    logger.info(header)
    logger.info("-" * len(header))

    for i, r in enumerate(top_results, 1):
        vol_m = r["avg_daily_volume_usd"] / 1_000_000
        logger.info(
            "%3d %-16s %6.4f %6.3f %5.1f %5.1f %8.1f",
            i, r["symbol"], r["score"], r["atr_pct"],
            r["avg_adx"], r["squeeze_pct"], vol_m,
        )

    # 5. Бэктест на top парах (опционально)
    if args.backtest:
        logger.info("\n=== Бэктест top %d пар ===", len(top_results))
        for r in top_results:
            symbol = r["symbol"]
            candles = fetch_candles(client, symbol, args.timeframe, CANDLES)
            if len(candles) < 200:
                continue
            ohlcv = candles_to_ohlcv(candles)
            bt = run_pair_backtest(ohlcv, BEST_CONFIG)
            r["backtest"] = bt
            if "error" not in bt:
                logger.info(
                    "  %-16s PnL: %+.2f%% | WR: %.0f%% | DD: %.1f%% | Sharpe: %.2f | Trades: %d",
                    symbol, bt["total_pnl_pct"], bt["win_rate"] * 100,
                    bt["max_drawdown"], bt["sharpe_ratio"], bt["total_trades"],
                )
            time.sleep(0.1)

    # 6. Сохранить результат
    output_path = args.output or str(
        Path(__file__).parent.parent / f"pair_screening_{args.timeframe}m.json"
    )
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "timeframe": args.timeframe,
            "total_screened": total,
            "passed_filter": len(results),
            "top_n": len(top_results),
            "results": top_results,
        }, f, indent=2, ensure_ascii=False)

    logger.info("\nРезультаты сохранены: %s", output_path)


if __name__ == "__main__":
    main()
