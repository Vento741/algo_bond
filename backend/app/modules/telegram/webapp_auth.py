"""Валидация Telegram WebApp initData (HMAC-SHA256)."""

import hashlib
import hmac
import json
import time
from urllib.parse import parse_qs, unquote


def validate_init_data(
    init_data: str,
    bot_token: str,
    max_age: int = 86400,
) -> bool:
    """Проверить подпись initData от Telegram WebApp.

    Args:
        init_data: Raw initData строка из Telegram WebApp.
        bot_token: Токен бота для проверки подписи.
        max_age: Максимальный возраст данных в секундах (default 24h).

    Returns:
        True если подпись валидна и данные не устарели.
    """
    try:
        parsed = parse_qs(init_data, keep_blank_values=True)
        hash_list = parsed.pop("hash", [])
        if not hash_list:
            return False
        received_hash = hash_list[0]

        auth_date_list = parsed.get("auth_date", ["0"])
        auth_date = int(auth_date_list[0])
        if max_age > 0 and (time.time() - auth_date) > max_age:
            return False

        data_check_string = "\n".join(
            f"{k}={v[0]}" for k, v in sorted(parsed.items())
        )

        secret_key = hmac.new(
            b"WebAppData", bot_token.encode(), hashlib.sha256
        ).digest()
        computed_hash = hmac.new(
            secret_key, data_check_string.encode(), hashlib.sha256
        ).hexdigest()

        return hmac.compare_digest(computed_hash, received_hash)
    except Exception:
        return False


def parse_init_data(init_data: str) -> dict:
    """Извлечь данные из initData.

    Returns:
        dict с ключами: user (dict), auth_date (int), query_id (str).
    """
    parsed = parse_qs(init_data, keep_blank_values=True)
    result: dict = {}

    user_raw = parsed.get("user", [None])[0]
    if user_raw:
        result["user"] = json.loads(unquote(user_raw))

    auth_date = parsed.get("auth_date", ["0"])[0]
    result["auth_date"] = int(auth_date)

    query_id = parsed.get("query_id", [None])[0]
    if query_id:
        result["query_id"] = query_id

    return result
