"""Inline-клавиатуры для Telegram бота."""

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

from app.config import settings


def webapp_button(text: str = "Открыть платформу", path: str = "") -> InlineKeyboardMarkup:
    """Кнопка для открытия WebApp Mini App.

    Args:
        text: Текст кнопки.
        path: Путь внутри WebApp (добавляется к базовому URL).

    Returns:
        InlineKeyboardMarkup с одной кнопкой WebApp.
    """
    url = f"{settings.telegram_webapp_url}{path}" if path else settings.telegram_webapp_url
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=text, web_app=WebAppInfo(url=url))]
        ]
    )


def bot_control_buttons(bot_id: str, is_running: bool) -> InlineKeyboardMarkup:
    """Кнопки управления торговым ботом (старт/стоп + подробнее).

    Args:
        bot_id: UUID бота в виде строки.
        is_running: Текущий статус бота.

    Returns:
        InlineKeyboardMarkup с кнопками управления.
    """
    if is_running:
        return InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(text="Остановить", callback_data=f"bot_stop:{bot_id}")],
                [
                    InlineKeyboardButton(
                        text="Подробнее",
                        web_app=WebAppInfo(url=f"{settings.telegram_webapp_url}/bots/{bot_id}"),
                    )
                ],
            ]
        )
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Запустить", callback_data=f"bot_start:{bot_id}")],
        ]
    )


def position_buttons(position_id: str) -> InlineKeyboardMarkup:
    """Кнопка закрытия открытой позиции.

    Args:
        position_id: UUID позиции в виде строки.

    Returns:
        InlineKeyboardMarkup с кнопкой закрытия.
    """
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Закрыть позицию",
                    callback_data=f"close_pos:{position_id}",
                )
            ],
        ]
    )


def confirm_close_position(position_id: str) -> InlineKeyboardMarkup:
    """Клавиатура подтверждения закрытия позиции.

    Args:
        position_id: UUID позиции в виде строки.

    Returns:
        InlineKeyboardMarkup с кнопками Да/Отмена.
    """
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Да, закрыть",
                    callback_data=f"confirm_close:{position_id}",
                ),
                InlineKeyboardButton(text="Отмена", callback_data="cancel"),
            ],
        ]
    )


def admin_panel() -> InlineKeyboardMarkup:
    """Кнопки административной панели.

    Returns:
        InlineKeyboardMarkup с кнопками управления сервером.
    """
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Health Check", callback_data="admin_health")],
            [InlineKeyboardButton(text="Логи API", callback_data="admin_logs")],
            [InlineKeyboardButton(text="Пользователи", callback_data="admin_users")],
            [
                InlineKeyboardButton(
                    text="Открыть админку",
                    web_app=WebAppInfo(url=f"{settings.telegram_webapp_url}/../admin"),
                )
            ],
        ]
    )
