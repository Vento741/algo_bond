---
name: tg-notify
description: Отправить тестовое уведомление в Telegram админу через API
user_invocable: true
---

# Отправка уведомления в Telegram

Отправить сообщение админу через Telegram Bot API.

## Использование

```
/tg-notify <сообщение>
```

## Действия

1. Отправить POST запрос на VPS:

```bash
ssh jeremy-vps "curl -sf -X POST http://localhost:8100/api/telegram/admin/notify \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer \$(curl -sf -X POST http://localhost:8100/api/auth/login \
    -H \"Content-Type: application/json\" \
    -d '{\"email\": \"admin@algobond.com\", \"password\": \"admin\"}' | jq -r .access_token)' \
  -d '{\"message\": \"$ARGUMENTS\", \"parse_mode\": \"HTML\"}'"
```

Если прямой API вызов не работает, использовать Telegram Bot API напрямую:

```bash
curl -s -X POST "https://api.telegram.org/bot8611948414:AAGJJ2wY-gKuY1ILOllY0_j8BDPQUx2QTf8/sendMessage" \
  -d "chat_id=5161187711" \
  -d "text=$ARGUMENTS" \
  -d "parse_mode=HTML"
```

2. Проверить ответ - должен быть `{"ok": true}`
3. Сообщить пользователю результат
