"""TelegramNotifier: доставка уведомлений в Telegram."""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.notifications.enums import NotificationPriority, NotificationType, get_category
from app.modules.notifications.models import Notification
from app.modules.telegram.service import TelegramService

logger = logging.getLogger(__name__)

# Категории, доставляемые только администраторам (системные события)
_ADMIN_ONLY_CATEGORIES = {"system"}


def _format_message(notification: Notification) -> str:
    """Сформировать текст Telegram-сообщения из уведомления.

    Для типов с rich-форматтерами используем formatters.py,
    для остальных - универсальный шаблон title + message.
    """
    ntype = notification.type
    data = notification.data or {}

    try:
        from app.modules.telegram.formatters import (
            format_position_opened,
            format_position_closed,
            format_daily_report,
            format_margin_warning,
            format_bot_status,
        )
        from decimal import Decimal

        if ntype == NotificationType.POSITION_OPENED:
            return format_position_opened(
                symbol=data.get("symbol", ""),
                side=data.get("side", ""),
                entry_price=Decimal(str(data.get("entry_price", 0))),
                quantity=Decimal(str(data.get("quantity", 0))),
                stop_loss=Decimal(str(data["stop_loss"])) if data.get("stop_loss") else None,
                take_profits=[Decimal(str(t)) for t in data["take_profits"]] if data.get("take_profits") else None,
                bot_name=data.get("bot_name", ""),
            )

        if ntype in (NotificationType.POSITION_CLOSED, NotificationType.TP_HIT, NotificationType.SL_HIT):
            return format_position_closed(
                symbol=data.get("symbol", ""),
                side=data.get("side", ""),
                pnl=Decimal(str(data.get("pnl", 0))),
                pnl_pct=Decimal(str(data.get("pnl_pct", 0))),
                reason=data.get("reason", ntype.value),
            )

        if ntype == NotificationType.DAILY_PNL_REPORT:
            return format_daily_report(
                total_pnl=Decimal(str(data.get("total_pnl", 0))),
                trades_count=data.get("trades_count", 0),
                wins=data.get("wins", 0),
                losses=data.get("losses", 0),
                best_trade=data.get("best_trade", "-"),
                best_pnl=Decimal(str(data.get("best_pnl", 0))),
                worst_trade=data.get("worst_trade", "-"),
                worst_pnl=Decimal(str(data.get("worst_pnl", 0))),
                balance=Decimal(str(data.get("balance", 0))),
            )

        if ntype == NotificationType.MARGIN_WARNING:
            return format_margin_warning(
                margin_pct=Decimal(str(data.get("margin_pct", 0))),
                balance=Decimal(str(data.get("balance", 0))),
                used_margin=Decimal(str(data.get("used_margin", 0))),
            )

    except Exception:
        logger.exception("Ошибка форматирования Telegram-уведомления типа %s", ntype)

    # Универсальный шаблон
    priority_emoji = {
        NotificationPriority.CRITICAL: "🚨",
        NotificationPriority.HIGH: "❗",
        NotificationPriority.MEDIUM: "ℹ️",
        NotificationPriority.LOW: "📌",
    }
    emoji = priority_emoji.get(notification.priority, "ℹ️")
    return f"{emoji} <b>{notification.title}</b>\n{notification.message}"


class TelegramNotifier:
    """Отправка уведомлений в Telegram с учётом настроек пользователя."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def on_notification(self, notification: Notification) -> None:
        """Обработать уведомление: проверить настройки и отправить в Telegram.

        Логика:
        1. Получить TelegramLink пользователя - если нет, выйти.
        2. Получить NotificationPreference - если telegram_enabled=False, выйти.
        3. Определить категорию; если system - отправить только admin-пользователям.
        4. Проверить {category}_telegram флаг (кроме CRITICAL - отправляется всегда).
        5. Отправить сообщение через bot.send_message.
        """
        from app.modules.telegram.bot import bot
        if bot is None:
            return

        service = TelegramService(self.db)
        link = await service.get_link_by_user_id(notification.user_id)
        if link is None or not link.is_active:
            return

        # Системные уведомления - только для администраторов
        category = get_category(notification.type)
        if category in _ADMIN_ONLY_CATEGORIES:
            from app.modules.auth.service import AuthService
            auth_service = AuthService(self.db)
            user = await auth_service.get_user_by_id(notification.user_id)
            from app.modules.auth.models import UserRole
            if user.role != UserRole.ADMIN:
                return

        # CRITICAL отправляется всегда (без проверки telegram-настроек)
        if notification.priority != NotificationPriority.CRITICAL:
            from app.modules.notifications.service import NotificationService
            notif_service = NotificationService(self.db)
            prefs = await notif_service.get_preferences(notification.user_id)
            if prefs is None or not prefs.telegram_enabled:
                return
            # Проверить {category}_telegram флаг
            category_flag = f"{category}_telegram"
            if not getattr(prefs, category_flag, True):
                return

        text = _format_message(notification)
        try:
            await bot.send_message(chat_id=link.chat_id, text=text)
        except Exception:
            logger.exception(
                "Ошибка отправки Telegram-уведомления user_id=%s", notification.user_id
            )
