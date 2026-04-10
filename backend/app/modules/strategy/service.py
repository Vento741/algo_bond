"""Бизнес-логика модуля strategy."""

import json
import logging
import uuid
from datetime import datetime, timezone

import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictException, NotFoundException
from app.modules.market.bybit_client import BybitClient
from app.modules.market.service import MarketService
from app.modules.strategy.engines import get_engine
from app.modules.strategy.engines.base import OHLCV
from app.modules.strategy.models import Strategy, StrategyConfig
from app.modules.strategy.schemas import (
    ChartSignalResponse,
    ChartSignalsListResponse,
    StrategyConfigCreate,
    StrategyConfigUpdate,
    StrategyCreate,
    StrategyUpdate,
)
from app.redis import pool as redis_pool

logger = logging.getLogger(__name__)


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

    async def update_strategy(
        self, strategy_id: uuid.UUID, data: StrategyUpdate
    ) -> Strategy:
        """Обновить стратегию (версия, описание, видимость)."""
        strategy = await self.get_strategy(strategy_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(strategy, field, value)
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

    # === Chart Signals Evaluation ===

    @staticmethod
    def _empty_signals(
        config_id: uuid.UUID, symbol: str, timeframe: str,
        evaluated_at: str, error: str,
    ) -> ChartSignalsListResponse:
        """Пустой ответ с ошибкой."""
        return ChartSignalsListResponse(
            config_id=str(config_id), symbol=symbol, timeframe=timeframe,
            signals=[], cached=False, evaluated_at=evaluated_at, error=error,
        )

    async def evaluate_signals(
        self, config_id: uuid.UUID, user_id: uuid.UUID
    ) -> ChartSignalsListResponse:
        """Оценить сигналы стратегии для отображения на графике.

        Загружает 500 свечей, прогоняет движок стратегии, кэширует результат
        в Redis на 5 минут. Не создает записи TradeSignal в БД.
        """
        # 1. Загрузить конфиг с join на стратегию
        result = await self.db.execute(
            select(StrategyConfig)
            .options(selectinload(StrategyConfig.strategy))
            .where(
                StrategyConfig.id == config_id,
                StrategyConfig.user_id == user_id,
            )
        )
        config = result.scalar_one_or_none()
        if not config:
            raise NotFoundException("Конфигурация не найдена")

        symbol = config.symbol
        timeframe = config.timeframe
        now_iso = datetime.now(timezone.utc).isoformat()

        # 2. Проверить кэш Redis
        cache_key = f"chart_signals:{config_id}:{timeframe}"
        try:
            cached = await redis_pool.get(cache_key)
            if cached:
                data = json.loads(cached)
                data["cached"] = True
                return ChartSignalsListResponse(**data)
        except Exception:
            logger.warning("Redis cache read failed for %s", cache_key)

        # 3. Загрузить свечи через MarketService
        client = BybitClient()
        market_service = MarketService(client)
        try:
            candles = await market_service.get_klines(
                symbol=symbol, interval=timeframe, limit=500
            )
        except Exception as e:
            logger.error("Ошибка загрузки свечей %s/%s: %s", symbol, timeframe, e)
            return self._empty_signals(config_id, symbol, timeframe, now_iso,
                                       f"Ошибка загрузки рыночных данных: {str(e)[:200]}")

        if len(candles) < 50:
            return self._empty_signals(config_id, symbol, timeframe, now_iso,
                                       f"Недостаточно свечей: {len(candles)}/50")

        # 4. Конвертировать в OHLCV массивы
        arrays = client.klines_to_arrays(candles)
        ohlcv = OHLCV(
            open=arrays["open"],
            high=arrays["high"],
            low=arrays["low"],
            close=arrays["close"],
            volume=arrays["volume"],
            timestamps=arrays["timestamps"],
        )

        # 5. Запустить стратегию
        engine_type = config.strategy.engine_type
        strategy_config = config.config or config.strategy.default_config or {}
        try:
            engine = get_engine(engine_type, strategy_config)
            strategy_result = await asyncio.to_thread(engine.generate_signals, ohlcv)
        except Exception as e:
            logger.error("Ошибка движка %s: %s", engine_type, e)
            return self._empty_signals(config_id, symbol, timeframe, now_iso,
                                       f"Ошибка стратегии: {str(e)[:200]}")

        # 6. Конвертировать сигналы в chart-friendly формат
        signals: list[ChartSignalResponse] = []
        for sig in strategy_result.signals:
            # Определить knn_class для бара сигнала
            knn_class = "NEUTRAL"
            if (
                len(strategy_result.knn_classes) > sig.bar_index
                and sig.bar_index >= 0
            ):
                knn_val = strategy_result.knn_classes[sig.bar_index]
                knn_class = (
                    "BULL" if knn_val == 1 else "BEAR" if knn_val == -1 else "NEUTRAL"
                )

            # Определить knn_confidence для бара сигнала
            knn_confidence = 50.0
            if (
                len(strategy_result.knn_confidence) > sig.bar_index
                and sig.bar_index >= 0
            ):
                knn_confidence = float(strategy_result.knn_confidence[sig.bar_index])

            # Извлечь TP уровни (multi-TP)
            tp1_price = None
            tp2_price = None
            if sig.tp_levels:
                if len(sig.tp_levels) >= 1:
                    tp1_price = sig.tp_levels[0].get("price")
                if len(sig.tp_levels) >= 2:
                    tp2_price = sig.tp_levels[1].get("price")

            # Timestamp: из массива timestamps (миллисекунды -> секунды)
            timestamp_sec = 0
            if ohlcv.timestamps is not None and sig.bar_index < len(ohlcv.timestamps):
                timestamp_sec = int(ohlcv.timestamps[sig.bar_index] / 1000)

            signals.append(ChartSignalResponse(
                time=timestamp_sec,
                direction=sig.direction,
                entry_price=sig.entry_price,
                stop_loss=sig.stop_loss,
                take_profit=sig.take_profit,
                tp1_price=tp1_price,
                tp2_price=tp2_price,
                signal_strength=min(round(sig.confluence_score / 5.5 * 100, 1), 100),
                knn_class=knn_class,
                knn_confidence=knn_confidence,
                was_executed=False,
            ))

        response = ChartSignalsListResponse(
            config_id=str(config_id),
            symbol=symbol,
            timeframe=timeframe,
            signals=signals,
            cached=False,
            evaluated_at=now_iso,
        )

        # 7. Кэшировать в Redis (5 минут)
        try:
            await redis_pool.set(
                cache_key,
                response.model_dump_json(),
                ex=300,
            )
        except Exception:
            logger.warning("Redis cache write failed for %s", cache_key)

        return response
