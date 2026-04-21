"""Перезаписывает config JSONB для существующих SMC v2 StrategyConfig.

В БД обнаружены конфиги с мусорными ключами (hybrid/knn/supertrend/squeeze/ribbon),
вероятно остатками от слияния с default_config старых стратегий.
Этот скрипт:
1. Читает portfolio.json (правильные v2 конфиги от grid search)
2. Находит StrategyConfig по (user=admin, strategy=smc-sweep-scalper-v2, symbol)
3. ПОЛНОСТЬЮ заменяет поле config чистым payload из portfolio.json
4. НЕ удаляет записи, НЕ меняет name/user/strategy — только config JSONB

Идемпотентен. Не опасен (UPDATE, не DELETE).

Запуск:
  docker compose exec -T api python scripts/rewrite_smc_v2_configs.py \\
    --portfolio /tmp/portfolio.json --admin-email web-dusha@yandex.ru
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from app.database import async_session
from app.modules.auth.models import User
from app.modules.billing.models import Subscription  # noqa: F401
from app.modules.strategy.models import Strategy, StrategyConfig

logger = logging.getLogger(__name__)

STRATEGY_SLUG = "smc-sweep-scalper-v2"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Rewrite SMC v2 configs in DB")
    parser.add_argument("--portfolio", type=Path, required=True)
    parser.add_argument("--admin-email", default="web-dusha@yandex.ru")
    return parser.parse_args()


async def rewrite(portfolio_path: Path, admin_email: str) -> int:
    with portfolio_path.open("r", encoding="utf-8") as f:
        portfolio = json.load(f)
    tokens: dict[str, dict] = portfolio.get("tokens", {})
    if not tokens:
        logger.error("No tokens in portfolio")
        return 1

    async with async_session() as db:
        uq = await db.execute(select(User).where(User.email == admin_email))
        admin = uq.scalar_one_or_none()
        if not admin:
            logger.error("Admin user not found: %s", admin_email)
            return 1

        sq = await db.execute(select(Strategy).where(Strategy.slug == STRATEGY_SLUG))
        strat = sq.scalar_one_or_none()
        if not strat:
            logger.error("Strategy not found: %s", STRATEGY_SLUG)
            return 1

        updated = not_found = 0
        for symbol, entry in tokens.items():
            new_config = dict(entry.get("config") or {})
            if not new_config:
                logger.warning("[%s] no config in portfolio — skip", symbol)
                continue

            # Гарантируем multi-TP + breakeven (читается celery backtest)
            risk = new_config.setdefault("risk", {})
            risk.setdefault("use_multi_tp", True)
            risk.setdefault("use_breakeven", True)

            cq = await db.execute(
                select(StrategyConfig).where(
                    StrategyConfig.user_id == admin.id,
                    StrategyConfig.strategy_id == strat.id,
                    StrategyConfig.symbol == symbol,
                )
            )
            cfg = cq.scalar_one_or_none()
            if not cfg:
                logger.warning("[%s] StrategyConfig not found — skip", symbol)
                not_found += 1
                continue

            old_keys = sorted(cfg.config.keys())
            new_keys = sorted(new_config.keys())
            cfg.config = new_config
            flag_modified(cfg, "config")
            updated += 1
            logger.info("[%s] REWRITE: %d->%d keys | %s", symbol, len(old_keys), len(new_keys), new_keys)

        if updated > 0:
            await db.commit()

        logger.info("Summary: %d rewritten, %d not found", updated, not_found)
        return 0


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    args = parse_args()
    if not args.portfolio.exists():
        logger.error("Portfolio not found: %s", args.portfolio)
        return 1
    return asyncio.run(rewrite(args.portfolio, args.admin_email))


if __name__ == "__main__":
    sys.exit(main())
