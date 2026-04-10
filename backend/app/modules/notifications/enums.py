"""Перечисления для системы уведомлений."""

import enum


class NotificationType(str, enum.Enum):
    """Тип уведомления."""
    # Позиции
    POSITION_OPENED = "position_opened"
    POSITION_CLOSED = "position_closed"
    TP_HIT = "tp_hit"
    SL_HIT = "sl_hit"
    # Боты
    BOT_STARTED = "bot_started"
    BOT_STOPPED = "bot_stopped"
    BOT_ERROR = "bot_error"
    BOT_EMERGENCY = "bot_emergency"
    # Ордера
    ORDER_FILLED = "order_filled"
    ORDER_CANCELLED = "order_cancelled"
    ORDER_ERROR = "order_error"
    # Бэктесты
    BACKTEST_COMPLETED = "backtest_completed"
    BACKTEST_FAILED = "backtest_failed"
    # Системные
    CONNECTION_LOST = "connection_lost"
    CONNECTION_RESTORED = "connection_restored"
    SYSTEM_ERROR = "system_error"
    # Биллинг
    SUBSCRIPTION_EXPIRING = "subscription_expiring"
    PAYMENT_SUCCESS = "payment_success"
    PAYMENT_FAILED = "payment_failed"


class NotificationPriority(str, enum.Enum):
    """Приоритет уведомления."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


# Категории для фильтрации и настроек
NOTIFICATION_CATEGORIES: dict[str, list[NotificationType]] = {
    "positions": [
        NotificationType.POSITION_OPENED,
        NotificationType.POSITION_CLOSED,
        NotificationType.TP_HIT,
        NotificationType.SL_HIT,
    ],
    "bots": [
        NotificationType.BOT_STARTED,
        NotificationType.BOT_STOPPED,
        NotificationType.BOT_ERROR,
        NotificationType.BOT_EMERGENCY,
    ],
    "orders": [
        NotificationType.ORDER_FILLED,
        NotificationType.ORDER_CANCELLED,
        NotificationType.ORDER_ERROR,
    ],
    "backtest": [
        NotificationType.BACKTEST_COMPLETED,
        NotificationType.BACKTEST_FAILED,
    ],
    "system": [
        NotificationType.CONNECTION_LOST,
        NotificationType.CONNECTION_RESTORED,
        NotificationType.SYSTEM_ERROR,
    ],
    "billing": [
        NotificationType.SUBSCRIPTION_EXPIRING,
        NotificationType.PAYMENT_SUCCESS,
        NotificationType.PAYMENT_FAILED,
    ],
}


def get_category(ntype: NotificationType) -> str:
    """Получить категорию для типа уведомления."""
    for category, types in NOTIFICATION_CATEGORIES.items():
        if ntype in types:
            return category
    return "system"
