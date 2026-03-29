---
name: health
description: Healthcheck endpoints
user_invocable: true
---
1. curl https://algo.dev-james.bond/api/health
2. curl -o /dev/null -w "%{http_code}" https://algo.dev-james.bond
3. WebSocket wss://algo.dev-james.bond/ws/
