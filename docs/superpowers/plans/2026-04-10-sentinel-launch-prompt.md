# AlgoBond Sentinel - Launch Prompt for Implementation

Скопировать полностью и вставить в новую сессию Claude Code.

---

## Prompt

```
Реализуй AlgoBond Sentinel - автономный агент мониторинга и auto-fix для платформы AlgoBond.

## Контекст

Прочитай следующие документы В УКАЗАННОМ ПОРЯДКЕ перед началом работы:

1. **Инструкции проекта:** `CLAUDE.md` (правила кода, деплой, gotchas)
2. **Память:** `.claude/projects/*/memory/MEMORY.md` (профиль пользователя, обратная связь)
3. **Спецификация:** `docs/superpowers/specs/2026-04-10-autonomous-agent-monitor-design.md` (полная спека Sentinel)
4. **План Stage 1:** `docs/superpowers/plans/2026-04-10-sentinel-stage1-safety-scripts.md` (hooks + scripts)
5. **План Stage 2:** `docs/superpowers/plans/2026-04-10-sentinel-stage2-backend-api.md` (API + Redis)
6. **План Stage 3:** `docs/superpowers/plans/2026-04-10-sentinel-stage3-vps-infra-ui.md` (VPS infra + UI)

## Режим работы

Используй **subagent-driven development** (skill: superpowers:subagent-driven-development):
- Один подагент на задачу (Task) из плана
- Двухступенчатое ревью после каждой задачи: spec compliance, затем code quality
- Подагенты работают ПОСЛЕДОВАТЕЛЬНО (не параллельно) внутри одного Stage
- **Stages можно частично параллелить**: Stage 1 и Stage 2 независимы друг от друга

## Порядок выполнения

1. **Stage 1 + Stage 2 параллельно** (2 потока подагентов):
   - Поток A: Stage 1 (Tasks 1-9) - hooks, scripts, state dir, init prompt, tests
   - Поток B: Stage 2 (Tasks 1-7) - schemas, config, service, router, main.py, tests
2. **Stage 3 последовательно** (зависит от Stage 1 + 2):
   - Tasks 1-8 - VPS scripts, systemd, UI component, integration

## Требования к каждому подагенту

### Качество кода
- Строго следовать CLAUDE.md: type hints, русские комментарии, Pydantic v2, SQLAlchemy 2.0
- Shadcn/UI для фронтенда, lucide-react для иконок
- Conventional commits: `feat(sentinel):`, `fix(sentinel):`, `test(sentinel):`
- Без `any`, `@ts-ignore` в TypeScript

### Тестирование
- Каждый подагент ОБЯЗАН прогнать тесты своего кода
- Backend: `python -m pytest tests/ -v --timeout=120 --ignore=tests/test_backtest.py --ignore=tests/test_bybit_listener.py`
- Frontend: `npx tsc --noEmit`
- Если тесты падают - починить до коммита

### Edge Cases
- Подагенты должны проверять edge cases:
  - Bash hooks: пустой stdin, невалидный JSON, отсутствующий jq
  - Redis: пустые данные, невалидный JSON в incidents
  - API: отсутствующий agent_secret, невалидный токен
  - UI: status=stopped (default), пустой список инцидентов

### Code Review
- После каждого реализованного Task (не Step!) вызывай /simplify для ревью качества
- Ревьюер проверяет: соответствие спеке, качество кода, edge cases, безопасность
- Если ревьюер нашел проблемы - подагент исправляет, ревью повторяется

## Safety

- НИКОГДА не коммитить .env или секреты
- НИКОГДА не запускать `git push --force` (только `--force-with-lease`)
- Hooks должны блокировать опасные команды - протестировать это
- Не менять существующие тесты и функциональность (только добавлять)

## После завершения всех трех Stages

1. Прогнать ПОЛНЫЙ набор тестов
2. `git status` - убедиться что все закоммичено
3. Отчет: сколько файлов создано/изменено, сколько тестов добавлено
4. Не пушить - ждать команды пользователя
```

---

## Примечания для оркестратора

- Stage 1 Task 8 (Python tests) зависит от Tasks 1-3 (hooks), поэтому внутри Stage 1 порядок важен
- Stage 2 Task 6 (tests) зависит от Tasks 1-5 (implementation)
- Stage 3 целиком зависит от Stage 1 + 2
- Если подагент задает вопрос - ответить из контекста спеки, не гадать
- Если подагент BLOCKED - пересмотреть задачу, возможно разбить на подзадачи
