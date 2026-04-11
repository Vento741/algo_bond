"""Telegram handlers для AlgoBond Sentinel: статус, чат, approvals."""

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from app.redis import get_redis

logger = logging.getLogger(__name__)

router = Router(name="sentinel")

# Redis ключи (повторяем константы из sentinel_service чтобы не тянуть циклические импорты)
AGENT_CHAT_INBOX_KEY = "algobond:agent:chat:inbox"
AGENT_CHAT_OUT_KEY = "algobond:agent:chat:out"
AGENT_STATUS_KEY = "algobond:agent:status"
AGENT_PERM_PREFIX = "algobond:agent:perm:"
TG_CHAT_ACTIVE_PREFIX = "algobond:agent:tg_chat_active:"

_SEPARATOR = "━━━━━━━━━━━━━━━━━"

# Таймаут ожидания ответа Sentinel на сообщение в чате (секунды)
_CHAT_RESPONSE_TIMEOUT = 90


class SentinelChatStates(StatesGroup):
    """FSM состояния для чата с Sentinel."""

    chatting = State()


def _sentinel_keyboard():
    """Inline клавиатура для /sentinel команды."""
    from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="💬 Чат с Sentinel", callback_data="sentinel_chat_start"),
                InlineKeyboardButton(text="🔄 Обновить статус", callback_data="sentinel_refresh"),
            ],
            [
                InlineKeyboardButton(text="▶️ Запустить", callback_data="sentinel_cmd_start"),
                InlineKeyboardButton(text="⏹ Остановить", callback_data="sentinel_cmd_stop"),
            ],
        ]
    )


def _chat_keyboard():
    """Клавиатура для режима чата."""
    from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🚪 Выйти из чата", callback_data="sentinel_chat_exit")],
        ]
    )


async def _get_status_text() -> str:
    """Получить текст статуса Sentinel из Redis."""
    redis = get_redis()
    try:
        data = await redis.hgetall(AGENT_STATUS_KEY)
        if not data:
            return "Статус неизвестен (нет данных в Redis)"

        status = data.get("status", "unknown")
        started_at = data.get("started_at", "—")
        incidents_today = data.get("incidents_today", "0")
        fixes_today = data.get("fixes_today", "0")
        last_health = data.get("last_health_check", "—")
        last_result = data.get("last_health_result", "—")
        monitors = data.get("monitors", "")

        status_emoji = {"running": "🟢", "stopped": "🔴", "error": "🟡"}.get(status, "⚪")

        lines = [
            f"<b>AlgoBond Sentinel</b>",
            _SEPARATOR,
            f"{status_emoji} Статус: <b>{status}</b>",
        ]
        if started_at and started_at != "—":
            lines.append(f"Запущен: {started_at[:19].replace('T', ' ')}")
        if monitors:
            lines.append(f"Мониторы: {monitors}")
        lines += [
            f"Инциденты сегодня: {incidents_today} (исправлено: {fixes_today})",
            f"Последний health: {last_result}",
        ]
        if last_health and last_health != "—":
            lines.append(f"Время: {last_health[:19].replace('T', ' ')}")

        return "\n".join(lines)
    finally:
        await redis.aclose()


# === Команда /sentinel ===


@router.message(Command("sentinel"))
async def sentinel_command(
    message: Message, session, user_id: uuid.UUID
) -> None:
    """Показать статус Sentinel с кнопками управления."""
    text = await _get_status_text()
    await message.answer(text, reply_markup=_sentinel_keyboard())


# === Callback: обновить статус ===


@router.callback_query(F.data == "sentinel_refresh")
async def callback_sentinel_refresh(
    query: CallbackQuery, session, user_id: uuid.UUID
) -> None:
    """Обновить статус Sentinel (перечитать из Redis)."""
    text = await _get_status_text()
    try:
        await query.answer("Обновлено")
    except Exception:
        pass
    try:
        await query.message.edit_text(text, parse_mode="HTML", reply_markup=_sentinel_keyboard())
    except Exception:
        await query.message.answer(text, parse_mode="HTML", reply_markup=_sentinel_keyboard())


# === Callback: команды start/stop ===


@router.callback_query(F.data == "sentinel_cmd_start")
async def callback_sentinel_start(
    query: CallbackQuery, session, user_id: uuid.UUID
) -> None:
    """Отправить команду start Sentinel через Redis."""
    redis = get_redis()
    try:
        await redis.set("algobond:agent:command", "start")
        try:
            await query.answer("Команда start отправлена")
        except Exception:
            pass
        await query.message.answer(
            "✅ <b>Sentinel: команда start отправлена</b>\n"
            "Агент запустится в течение 30 секунд (watchdog).",
            parse_mode="HTML",
        )
    finally:
        await redis.aclose()


