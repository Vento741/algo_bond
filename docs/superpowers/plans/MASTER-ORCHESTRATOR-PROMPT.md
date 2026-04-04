# Master Orchestrator Prompt

> Скопируй содержимое секции "Промпт" и вставь в новую сессию Claude Code.

---

## Промпт

```
Ты - оркестратор проекта AlgoBond. Твоя задача - реализовать 5 спецификаций по улучшению фронтенда и платформы, следуя готовым пошаговым планам.

## Контекст проекта

AlgoBond - платформа алгоритмической торговли криптофьючерсами на Bybit.
- Stack: FastAPI + React 18 + TypeScript + Tailwind + Zustand + PostgreSQL + Redis
- Домен: algo.dev-james.bond
- Текущее состояние: 9 страниц, 55 API endpoints, 141 тест, 14 таблиц

## Спецификации (что строим)

1. `docs/superpowers/specs/2026-04-04-design-system.md` - типографика, SEO, robots.txt
2. `docs/superpowers/specs/2026-04-04-legal-and-compliance.md` - 4 правовых страницы, cookie banner, 152-ФЗ
3. `docs/superpowers/specs/2026-04-04-landing-upgrade.md` - 4 новые секции лендинга, Footer
4. `docs/superpowers/specs/2026-04-04-auth-and-error-pages.md` - инвайт-коды, заявки, 404/500
5. `docs/superpowers/specs/2026-04-04-admin-panel.md` - 6 страниц админки

## Планы реализации (как строим)

1. `docs/superpowers/plans/2026-04-04-design-system.md` - 9 задач
2. `docs/superpowers/plans/2026-04-04-legal-and-compliance.md` - 8 задач
3. `docs/superpowers/plans/2026-04-04-landing-upgrade.md` - 10 задач
4. `docs/superpowers/plans/2026-04-04-auth-and-error-pages.md` - 14 задач
5. `docs/superpowers/plans/2026-04-04-admin-panel.md` - 21 задач

Итого: 62 задачи с полным кодом.

## Порядок выполнения (3 волны)

### Волна 1 (параллельно)
Запусти двух агентов одновременно:
- **Агент A**: `docs/superpowers/plans/2026-04-04-design-system.md` (9 задач)
- **Агент B**: `docs/superpowers/plans/2026-04-04-auth-and-error-pages.md` (14 задач)

Дождись завершения обоих. Проверь:
- [ ] `tsc -b` компилируется без ошибок
- [ ] `pytest tests/ -v` - все тесты проходят (старые + новые)
- [ ] Шрифты корректно отображаются на всех страницах
- [ ] Инвайт-код валидируется при регистрации
- [ ] 404/500 страницы рендерятся
- Закоммить: `git add . && git commit -m "feat: wave 1 - design system + auth/error pages"`

### Волна 2 (параллельно, после волны 1)
Запусти двух агентов одновременно:
- **Агент C**: `docs/superpowers/plans/2026-04-04-legal-and-compliance.md` (8 задач)
- **Агент D**: `docs/superpowers/plans/2026-04-04-landing-upgrade.md` (10 задач)

Дождись завершения обоих. Проверь:
- [ ] Все 4 правовых страницы доступны (/terms, /privacy, /cookies, /risk)
- [ ] Cookie banner появляется и скрывается после принятия
- [ ] Лендинг: все новые секции рендерятся (How It Works, Form, Performance, FAQ)
- [ ] Footer с правовыми ссылками на всех публичных страницах
- [ ] Форма запроса доступа валидирует Telegram и отправляет запрос
- [ ] Responsive: проверить на 375px, 768px, 1440px
- Закоммить: `git add . && git commit -m "feat: wave 2 - legal pages + landing upgrade"`

### Волна 3 (после волн 1+2)
Запусти одного агента:
- **Агент E**: `docs/superpowers/plans/2026-04-04-admin-panel.md` (21 задача)

Проверь:
- [ ] Все 6 админ-страниц доступны для admin-роли
- [ ] Обычный пользователь не видит /admin/* маршруты
- [ ] Генерация инвайт-кодов работает
- [ ] Approve заявки генерирует код
- [ ] Логи отображаются с фильтрами
- [ ] `pytest tests/ -v` - все тесты проходят
- Закоммить: `git add . && git commit -m "feat: wave 3 - admin panel"`

## Правила для агентов

### Обязательно
- Используй скилл `superpowers:subagent-driven-development` для выполнения плана
- После КАЖДОЙ задачи агент вызывает `/simplify` для проверки качества
- Backend: TDD (тест сначала, потом реализация)
- Python: type hints на ВСЕХ функциях, docstrings на русском
- SQLAlchemy 2.0: `Mapped[]`, `mapped_column()` (НЕ `Column()`)
- Pydantic v2: `ConfigDict(from_attributes=True)`, `model_validate`
- Frontend: TypeScript strict, никаких `any`
- Иконки: ТОЛЬКО `lucide-react`
- Компоненты: Shadcn/UI
- State: Zustand

### Дизайн
- Дизайн ПРЕМИАЛЬНЫЙ - плавный, воздушный, с дыханием. НЕ шаблонный AI-стиль.
- Палитра: #0d0d1a (фон), #1a1a2e (карточки), #00E676 (profit), #FF1744 (loss), #FFD700 (premium), #4488ff (accent)
- Шрифт UI: Inter (или Jiro если найден) | Шрифт цифр: JetBrains Mono
- Лендинг + Auth: luxury fintech (градиенты, blur, gold CTA)
- ЛК + Дашборды: trading terminal (плотная информация, тёмная тема)
- Секции лендинга: 120px+ padding, subtle borders (rgba white 0.04), generous whitespace

### Запрещено
- Длинные тире "--" в тексте (только короткие "-")
- Material UI, Ant Design, Bootstrap
- Redux, MobX
- `@ts-ignore`, `any`
- `Column()`, `declarative_base()`, `parse_obj`, `from_orm`

## Стратегия оркестрации

1. Прочитай ВСЕ 5 планов перед началом работы
2. Запускай агентов параллельно в рамках каждой волны (через worktrees для изоляции)
3. Между волнами - качественная проверка (компиляция, тесты, визуал)
4. При конфликте между агентами - мержи вручную, приоритет у спека
5. Не пиши код сам - только координируй агентов и проверяй результат
6. Если агент застрял - прочитай спек и план, дай ему контекст ошибки

## Начало работы

Начни с:
1. Прочитай CLAUDE.md для понимания конвенций проекта
2. Прочитай все 5 спеков (specs/) для понимания ЧТО строим
3. Запусти Волну 1: два агента параллельно (design-system + auth-and-error-pages)
4. После завершения Волны 1 - проверка, коммит, Волна 2
5. После завершения Волны 2 - проверка, коммит, Волна 3
6. Финальная проверка всей системы
```
