"""Форматирование Telegram-сообщений (HTML)."""

from decimal import Decimal

from app.modules.trading.models import BotStatus


def format_position_opened(
    symbol: str,
    side: str,
    entry_price: Decimal,
    quantity: Decimal,
    stop_loss: Decimal | None,
    take_profits: list[Decimal] | None,
    bot_name: str,
) -> str:
    """Форматирование уведомления об открытии позиции.

    Args:
        symbol: Торговый символ (напр. BTCUSDT).
        side: Направление (LONG/SHORT).
        entry_price: Цена входа.
        quantity: Объем позиции.
        stop_loss: Цена стоп-лосса (опционально).
        take_profits: Список цен тейк-профитов (опционально).
        bot_name: Название торгового бота.

    Returns:
        HTML-строка для отправки в Telegram.
    """
    lines = [
        "📈 <b>Позиция открыта</b>",
        "━━━━━━━━━━━━━━━━━",
        f"{side} {symbol} @ {entry_price:,.2f}",
        f"Размер: {quantity}",
    ]
    if stop_loss:
        sl_pct = (stop_loss - entry_price) / entry_price * 100
        lines.append(f"SL: {stop_loss:,.2f} ({sl_pct:+.2f}%)")
    if take_profits:
        for i, tp in enumerate(take_profits, 1):
            tp_pct = (tp - entry_price) / entry_price * 100
            lines.append(f"TP{i}: {tp:,.2f} ({tp_pct:+.2f}%)")
    lines.append(f"Бот: {bot_name}")
    return "\n".join(lines)


def format_position_closed(
    symbol: str,
    side: str,
    pnl: Decimal,
    pnl_pct: Decimal,
    reason: str,
) -> str:
    """Форматирование уведомления о закрытии позиции.

    Args:
        symbol: Торговый символ.
        side: Направление (LONG/SHORT).
        pnl: Реализованная прибыль/убыток в USDT.
        pnl_pct: P&L в процентах.
        reason: Причина закрытия (TP1, TP2, SL, Manual и т.д.).

    Returns:
        HTML-строка для отправки в Telegram.
    """
    emoji = "💚" if pnl >= 0 else "🔴"
    return "\n".join([
        f"{emoji} <b>Позиция закрыта</b>",
        "━━━━━━━━━━━━━━━━━",
        f"{side} {symbol}",
        f"P&L: {pnl:+,.2f} USDT ({pnl_pct:+.2f}%)",
        f"Причина: {reason}",
    ])


def format_daily_report(
    total_pnl: Decimal,
    trades_count: int,
    wins: int,
    losses: int,
    best_trade: str,
    best_pnl: Decimal,
    worst_trade: str,
    worst_pnl: Decimal,
    balance: Decimal,
) -> str:
    """Форматирование дневного отчета P&L.

    Args:
        total_pnl: Суммарный P&L за день.
        trades_count: Количество сделок.
        wins: Количество прибыльных сделок.
        losses: Количество убыточных сделок.
        best_trade: Символ лучшей сделки.
        best_pnl: P&L лучшей сделки.
        worst_trade: Символ худшей сделки.
        worst_pnl: P&L худшей сделки.
        balance: Текущий баланс счета.

    Returns:
        HTML-строка для отправки в Telegram.
    """
    win_rate = (wins / trades_count * 100) if trades_count > 0 else 0
    emoji = "💰" if total_pnl >= 0 else "📉"
    return "\n".join([
        f"{emoji} <b>Дневной отчет</b>",
        "━━━━━━━━━━━━━━━━━",
        f"P&L: {total_pnl:+,.2f} USDT",
        f"Сделок: {trades_count} (Win: {wins} | Loss: {losses})",
        f"Win Rate: {win_rate:.0f}%",
        f"Лучшая: {best_pnl:+,.2f} USDT ({best_trade})",
        f"Худшая: {worst_pnl:+,.2f} USDT ({worst_trade})",
        f"Баланс: {balance:,.2f} USDT",
    ])


_STATUS_EMOJI: dict[BotStatus, str] = {
    BotStatus.RUNNING: "🟢",
    BotStatus.STOPPED: "⬜",
    BotStatus.ERROR: "🔴",
}


def format_bot_status(
    name: str,
    symbol: str,
    timeframe: str,
    status: BotStatus,
    pnl: Decimal,
    trades: int,
    win_rate: Decimal,
) -> str:
    """Форматирование статуса торгового бота.

    Args:
        name: Название бота.
        symbol: Торговый символ.
        timeframe: Таймфрейм (напр. 1h, 4h).
        status: Статус бота (BotStatus enum).
        pnl: Суммарный P&L бота.
        trades: Количество сделок.
        win_rate: Процент прибыльных сделок.

    Returns:
        HTML-строка для отправки в Telegram.
    """
    emoji = _STATUS_EMOJI.get(status, "⚪")
    return "\n".join([
        f"{emoji} <b>{name}</b>",
        f"{symbol} {timeframe} | {status.value.upper()}",
        f"P&L: {pnl:+,.2f} USDT | Сделок: {trades} | WR: {win_rate:.0f}%",
    ])


def format_autofix_report(
    error: str,
    file_path: str,
    line: int,
    root_cause: str,
    solution: str,
    tests_passed: int,
    tests_total: int,
    deploy_status: str,
    health_status: str,
    commit_message: str,
) -> str:
    """Форматирование отчета Monitor Auto-Fix pipeline.

    Args:
        error: Текст ошибки.
        file_path: Путь к файлу с ошибкой.
        line: Номер строки с ошибкой.
        root_cause: Корневая причина ошибки.
        solution: Описание примененного решения.
        tests_passed: Количество прошедших тестов.
        tests_total: Общее количество тестов.
        deploy_status: Статус деплоя (OK/FAIL).
        health_status: Статус health check (OK/FAIL).
        commit_message: Сообщение коммита с исправлением.

    Returns:
        HTML-строка для отправки в Telegram.
    """
    return "\n".join([
        "🔴 <b>Авто-исправление</b>",
        "━━━━━━━━━━━━━━━━━━━━━━━━",
        "",
        "⚠️ <b>Ошибка</b>",
        f"{error} в {file_path}:{line}",
        "",
        "🔍 <b>Причина</b>",
        root_cause,
        "",
        "🛠 <b>Решение</b>",
        solution,
        "",
        "✅ <b>Проверка</b>",
        f"Тесты: {tests_passed}/{tests_total} пройдены",
        f"Деплой: {deploy_status}",
        f"Здоровье: {health_status}",
        "",
        f"📎 Коммит: {commit_message}",
    ])


def format_margin_warning(
    margin_pct: Decimal,
    balance: Decimal,
    used_margin: Decimal,
) -> str:
    """Форматирование предупреждения о высокой марже.

    Args:
        margin_pct: Процент использованной маржи.
        balance: Текущий баланс счета.
        used_margin: Объем использованной маржи в USDT.

    Returns:
        HTML-строка для отправки в Telegram.
    """
    return "\n".join([
        "⚠️ <b>Предупреждение: высокая маржа</b>",
        "━━━━━━━━━━━━━━━━━━━━━━━━",
        f"Маржа: {margin_pct:.1f}%",
        f"Баланс: {balance:,.2f} USDT",
        f"Использовано: {used_margin:,.2f} USDT",
        "",
        "Рассмотрите уменьшение позиций.",
    ])
