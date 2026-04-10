"""Обработчики команд /help, /app, /settings."""

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from app.modules.telegram.keyboards import webapp_button

router = Router(name="help")


@router.message(Command("help"))
async def help_command(message: Message) -> None:
    """Справка по командам бота."""
    await message.answer(
        "<b>Команды:</b>\n\n"
        "/status - Статус ботов\n"
        "/pnl - Текущий P&L\n"
        "/balance - Баланс аккаунта\n"
        "/positions - Открытые позиции\n"
        "/app - Открыть платформу\n"
        "/settings - Настройки\n"
        "/help - Эта справка\n\n"
        "<b>Администратор:</b>\n"
        "/admin - Панель управления\n"
        "/health - Статус сервисов"
    )


@router.message(Command("app"))
async def app_command(message: Message) -> None:
    """Открыть платформу AlgoBond."""
    await message.answer("Откройте платформу:", reply_markup=webapp_button())


@router.message(Command("settings"))
async def settings_command(message: Message) -> None:
    """Открыть настройки в ЛК."""
    await message.answer(
        "Настройки:",
        reply_markup=webapp_button("Настройки", "/settings"),
    )
