"""Grid search оптимизация Lorentzian KNN стратегии.

Многофазный grid search:
  Phase 1 (Coarse): широкий перебор ключевых параметров
  Phase 2 (Fine): уточнение лучших зон
  Phase 3 (Tuning): тонкая настройка топ конфигов

Использование:
  python scripts/optimize_strategy.py
"""

import copy
import itertools
import json
import logging
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.modules.backtest.backtest_engine import run_backtest
from app.modules.market.bybit_client import BybitClient
from app.modules.strategy.engines import get_engine
from app.modules.strategy.engines.base import OHLCV

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger("optimizer")
logger.setLevel(logging.INFO)

# === Конфигурация оптимизации ===
SYMBOL = "RIVERUSDT"
TIMEFRAME = "15"
TF_MINUTES = 15
INITIAL_CAPITAL = 100.0
COMMISSION = 0.055  # Bybit taker fee (с учетом обеих сторон)

# Период: 5 месяцев
END_DATE = datetime.now(timezone.utc)
START_DATE = END_DATE - timedelta(days=150)

# Базовый конфиг (из seed_strategy.py)
BASE_CONFIG = {
    "time_filter": {"use": False},
    "trend": {"ema_fast": 26, "ema_slow": 40, "ema_filter": 200},
    "mtf": {"use": False},
    "ribbon": {"use": True, "type": "EMA", "mas": [9, 14, 21, 35, 55, 89, 144, 233], "threshold": 5},
    "order_flow": {"use": True, "cvd_period": 20, "cvd_threshold": 0.5},
    "smc": {
        "use": True, "order_blocks": True, "fvg": True, "liquidity": True,
        "bos": True, "demand_supply": True, "ob_lookback": 10,
        "fvg_min_size": 0.5, "liquidity_lookback": 20, "bos_pivot": 5, "ds_impulse_mult": 1.5,
    },
    "volatility": {"use": True, "bb_period": 20, "bb_mult": 2, "atr_percentile_period": 100,
                    "expansion": 1.5, "contraction": 0.7},
    "breakout": {"period": 15, "atr_mult": 1.5},
    "mean_reversion": {"bb_period": 20, "bb_std": 2, "rsi_period": 14, "rsi_ob": 70, "rsi_os": 30},
    "risk": {
        "atr_period": 14, "stop_atr_mult": 2, "tp_atr_mult": 10,
        "use_trailing": True, "trailing_atr_mult": 4, "min_bars_trailing": 5, "cooldown_bars": 10,
    },
    "filters": {"adx_period": 15, "adx_threshold": 8, "volume_mult": 1, "min_confluence": 3.0},
    "knn": {
        "neighbors": 8, "lookback": 50, "weight": 0.5,
        "rsi_period": 15, "wt_ch_len": 10, "wt_avg_len": 21, "cci_period": 20, "adx_period": 14,
    },
    "backtest": {"initial_capital": 100, "order_size": 75, "commission": 0.05},
}


