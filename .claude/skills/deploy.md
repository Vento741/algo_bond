---
name: deploy
description: Деплой проекта AlgoBond на VPS
user_invocable: true
---

# /deploy — Деплой на VPS

1. git status (проверить чистоту)
2. git push origin $(git branch --show-current)
3. ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && git pull && docker-compose -f docker-compose.prod.yml up -d --build"
4. ssh jeremy-vps "curl -s http://localhost:8000/health"
5. ssh jeremy-vps "docker-compose logs --tail=20"
