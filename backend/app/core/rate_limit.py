"""Rate limiting: общий экземпляр limiter для использования в роутерах."""

from slowapi import Limiter
from slowapi.util import get_remote_address

# Не передаём env_file в Config - settings уже загруженны из .env в app.config
limiter = Limiter(key_func=get_remote_address)
