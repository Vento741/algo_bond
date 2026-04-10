"""Telegram Bot instance, Dispatcher, lifecycle."""

import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode

from app.config import settings

logger = logging.getLogger(__name__)

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


async def shutdown_telegram_bot() -> None:
    """Завершение бота при остановке FastAPI."""
    global bot, dp
    if bot is None:
        return

    try:
        await bot.delete_webhook(drop_pending_updates=True)
    except Exception:
        logger.exception("Ошибка удаления webhook")

    await bot.session.close()
    bot = None
    dp = None
    logger.info("Telegram бот остановлен")
