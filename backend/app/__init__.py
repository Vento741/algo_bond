"""AlgoBond — платформа алгоритмической торговли."""

import os
from pathlib import Path

# Загружаем .env с явной кодировкой UTF-8 для поддержки Windows с cp1251
env_file = Path(__file__).parent.parent / ".env"
if env_file.exists():
    with open(env_file, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                if key not in os.environ:  # Не перезаписываем существующие переменные
                    os.environ[key] = value
