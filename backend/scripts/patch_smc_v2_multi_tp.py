"""Одноразовый патч: добавляет use_multi_tp=True + use_breakeven=True
в risk-секцию всех существующих StrategyConfig для smc-sweep-scalper-v2.

Проблема: optimizer хардкодил эти флаги при вызове run_backtest,
но не сохранял их в config. Celery backtest (UI) читает их из
config.risk с дефолтом False — в итоге работает single-TP без breakeven
и даёт на порядок меньше сделок чем локальный grid.

Запуск внутри API контейнера:
    docker compose exec -T api python scripts/patch_smc_v2_multi_tp.py
"""

from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from app.database import async_session
from app.modules.auth.models import User  # noqa: F401
from app.modules.billing.models import Subscription  # noqa: F401
from app.modules.strategy.models import Strategy, StrategyConfig

logger = logging.getLogger(__name__)

STRATEGY_SLUG = "smc-sweep-scalper-v2"


async def patch() -> int:
    async with async_session() as db:
        strat_q = await db.execute(select(Strategy).where(Strategy.slug == STRATEGY_SLUG))
        strategy = strat_q.scalar_one_or_none()
        if not strategy:
            logger.error("Стратегия %s не найдена", STRATEGY_SLUG)
            return 1

        # Обновить default_config стратегии
        strategy_risk = strategy.default_config.setdefault("risk", {})
        strat_changed = False
        if not strategy_risk.get("use_multi_tp"):
            strategy_risk["use_multi_tp"] = True
            strat_changed = True
        if not strategy_risk.get("use_breakeven"):
            strategy_risk["use_breakeven"] = True
            strat_changed = True
        if strat_changed:
            flag_modified(strategy, "default_config")
            logger.info("Strategy default_config: patched use_multi_tp + use_breakeven")

        # Обновить все StrategyConfig для этой стратегии
        cfg_q = await db.execute(
            select(StrategyConfig).where(StrategyConfig.strategy_id == strategy.id)
        )
        configs = cfg_q.scalars().all()
        logger.info("Найдено %d конфигов для стратегии '%s'", len(configs), STRATEGY_SLUG)

        patched = already_ok = 0
        for cfg in configs:
            risk = cfg.config.setdefault("risk", {})
            changed = False
            if not risk.get("use_multi_tp"):
                risk["use_multi_tp"] = True
                changed = True
            if not risk.get("use_breakeven"):
                risk["use_breakeven"] = True
                changed = True
            if changed:
                flag_modified(cfg, "config")
                patched += 1
                logger.info("  [%s] %s patched", cfg.symbol, cfg.name)
            else:
                already_ok += 1
                logger.info("  [%s] уже OK: %s", cfg.symbol, cfg.name)

        if patched > 0 or strat_changed:
            await db.commit()

        logger.info("Summary: %d patched, %d already OK, strategy default_config: %s",
                    patched, already_ok, "patched" if strat_changed else "OK")
        return 0


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )
    return asyncio.run(patch())


if __name__ == "__main__":
    sys.exit(main())
