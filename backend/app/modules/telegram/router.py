"""FastAPI роутер Telegram: webhook, deep link, WebApp auth, настройки."""

import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import create_access_token, create_refresh_token
from app.database import get_db
from app.modules.auth.dependencies import get_admin_user, get_current_active_user
from app.modules.auth.models import User
from app.modules.notifications.service import NotificationService
from aiogram.types import Update

from app.modules.telegram.bot import bot, dp
from app.modules.telegram.schemas import (
    AdminNotifyRequest,
    TelegramLinkCreate,
    TelegramLinkResponse,
    TelegramSettingsResponse,
    TelegramSettingsUpdate,
    TelegramWebAppAuthRequest,
    TelegramWebAppAuthResponse,
)
from app.modules.telegram.service import TelegramService
from app.modules.telegram.webapp_auth import parse_init_data, validate_init_data

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/telegram", tags=["telegram"])


@router.post("/webhook", status_code=200)
async def telegram_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
) -> dict:
    """Получить Telegram Update через webhook.

    Проверяет секретный токен из заголовка X-Telegram-Bot-Api-Secret-Token.
    Передаёт Update в Dispatcher aiogram для обработки.
    """
    if not settings.telegram_webhook_secret:
        raise HTTPException(status_code=403, detail="Webhook не настроен")

    if x_telegram_bot_api_secret_token != settings.telegram_webhook_secret:
        raise HTTPException(status_code=403, detail="Неверный секретный токен")

    if bot is None or dp is None:
        logger.warning("Telegram bot не инициализирован, пропускаем update")
        return {"ok": True}

    body = await request.json()
    update = Update(**body)
    await dp.feed_update(bot=bot, update=update)
    return {"ok": True}


@router.post("/link", response_model=TelegramLinkCreate)
async def create_deep_link(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> TelegramLinkCreate:
    """Сгенерировать deep link токен для привязки Telegram.

    Возвращает URL вида t.me/algo_bond_bot?start={token}.
    Токен действует 15 минут.
    """
    service = TelegramService(db)
    token_obj = await service.generate_deep_link_token(current_user.id)
    deep_link_url = f"https://t.me/algo_bond_bot?start={token_obj.token}"
    return TelegramLinkCreate(
        deep_link_url=deep_link_url,
        token=token_obj.token,
        expires_in_seconds=900,
    )


@router.get("/link", response_model=TelegramLinkResponse)
async def get_link_status(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> TelegramLinkResponse:
    """Получить статус привязки Telegram аккаунта."""
    service = TelegramService(db)
    link = await service.get_link_by_user_id(current_user.id)

    if link is None:
        return TelegramLinkResponse(is_linked=False)

    notif_service = NotificationService(db)
    prefs = await notif_service.get_preferences(current_user.id)
    telegram_enabled = prefs.telegram_enabled if prefs else False

    return TelegramLinkResponse(
        is_linked=True,
        telegram_username=link.telegram_username,
        linked_at=link.linked_at,
        telegram_enabled=telegram_enabled,
    )


@router.delete("/link", status_code=200)
async def unlink_telegram(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Отвязать Telegram аккаунт пользователя."""
    service = TelegramService(db)
    removed = await service.unlink_telegram(current_user.id)
    if not removed:
        raise HTTPException(status_code=404, detail="Telegram не привязан")
    return {"ok": True, "message": "Telegram успешно отвязан"}


@router.post("/webapp/auth", response_model=TelegramWebAppAuthResponse)
async def webapp_auth(
    payload: TelegramWebAppAuthRequest,
    db: AsyncSession = Depends(get_db),
) -> TelegramWebAppAuthResponse:
    """Аутентификация через Telegram WebApp initData.

    Валидирует HMAC-подпись initData, находит пользователя по telegram_id
    и выдаёт JWT access + refresh токены.
    """
    if not settings.telegram_bot_token:
        raise HTTPException(status_code=503, detail="Telegram bot не настроен")

    is_valid = validate_init_data(
        init_data=payload.init_data,
        bot_token=settings.telegram_bot_token,
    )
    if not is_valid:
        raise HTTPException(status_code=401, detail="Невалидные данные WebApp")

    data = parse_init_data(payload.init_data)
    user_data = data.get("user")
    if not user_data:
        raise HTTPException(status_code=401, detail="Данные пользователя отсутствуют")

    telegram_id = user_data.get("id")
    if not telegram_id:
        raise HTTPException(status_code=401, detail="Telegram ID отсутствует")

    service = TelegramService(db)
    link = await service.get_link_by_telegram_id(int(telegram_id))
    if link is None:
        raise HTTPException(status_code=401, detail="Telegram аккаунт не привязан")

    access_token = create_access_token({"sub": str(link.user_id)})
    refresh_token = create_refresh_token({"sub": str(link.user_id)})

    return TelegramWebAppAuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.get("/settings", response_model=TelegramSettingsResponse)
async def get_telegram_settings(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> TelegramSettingsResponse:
    """Получить настройки Telegram-уведомлений текущего пользователя."""
    service = NotificationService(db)
    prefs = await service.get_preferences(current_user.id)

    if prefs is None:
        return TelegramSettingsResponse(
            telegram_enabled=False,
            positions_telegram=True,
            bots_telegram=True,
            orders_telegram=True,
            backtest_telegram=True,
            system_telegram=True,
            finance_telegram=True,
            security_telegram=True,
        )

    return TelegramSettingsResponse.model_validate(prefs)


@router.patch("/settings", response_model=TelegramSettingsResponse)
async def update_telegram_settings(
    updates: TelegramSettingsUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> TelegramSettingsResponse:
    """Обновить настройки Telegram-уведомлений."""
    service = NotificationService(db)
    updates_dict = {k: v for k, v in updates.model_dump().items() if v is not None}
    prefs = await service.update_preferences(current_user.id, updates_dict)
    return TelegramSettingsResponse.model_validate(prefs)


@router.post("/admin/notify", status_code=200)
async def admin_notify(
    payload: AdminNotifyRequest,
    current_user: User = Depends(get_admin_user),
) -> dict:
    """Отправить произвольное уведомление в admin chat.

    Только для администраторов. Требует настроенного telegram_admin_chat_id.
    """
    if not settings.telegram_admin_chat_id:
        raise HTTPException(status_code=503, detail="Admin chat ID не настроен")

    if bot is None:
        raise HTTPException(status_code=503, detail="Telegram bot не инициализирован")

    try:
        await bot.send_message(
            chat_id=settings.telegram_admin_chat_id,
            text=payload.message,
            parse_mode=payload.parse_mode,
        )
    except Exception as e:
        logger.error("Ошибка отправки admin notify: %s", e)
        raise HTTPException(status_code=500, detail="Ошибка отправки сообщения")

    return {"ok": True, "message": "Уведомление отправлено"}