@router.callback_query(F.data == "sentinel_cmd_stop")
async def callback_sentinel_stop(
    query: CallbackQuery, session, user_id: uuid.UUID
) -> None:
    """Отправить команду stop Sentinel через Redis."""
    redis = get_redis()
    try:
        await redis.set("algobond:agent:command", "stop")
        try:
            await query.answer("Команда stop отправлена")
        except Exception:
            pass
        await query.message.answer(
            "⏹ <b>Sentinel: команда stop отправлена</b>\n"
            "Агент остановится после завершения текущей задачи.",
            parse_mode="HTML",
        )
    finally:
        await redis.aclose()


# === Approvals: callback от tg-approval.sh hook ===


@router.callback_query(F.data.startswith("sentinel_approve:"))
async def callback_sentinel_approve(
    query: CallbackQuery, session, user_id: uuid.UUID
) -> None:
    """Одобрить pending Bash команду Sentinel."""
    approval_id = query.data.split(":", 1)[1]
    redis = get_redis()
    try:
        key = f"{AGENT_PERM_PREFIX}{approval_id}"
        existing = await redis.get(key)
        if existing is not None and existing != "pending":
            try:
                await query.answer(f"Уже обработано: {existing}", show_alert=True)
            except Exception:
                pass
            return

        # Сначала записать в Redis (критично - hook ждет!)
        await redis.set(key, "approved", ex=300)

        # Потом UI обновления (могут упасть - не критично)
        try:
            await query.answer("Одобрено")
        except Exception:
            pass
        try:
            await query.message.edit_text(
                query.message.text + "\n\n✅ Одобрено",
                parse_mode="HTML",
                reply_markup=None,
            )
        except Exception:
            pass
    finally:
        await redis.aclose()


@router.callback_query(F.data.startswith("sentinel_reject:"))
async def callback_sentinel_reject(
    query: CallbackQuery, session, user_id: uuid.UUID
) -> None:
    """Отклонить pending Bash команду Sentinel."""
    approval_id = query.data.split(":", 1)[1]
    redis = get_redis()
    try:
        key = f"{AGENT_PERM_PREFIX}{approval_id}"
        existing = await redis.get(key)
        if existing is not None and existing != "pending":
            try:
                await query.answer(f"Уже обработано: {existing}", show_alert=True)
            except Exception:
                pass
            return

        # Сначала записать в Redis
        await redis.set(key, "rejected", ex=300)

        try:
            await query.answer("Отклонено")
        except Exception:
            pass
        try:
            await query.message.edit_text(
                query.message.text + "\n\n❌ Отклонено",
                parse_mode="HTML",
                reply_markup=None,
            )
        except Exception:
            pass
    finally:
        await redis.aclose()


# === Chat с Sentinel ===


@router.callback_query(F.data == "sentinel_chat_start")
async def callback_sentinel_chat_start(
    query: CallbackQuery, state: FSMContext, session, user_id: uuid.UUID
) -> None:
    """Включить режим чата с Sentinel."""
    await state.set_state(SentinelChatStates.chatting)
    try:
        await query.answer("Чат активирован")
    except Exception:
        pass
    await query.message.answer(
        "💬 <b>Чат с Sentinel активирован</b>\n\n"
        "Пишите сообщения - они будут переданы агенту.\n"
        "Ответы появятся здесь автоматически.\n\n"
        "<i>Нажмите «Выйти из чата» для завершения.</i>",
        parse_mode="HTML",
        reply_markup=_chat_keyboard(),
    )


@router.callback_query(F.data == "sentinel_chat_exit")
async def callback_sentinel_chat_exit(
    query: CallbackQuery, state: FSMContext, session, user_id: uuid.UUID
) -> None:
    """Выйти из режима чата."""
    await state.clear()
    try:
        await query.answer("Вышли из чата")
    except Exception:
        pass
    await query.message.edit_text(
        "🚪 <b>Чат с Sentinel завершен</b>\n"
        "Используйте /sentinel для возврата в панель управления.",
        reply_markup=None,
    )


@router.message(SentinelChatStates.chatting)
async def handle_sentinel_chat_message(
    message: Message, state: FSMContext, session, user_id: uuid.UUID
) -> None:
    """Отправить сообщение Sentinel (async delivery, без ожидания)."""
    content = (message.text or "").strip()
    if not content:
        return
    if len(content) > 4000:
        await message.answer("Сообщение слишком длинное (максимум 4000 символов)")
        return

    redis = get_redis()
    try:
        msg_id = str(uuid.uuid4())
        msg = {
            "id": msg_id,
            "type": "user_message",
            "content": content,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "metadata": {"source": "telegram", "tg_chat_id": message.chat.id},
        }
        await redis.rpush(AGENT_CHAT_INBOX_KEY, json.dumps(msg))

        await message.answer(
            "📨 Доставлено. Sentinel ответит когда обработает (inbox poll ~1 мин).",
            reply_markup=_chat_keyboard(),
        )
    finally:
        await redis.aclose()
