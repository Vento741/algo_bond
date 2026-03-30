"""Бизнес-логика модуля market."""

import asyncio
import json
import logging

from app.modules.market.bybit_client import BybitClient
from app.redis import pool as redis_pool

logger = logging.getLogger(__name__)

CACHE_TTL_TICKER = 5
CACHE_TTL_KLINES = 60


class MarketService:
    """Сервис рыночных данных с кэшированием в Redis."""

    def __init__(self, client: BybitClient | None = None) -> None:
        self.client = client or BybitClient()

    async def get_klines(self, symbol: str, interval: str = "5", limit: int = 200) -> list[dict]:
        """Получить свечи с кэшированием в Redis."""
        cache_key = f"market:candles:{symbol}:{interval}:{limit}"
        try:
            cached = await redis_pool.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            logger.warning("Redis cache read failed for %s", cache_key)
        candles = await asyncio.to_thread(self.client.get_klines, symbol, interval, limit)
        try:
            await redis_pool.set(cache_key, json.dumps(candles), ex=CACHE_TTL_KLINES)
        except Exception:
            logger.warning("Redis cache write failed for %s", cache_key)
        return candles

    async def get_klines_range(
        self, symbol: str, interval: str, start_ms: int, end_ms: int, max_candles: int = 20000,
    ) -> list[dict]:
        """Загрузить все свечи за период с пагинацией Bybit API (limit=1000 per call)."""
        all_candles: list[dict] = []
        current_end = end_ms

        while current_end > start_ms and len(all_candles) < max_candles:
            batch = await asyncio.to_thread(
                self.client.get_klines, symbol, interval, 1000,
                start=start_ms, end=current_end,
            )
            if not batch:
                break
            all_candles = batch + all_candles
            first_ts = batch[0]["timestamp"]
            if first_ts <= start_ms:
                break
            current_end = first_ts - 1

        # Дедупликация и сортировка
        seen: set[int] = set()
        unique: list[dict] = []
        for c in all_candles:
            ts = c["timestamp"]
            if ts not in seen:
                seen.add(ts)
                unique.append(c)
        unique.sort(key=lambda c: c["timestamp"])
        return unique[:max_candles]

    async def get_ticker(self, symbol: str) -> dict:
        """Получить тикер с кэшированием."""
        cache_key = f"market:ticker:{symbol}"
        try:
            cached = await redis_pool.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass
        ticker = await asyncio.to_thread(self.client.get_ticker, symbol)
        result = {
            "symbol": ticker.symbol, "last_price": ticker.last_price,
            "mark_price": ticker.mark_price, "volume_24h": ticker.volume_24h,
            "high_24h": ticker.high_24h, "low_24h": ticker.low_24h,
            "funding_rate": ticker.funding_rate, "bid1_price": ticker.bid1_price,
            "ask1_price": ticker.ask1_price,
        }
        try:
            await redis_pool.set(cache_key, json.dumps(result), ex=CACHE_TTL_TICKER)
        except Exception:
            pass
        return result

    async def get_symbol_info(self, symbol: str) -> dict:
        """Получить информацию об инструменте."""
        info = await asyncio.to_thread(self.client.get_symbol_info, symbol)
        return {
            "symbol": info.symbol, "tick_size": info.tick_size, "qty_step": info.qty_step,
            "min_qty": info.min_qty, "max_qty": info.max_qty,
            "min_notional": info.min_notional, "max_leverage": info.max_leverage,
        }

    async def get_wallet_balance(self, coin: str = "USDT") -> dict:
        """Получить баланс кошелька."""
        return await asyncio.to_thread(self.client.get_wallet_balance, coin)
