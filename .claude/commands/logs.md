---
name: logs
description: Логи сервисов на VPS
user_invocable: true
---
ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && docker-compose logs --tail=50 $ARGUMENTS"
