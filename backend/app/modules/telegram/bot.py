"""Telegram Bot instance, Dispatcher, lifecycle."""

import asyncio
import json
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode

from app.config import settings

logger = logging.getLogger(__name__)

_chat_listener_task: asyncio.Task | None = None

# Глобальный Bot instance (для отправки из любого контекста)
bot: Bot | None = None
dp: Dispatcher | None = None


def get_bot() -> Bot:
    """Получить Bot instance. Raises если не инициализирован."""
    if bot is None:
        raise RuntimeError("Telegram bot не инициализирован")
    return bot


async def setup_telegram_bot() -> None:
    """Инициализация бота при старте FastAPI."""
    global bot, dp

    if not settings.telegram_bot_token:
        logger.warning("TELEGRAM_BOT_TOKEN не задан, бот отключен")
        return

    bot = Bot(
        token=settings.telegram_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )

    dp = Dispatcher()

    # Подключить middleware
    from app.modules.telegram.middleware import DbSessionMiddleware
    from app.database import async_session
    dp.update.middleware(DbSessionMiddleware(session_pool=async_session))

    # Подключить handlers
    from app.modules.telegram.handlers import register_handlers
    register_handlers(dp)

    # Установить webhook (только в production)
    if settings.app_env != "development":
        webhook_url = "https://algo.dev-james.bond/api/telegram/webhook"
        await bot.set_webhook(
            url=webhook_url,
            secret_token=settings.telegram_webhook_secret,
            allowed_updates=["message", "callback_query", "web_app_data"],
        )
        logger.info("Telegram webhook установлен: %s", webhook_url)
    else:
        logger.info("Dev mode: Telegram webhook не устанавливается")

    # Background listener для пересылки Sentinel chat:out -> TG
    global _chat_listener_task
    if settings.telegram_admin_chat_id:
        _chat_listener_task = asyncio.create_task(_sentinel_chat_listener())
        logger.info("Sentinel chat->TG listener запущен")


async def _sentinel_chat_listener() -> None:
    """Background: пересылка ответов Sentinel из Redis pub/sub в TG admin chat."""
    from app.redis import get_redis

    admin_chat_id = settings.telegram_admin_chat_id
    if not admin_chat_id or bot is None:
        return

    redis = get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe("algobond:agent:chat:out")

    try:
        async for raw in pubsub.listen():
            if raw["type"] != "message":
                continue
            try:
                data = json.loads(raw["data"])
                msg_type = data.get("type", "")
                content = data.get("content", "")
                if not content or msg_type not in ("agent_message", "agent_log"):
                    continue

                prefix = "🤖 <b>Sentinel:</b>\n" if msg_type == "agent_message" else "📋 "
                text = prefix + content
                if len(text) > 4000:
                    text = text[:4000] + "..."
                await bot.send_message(admin_chat_id, text, parse_mode="HTML")
            except Exception:
                logger.debug("Sentinel chat listener: parse error", exc_info=True)
    except asyncio.CancelledError:
        pass
    except Exception:
        logger.exception("Sentinel chat listener crashed")
    finally:
        await pubsub.unsubscribe("algobond:agent:chat:out")
        await pubsub.close()
        await redis.aclose()


async def shutdown_telegram_bot() -> None:
    """Завершение бота при остановке FastAPI."""
    global bot, dp, _chat_listener_task
    if bot is None:
        return

    if _chat_listener_task and not _chat_listener_task.done():
        _chat_listener_task.cancel()
        _chat_listener_task = None

    try:
        await bot.delete_webhook(drop_pending_updates=True)
    except Exception:
        logger.exception("Ошибка удаления webhook")

    await bot.session.close()
    bot = None
    dp = None
    logger.info("Telegram бот остановлен")
