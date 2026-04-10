"""Обработчик команды /start с поддержкой deep link привязки."""

from aiogram import Router
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import Message
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.telegram.keyboards import webapp_button
from app.modules.telegram.service import TelegramService

router = Router(name="start")


@router.message(CommandStart(deep_link=True))
async def start_deep_link(
    message: Message, command: CommandObject, session: AsyncSession
) -> None:
    """Привязка аккаунта через deep link токен."""
    token = command.args
    if not token:
        await start_welcome(message, session)
        return

    service = TelegramService(session)
    link = await service.link_telegram(
        token=token,
        telegram_id=message.from_user.id,
        telegram_username=message.from_user.username,
        chat_id=message.chat.id,
    )

    if link:
        await message.answer(
            "Аккаунт привязан!\n"
            "Настройте уведомления: Настройки -> Уведомления",
            reply_markup=webapp_button(),
        )
    else:
        await message.answer(
            "Ссылка недействительна или истекла.\n"
            "Создайте новую в ЛК: Настройки -> Telegram"
        )


@router.message(CommandStart())
async def start_welcome(message: Message, session: AsyncSession) -> None:
    """Короткое приветствие."""
    await message.answer(
        "<b>AlgoBond</b> - алготрейдинг криптофьючерсов",
        reply_markup=webapp_button(),
    )
