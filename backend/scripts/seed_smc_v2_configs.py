"""Seed SMC Sweep Scalper v2 StrategyConfig records for admin user.

Читает portfolio_import_ready.json (13 профитных токенов после v2 grid search)
и создаёт по одной StrategyConfig на каждый токен в БД для admin пользователя.

Идемпотентен — пропускает уже существующие конфиги по имени.

Запуск внутри API контейнера (прямой DB доступ, без JWT):
    docker compose exec -T api python scripts/seed_smc_v2_configs.py \
        --portfolio /tmp/smc_scalper_v2_portfolio_import_ready.json \
        --admin-email web-dusha@yandex.ru

Структура portfolio JSON:
{
  "engine_type": "smc_sweep_scalper_v2",
  "timeframe": "5",
  "tokens": {
    "TAOUSDT": {"config": {...}, "metrics": {...}},
    ...
  }
}
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

from app.database import async_session
from app.modules.auth.models import User
from app.modules.billing.models import Subscription  # noqa: F401 — нужен для relationship resolution
from app.modules.strategy.models import Strategy, StrategyConfig

logger = logging.getLogger(__name__)

STRATEGY_SLUG = "smc-sweep-scalper-v2"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed SMC v2 StrategyConfigs from portfolio JSON directly into DB",
    )
    parser.add_argument(
        "--portfolio",
        type=Path,
        required=True,
        help="Path to smc_scalper_v2_portfolio_import_ready.json",
    )
    parser.add_argument(
        "--admin-email",
        default="web-dusha@yandex.ru",
        help="Admin user email whose configs we create",
    )
    parser.add_argument(
        "--name-prefix",
        default="SMC v2",
        help='Префикс имени конфига, итог: "{prefix} {SYMBOL} (PF X.XX)"',
    )
    return parser.parse_args(argv)


def generate_name(prefix: str, symbol: str, metrics: dict) -> str:
    """Читаемое имя для UI."""
    pf = metrics.get("profit_factor", 0.0)
    pnl = metrics.get("total_pnl_pct", 0.0)
    return f"{prefix} {symbol} (PF{pf:.2f} PnL{pnl:+.0f}%)"


async def seed_configs(portfolio_path: Path, admin_email: str, name_prefix: str) -> int:
    """Создать конфиги в БД идемпотентно. Возвращает exit code."""
    with portfolio_path.open("r", encoding="utf-8") as f:
        portfolio = json.load(f)

    timeframe = portfolio.get("timeframe", "5")
    tokens: dict[str, dict] = portfolio.get("tokens", {})
    if not tokens:
        logger.error("No tokens in portfolio file")
        return 1

    logger.info("Загружено %d токенов из %s", len(tokens), portfolio_path.name)

    async with async_session() as db:
        # Найти admin пользователя
        user_q = await db.execute(select(User).where(User.email == admin_email))
        admin = user_q.scalar_one_or_none()
        if not admin:
            logger.error("Admin пользователь с email %s не найден", admin_email)
            return 1
        logger.info("Admin user: id=%s email=%s", admin.id, admin.email)

        # Найти стратегию
        strat_q = await db.execute(select(Strategy).where(Strategy.slug == STRATEGY_SLUG))
        strategy = strat_q.scalar_one_or_none()
        if not strategy:
            logger.error("Стратегия со slug '%s' не найдена — сначала запусти seed_strategy.py", STRATEGY_SLUG)
            return 1
        logger.info("Strategy: id=%s name=%s", strategy.id, strategy.name)

        # Существующие конфиги пользователя для этой стратегии — чтобы не дублировать
        existing_q = await db.execute(
            select(StrategyConfig.name, StrategyConfig.symbol).where(
                StrategyConfig.user_id == admin.id,
                StrategyConfig.strategy_id == strategy.id,
            )
        )
        existing_names = {row[0] for row in existing_q.all()}

        created = skipped = errors = 0
        for symbol, entry in tokens.items():
            metrics = entry.get("metrics", {})
            config = entry.get("config", {})
            if not config:
                logger.warning("[%s] нет config — пропускаем", symbol)
                errors += 1
                continue

            name = generate_name(name_prefix, symbol, metrics)

            # Критический fix: optimizer захардкодил use_multi_tp=True, use_breakeven=True,
            # но эти флаги не попали в сохранённый config. Celery backtest читает их из
            # risk section с дефолтом False — в итоге UI backtest работает в single-TP
            # режиме без breakeven и даёт на порядок меньше сделок чем локальный grid.
            risk_section = config.setdefault("risk", {})
            risk_section.setdefault("use_multi_tp", True)
            risk_section.setdefault("use_breakeven", True)

            if name in existing_names:
                logger.info("[%s] SKIP (уже существует): %s", symbol, name)
                skipped += 1
                continue

            new_cfg = StrategyConfig(
                user_id=admin.id,
                strategy_id=strategy.id,
                name=name,
                symbol=symbol,
                timeframe=timeframe,
                config=config,
            )
            db.add(new_cfg)
            logger.info("[%s] CREATE: %s", symbol, name)
            created += 1

        if created > 0:
            await db.commit()

        logger.info("Summary: %d created, %d skipped, %d errors", created, skipped, errors)
        return 0 if errors == 0 else 2


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )
    args = parse_args()
    if not args.portfolio.exists():
        logger.error("Portfolio file not found: %s", args.portfolio)
        return 1
    return asyncio.run(
        seed_configs(args.portfolio, args.admin_email, args.name_prefix)
    )


if __name__ == "__main__":
    sys.exit(main())
