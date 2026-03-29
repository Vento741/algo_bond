---
name: db-migrate
description: Миграции Alembic
user_invocable: true
---

# /db-migrate [описание]

1. cd backend && alembic revision --autogenerate -m "описание"
2. Проверить файл миграции
3. alembic upgrade head
4. alembic current
