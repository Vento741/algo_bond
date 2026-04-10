"""Тесты валидации Telegram WebApp initData."""

import hashlib
import hmac
import json
import time
from urllib.parse import quote

import pytest

from app.modules.telegram.webapp_auth import validate_init_data, parse_init_data


BOT_TOKEN = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"


def _make_init_data(bot_token: str, user_data: dict, auth_date: int | None = None) -> str:
    """Генерирует валидный initData для тестов."""
    if auth_date is None:
        auth_date = int(time.time())

    user_json = json.dumps(user_data, separators=(",", ":"))
    params = {
        "user": user_json,
        "auth_date": str(auth_date),
        "query_id": "AAHdF6IQAAAAAN0XohDhrOrc",
    }

    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(params.items())
    )
    secret_key = hmac.new(
        b"WebAppData", bot_token.encode(), hashlib.sha256
    ).digest()
    hash_value = hmac.new(
        secret_key, data_check_string.encode(), hashlib.sha256
    ).hexdigest()
    params["hash"] = hash_value

    return "&".join(f"{k}={quote(v)}" for k, v in params.items())


def test_validate_valid_init_data():
    """Валидный initData проходит проверку."""
    user = {"id": 123456789, "first_name": "Test", "username": "testuser"}
    init_data = _make_init_data(BOT_TOKEN, user)
    assert validate_init_data(init_data, BOT_TOKEN) is True


def test_validate_invalid_hash():
    """Невалидный hash отклоняется."""
    user = {"id": 123456789, "first_name": "Test"}
    init_data = _make_init_data(BOT_TOKEN, user)
    init_data = init_data.replace(init_data.split("hash=")[1][:10], "0000000000")
    assert validate_init_data(init_data, BOT_TOKEN) is False


def test_validate_missing_hash():
    """initData без hash отклоняется."""
    assert validate_init_data("user=%7B%7D&auth_date=123", BOT_TOKEN) is False


def test_validate_expired_data():
    """initData старше 1 часа отклоняется."""
    user = {"id": 123456789, "first_name": "Test"}
    old_auth_date = int(time.time()) - 7200  # 2 часа назад
    init_data = _make_init_data(BOT_TOKEN, user, auth_date=old_auth_date)
    assert validate_init_data(init_data, BOT_TOKEN, max_age=3600) is False


def test_parse_init_data():
    """Извлечение user данных из initData."""
    user = {"id": 123456789, "first_name": "Test", "username": "testuser"}
    init_data = _make_init_data(BOT_TOKEN, user)
    parsed = parse_init_data(init_data)
    assert parsed["user"]["id"] == 123456789
    assert parsed["user"]["username"] == "testuser"
