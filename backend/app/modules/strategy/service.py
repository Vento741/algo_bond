"""Бизнес-логика модуля strategy."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictException, NotFoundException
from app.modules.strategy.models import Strategy, StrategyConfig
from app.modules.strategy.schemas import (
    StrategyConfigCreate,
    StrategyConfigUpdate,
    StrategyCreate,
)


class StrategyService:
    """Сервис стратегий и пользовательских конфигов."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # === Strategies ===

    async def list_strategies(
        self, public_only: bool = True, limit: int = 50, offset: int = 0
    ) -> list[Strategy]:
        """Список стратегий."""
        query = select(Strategy).order_by(Strategy.name)
        if public_only:
            query = query.where(Strategy.is_public.is_(True))
        query = query.limit(limit).offset(offset)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_strategy(self, strategy_id: uuid.UUID) -> Strategy:
        """Получить стратегию по ID."""
        result = await self.db.execute(
            select(Strategy).where(Strategy.id == strategy_id)
        )
        strategy = result.scalar_one_or_none()
        if not strategy:
            raise NotFoundException("Стратегия не найдена")
        return strategy

    async def get_strategy_by_slug(self, slug: str) -> Strategy:
        """Получить стратегию по slug."""
        result = await self.db.execute(
            select(Strategy).where(Strategy.slug == slug)
        )
        strategy = result.scalar_one_or_none()
        if not strategy:
            raise NotFoundException(f"Стратегия '{slug}' не найдена")
        return strategy

    async def create_strategy(
        self, data: StrategyCreate, author_id: uuid.UUID | None = None
    ) -> Strategy:
        """Создать стратегию."""
        existing = await self.db.execute(
            select(Strategy).where(Strategy.slug == data.slug)
        )
        if existing.scalar_one_or_none():
            raise ConflictException(f"Стратегия с slug '{data.slug}' уже существует")

        strategy = Strategy(**data.model_dump(), author_id=author_id)
        self.db.add(strategy)
        await self.db.flush()
        await self.db.commit()
        return strategy

    # === Strategy Configs ===

    async def list_user_configs(
        self, user_id: uuid.UUID, strategy_id: uuid.UUID | None = None,
        limit: int = 50, offset: int = 0,
    ) -> list[StrategyConfig]:
        """Список конфигов пользователя."""
        query = select(StrategyConfig).where(StrategyConfig.user_id == user_id)
        if strategy_id:
            query = query.where(StrategyConfig.strategy_id == strategy_id)
        query = query.order_by(StrategyConfig.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_config(
        self, config_id: uuid.UUID, user_id: uuid.UUID
    ) -> StrategyConfig:
        """Получить конфиг пользователя."""
        result = await self.db.execute(
            select(StrategyConfig).where(
                StrategyConfig.id == config_id,
                StrategyConfig.user_id == user_id,
            )
        )
        config = result.scalar_one_or_none()
        if not config:
            raise NotFoundException("Конфигурация не найдена")
        return config

    async def create_config(
        self, data: StrategyConfigCreate, user_id: uuid.UUID
    ) -> StrategyConfig:
        """Создать конфиг стратегии."""
        await self.get_strategy(data.strategy_id)

        config = StrategyConfig(
            user_id=user_id,
            strategy_id=data.strategy_id,
            name=data.name,
            symbol=data.symbol,
            timeframe=data.timeframe,
            config=data.config,
        )
        self.db.add(config)
        await self.db.flush()
        await self.db.commit()
        return config

    async def update_config(
        self, config_id: uuid.UUID, user_id: uuid.UUID, data: StrategyConfigUpdate
    ) -> StrategyConfig:
        """Обновить конфиг."""
        config = await self.get_config(config_id, user_id)
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(config, field, value)
        await self.db.flush()
        await self.db.commit()
        return config

    async def delete_config(
        self, config_id: uuid.UUID, user_id: uuid.UUID
    ) -> None:
        """Удалить конфиг."""
        config = await self.get_config(config_id, user_id)
        await self.db.delete(config)
        await self.db.flush()
        await self.db.commit()