def fetch_candles(symbol: str, timeframe: str, start_date: datetime, end_date: datetime) -> list[dict]:
    """Загрузить свечи с Bybit (пагинация по 1000)."""
    client = BybitClient()
    start_ms = int(start_date.timestamp() * 1000)
    end_ms = int(end_date.timestamp() * 1000)

    all_candles: list[dict] = []
    current_end = end_ms

    while current_end > start_ms:
        candles = client.get_klines(symbol, timeframe, 1000, start=start_ms, end=current_end)
        if not candles:
            break
        all_candles = candles + all_candles
        first_ts = candles[0]["timestamp"]
        if first_ts <= start_ms:
            break
        current_end = int(first_ts) - 1

    logger.info("Загружено %d свечей %s %sm (%s - %s)",
                len(all_candles), symbol, timeframe,
                start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d"))
    return all_candles


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


def run_single_backtest(ohlcv: OHLCV, config: dict) -> dict:
    """Запустить один бэктест с конфигом и вернуть метрики."""
    try:
        engine = get_engine("lorentzian_knn", config)
        result = engine.generate_signals(ohlcv)

        risk_cfg = config.get("risk", {})
        bt_cfg = config.get("backtest", {})

        metrics = run_backtest(
            ohlcv=ohlcv,
            signals=result.signals,
            initial_capital=INITIAL_CAPITAL,
            commission_pct=bt_cfg.get("commission", COMMISSION),
            order_size_pct=bt_cfg.get("order_size", 75),
            min_bars_trailing=risk_cfg.get("min_bars_trailing", 0),
            use_multi_tp=risk_cfg.get("use_multi_tp", False),
            tp_levels=risk_cfg.get("tp_levels"),
            use_breakeven=risk_cfg.get("use_breakeven", False),
            timeframe_minutes=TF_MINUTES,
        )

        return {
            "total_pnl": metrics.total_pnl,
            "total_pnl_pct": metrics.total_pnl_pct,
            "total_trades": metrics.total_trades,
            "win_rate": metrics.win_rate,
            "profit_factor": metrics.profit_factor,
            "max_drawdown": metrics.max_drawdown,
            "sharpe_ratio": metrics.sharpe_ratio,
        }
    except Exception as e:
        logger.warning("Backtest failed: %s", e)
        return {"total_pnl": -999, "total_trades": 0, "win_rate": 0,
                "profit_factor": 0, "max_drawdown": 100, "sharpe_ratio": 0,
                "total_pnl_pct": -999}


def score_profit(m: dict) -> float:
    """Scoring для цели 'profit': макс PnL с штрафом за DD и мало сделок."""
    pnl = m["total_pnl_pct"]
    dd = m["max_drawdown"]
    trades = m["total_trades"]
    wr = m["win_rate"]
    pf = m["profit_factor"]

    if trades < 3:
        return -999

    # Основа: PnL% с штрафом за drawdown
    score = pnl - dd * 0.3
    # Бонус за win rate > 40%
    if wr > 0.4:
        score += (wr - 0.4) * 50
    # Бонус за profit factor > 1.5
    if pf > 1.5:
        score += (pf - 1.5) * 10
    # Бонус за больше сделок (статистическая значимость)
    if trades >= 10:
        score += min(trades, 50) * 0.5

    return round(score, 2)


def apply_params(base: dict, params: dict) -> dict:
    """Применить параметры к конфигу (nested keys через точку)."""
    config = copy.deepcopy(base)
    for key, value in params.items():
        parts = key.split(".")
        d = config
        for part in parts[:-1]:
            d = d.setdefault(part, {})
        d[parts[-1]] = value
    return config


def grid_search(ohlcv: OHLCV, base_config: dict, param_grid: dict, phase_name: str, top_n: int = 10) -> list[dict]:
    """Запустить grid search и вернуть top_n лучших результатов."""
    keys = list(param_grid.keys())
    values = list(param_grid.values())
    combinations = list(itertools.product(*values))
    total = len(combinations)

    logger.info("=== %s: %d комбинаций ===", phase_name, total)
    results = []
    start_time = time.time()

    for idx, combo in enumerate(combinations):
        params = dict(zip(keys, combo))
        config = apply_params(base_config, params)
        metrics = run_single_backtest(ohlcv, config)
        score = score_profit(metrics)

        results.append({
            "params": params,
            "metrics": metrics,
            "score": score,
        })

        if (idx + 1) % 25 == 0 or idx == total - 1:
            elapsed = time.time() - start_time
            rate = (idx + 1) / elapsed
            eta = (total - idx - 1) / rate if rate > 0 else 0
            best_so_far = max(r["score"] for r in results)
            logger.info("[%s] %d/%d (%.1f/sec, ETA: %.0fs) best=%.1f",
                        phase_name, idx + 1, total, rate, eta, best_so_far)

    results.sort(key=lambda r: r["score"], reverse=True)
    elapsed = time.time() - start_time
    logger.info("%s завершен за %.1fs. Лучший score: %.2f, PnL: %.2f%%",
                phase_name, elapsed, results[0]["score"], results[0]["metrics"]["total_pnl_pct"])

    return results[:top_n]


def main() -> None:
    """Многофазная оптимизация."""
    logger.info("=" * 60)
    logger.info("ОПТИМИЗАЦИЯ RIVERUSDT / Lorentzian KNN / 15m")
    logger.info("Цель: максимальный профит")
    logger.info("Период: %s - %s", START_DATE.strftime("%Y-%m-%d"), END_DATE.strftime("%Y-%m-%d"))
    logger.info("=" * 60)

    # === Загрузить свечи ===
    candles = fetch_candles(SYMBOL, TIMEFRAME, START_DATE, END_DATE)
    if len(candles) < 200:
        logger.error("Мало свечей: %d < 200", len(candles))
        return
    ohlcv = candles_to_ohlcv(candles)

    # Базовый бэктест (текущий конфиг)
    logger.info("\n--- Базовый бэктест (текущий конфиг) ---")
    base_metrics = run_single_backtest(ohlcv, BASE_CONFIG)
    base_score = score_profit(base_metrics)
    logger.info("Базовый: PnL=%.2f%%, trades=%d, WR=%.1f%%, DD=%.1f%%, Sharpe=%.2f, Score=%.1f",
                base_metrics["total_pnl_pct"], base_metrics["total_trades"],
                base_metrics["win_rate"] * 100, base_metrics["max_drawdown"],
                base_metrics["sharpe_ratio"], base_score)

    # =========================================
    # PHASE 1: Coarse Grid Search
    # Ключевые risk параметры (3*4*4*3 = 144 комбинаций)
    # =========================================
    phase1_grid = {
        "risk.stop_atr_mult": [1.5, 2.0, 3.0],
        "risk.tp_atr_mult": [8, 15, 20, 30],
        "risk.trailing_atr_mult": [4, 8, 12, 18],
        "filters.min_confluence": [2.0, 3.0, 4.0],
    }
    phase1_results = grid_search(ohlcv, BASE_CONFIG, phase1_grid, "Phase 1 (Coarse)", top_n=10)

    # =========================================
    # PHASE 2: Fine Grid Search
    # Уточнение вокруг лучших зон (3*3*3*3*3 = 243 комбинаций)
    # =========================================
    best_p1 = phase1_results[0]["params"]

    best_sl = best_p1["risk.stop_atr_mult"]
    best_tp = best_p1["risk.tp_atr_mult"]
    best_trail = best_p1["risk.trailing_atr_mult"]
    best_conf = best_p1["filters.min_confluence"]

    phase2_grid = {
        "risk.stop_atr_mult": [max(1.0, best_sl - 0.5), best_sl, best_sl + 0.5],
        "risk.tp_atr_mult": [max(3, best_tp - 5), best_tp, best_tp + 5],
        "risk.trailing_atr_mult": [max(2, best_trail - 3), best_trail, best_trail + 3],
        "filters.min_confluence": [max(1.5, best_conf - 0.5), best_conf, best_conf + 0.5],
        "filters.adx_threshold": [5, 8, 12],
    }
    phase2_results = grid_search(ohlcv, BASE_CONFIG, phase2_grid, "Phase 2 (Fine)", top_n=10)

    # =========================================
    # PHASE 3: Tuning
    # KNN + cooldown на топ-3 конфигах (3 * 36 = 108 комбинаций)
    # =========================================
    phase3_results = []
    for rank, p2_result in enumerate(phase2_results[:3]):
        base_tuning = apply_params(BASE_CONFIG, p2_result["params"])

        tuning_grid = {
            "knn.neighbors": [6, 8, 12],
            "knn.lookback": [30, 50],
            "risk.min_bars_trailing": [3, 5, 8],
            "risk.cooldown_bars": [5, 10],
        }
        tuning_results = grid_search(ohlcv, base_tuning, tuning_grid, f"Phase 3 (Tune #{rank+1})", top_n=3)

        for tr in tuning_results:
            full_params = {**p2_result["params"], **tr["params"]}
            phase3_results.append({
                "params": full_params,
                "metrics": tr["metrics"],
                "score": tr["score"],
            })

    phase3_results.sort(key=lambda r: r["score"], reverse=True)

    # =========================================
    # ОТЧЕТ
    # =========================================
    logger.info("\n" + "=" * 60)
    logger.info("РЕЗУЛЬТАТЫ ОПТИМИЗАЦИИ")
    logger.info("=" * 60)

    logger.info("\nБАЗОВЫЙ КОНФИГ:")
    logger.info("  PnL=%.2f%%, trades=%d, WR=%.1f%%, DD=%.1f%%, Score=%.1f",
                base_metrics["total_pnl_pct"], base_metrics["total_trades"],
                base_metrics["win_rate"] * 100, base_metrics["max_drawdown"], base_score)

    logger.info("\nТОП-5 КОНФИГОВ:")
    top5 = phase3_results[:5]
    for i, r in enumerate(top5):
        m = r["metrics"]
        logger.info(
            "  #%d: PnL=%.2f%% | trades=%d | WR=%.1f%% | DD=%.1f%% | PF=%.2f | Sharpe=%.2f | Score=%.1f",
            i + 1, m["total_pnl_pct"], m["total_trades"],
            m["win_rate"] * 100, m["max_drawdown"], m["profit_factor"],
            m["sharpe_ratio"], r["score"],
        )
        logger.info("     %s", json.dumps(r["params"], indent=None))

    # Сохранить результаты
    output = {
        "symbol": SYMBOL,
        "timeframe": TIMEFRAME,
        "period": f"{START_DATE.strftime('%Y-%m-%d')} - {END_DATE.strftime('%Y-%m-%d')}",
        "candles": len(candles),
        "goal": "profit",
        "base_metrics": base_metrics,
        "base_score": base_score,
        "top_configs": [
            {
                "rank": i + 1,
                "params": r["params"],
                "metrics": r["metrics"],
                "score": r["score"],
            }
            for i, r in enumerate(top5)
        ],
        "total_combinations_tested": {
            "phase1": len(list(itertools.product(*phase1_grid.values()))),
            "phase2": len(list(itertools.product(*phase2_grid.values()))),
            "phase3": "3 x " + str(len(list(itertools.product(*{
                "knn.neighbors": [6, 8, 10, 12],
                "knn.lookback": [30, 50, 70],
                "risk.min_bars_trailing": [3, 5, 8],
                "risk.cooldown_bars": [5, 10, 15],
            }.values())))),
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    results_path = Path(__file__).parent.parent.parent / "optimization_results.json"
    results_path.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info("\nРезультаты сохранены: %s", results_path)

    # Сохранить отчет
    report_dir = Path(__file__).parent.parent.parent / "docs" / "optimization"
    report_dir.mkdir(parents=True, exist_ok=True)
    report_path = report_dir / f"{datetime.now().strftime('%Y-%m-%d')}-river-15m-profit.md"

    report_lines = [
        f"# Оптимизация {SYMBOL} / Lorentzian KNN / {TIMEFRAME}m",
        f"\nДата: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        f"Период: {START_DATE.strftime('%Y-%m-%d')} - {END_DATE.strftime('%Y-%m-%d')}",
        f"Свечей: {len(candles)}, Цель: максимальный профит",
        f"\n## Базовый конфиг",
        f"- PnL: {base_metrics['total_pnl_pct']:.2f}%",
        f"- Trades: {base_metrics['total_trades']}, WR: {base_metrics['win_rate']*100:.1f}%",
        f"- DD: {base_metrics['max_drawdown']:.1f}%, Sharpe: {base_metrics['sharpe_ratio']:.2f}",
        f"\n## Топ-5 конфигов",
    ]
    for i, r in enumerate(top5):
        m = r["metrics"]
        report_lines.extend([
            f"\n### #{i+1} (Score: {r['score']:.1f})",
            f"- PnL: {m['total_pnl_pct']:.2f}%",
            f"- Trades: {m['total_trades']}, WR: {m['win_rate']*100:.1f}%",
            f"- DD: {m['max_drawdown']:.1f}%, PF: {m['profit_factor']:.2f}, Sharpe: {m['sharpe_ratio']:.2f}",
            f"- Параметры:",
            f"```json",
            json.dumps(r["params"], indent=2, ensure_ascii=False),
            f"```",
        ])

    report_path.write_text("\n".join(report_lines), encoding="utf-8")
    logger.info("Отчет: %s", report_path)


if __name__ == "__main__":
    main()
