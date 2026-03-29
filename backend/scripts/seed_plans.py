"""Скрипт инициализации тарифных планов."""

import asyncio
import sys
from decimal import Decimal
from pathlib import Path

# Добавить корень проекта в sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from app.database import async_session
from app.modules.auth.models import User  # noqa: F401 — нужен для relationship resolution
from app.modules.billing.models import Plan

PLANS = [
    {
        "name": "Free",
        "slug": "free",
        "price_monthly": Decimal("0.00"),
        "max_bots": 1,
        "max_strategies": 1,
        "max_backtests_per_day": 5,
        "features": {"demo_mode": True},
    },
    {
        "name": "Basic",
        "slug": "basic",
        "price_monthly": Decimal("19.99"),
        "max_bots": 3,
        "max_strategies": 5,
        "max_backtests_per_day": 20,
        "features": {"demo_mode": True, "live_trading": True},
    },
    {
        "name": "Pro",
        "slug": "pro",
        "price_monthly": Decimal("49.99"),
        "max_bots": 10,
        "max_strategies": 10,
        "max_backtests_per_day": 100,
        "features": {
            "demo_mode": True,
            "live_trading": True,
            "priority_support": True,
            "custom_strategies": True,
        },
    },
    {
        "name": "VIP",
        "slug": "vip",
        "price_monthly": Decimal("99.99"),
        "max_bots": 50,
        "max_strategies": 50,
        "max_backtests_per_day": 500,
        "features": {
            "demo_mode": True,
            "live_trading": True,
            "priority_support": True,
            "custom_strategies": True,
            "api_access": True,
            "dedicated_server": True,
        },
    },
]


async def seed_plans() -> None:
    """Создать начальные тарифные планы (идемпотентно)."""
    async with async_session() as db:
        for plan_data in PLANS:
            result = await db.execute(
                select(Plan).where(Plan.slug == plan_data["slug"])
            )
            if result.scalar_one_or_none():
                print(f"  План '{plan_data['name']}' уже существует, пропуск")
                continue

            plan = Plan(**plan_data)
            db.add(plan)
            print(f"  + Создан план: {plan_data['name']} (${plan_data['price_monthly']}/мес)")

        await db.commit()
    print("Seed завершён!")


if __name__ == "__main__":
    asyncio.run(seed_plans())
