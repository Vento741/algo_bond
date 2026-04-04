# SPEC 4: Auth & Error Pages — Инвайт-коды, Заявки, 404/500

> **Статус:** Draft
> **Зависимости:** Нет (может выполняться параллельно с SPEC 1)
> **Параллельно:** SPEC 1 (design-system)
> **Блокирует:** SPEC 3 (API integration only, frontend можно собрать раньше), SPEC 5 (admin-panel)

---

## Цель

Реализовать закрытую регистрацию по инвайт-кодам, систему заявок на доступ через Telegram, и брендированные страницы ошибок (404/500).

---

## 1. Новые таблицы БД

### 1.1 `invite_codes`

```python
class InviteCode(Base):
    __tablename__ = "invite_codes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(8), unique=True, index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    used_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    label: Mapped[str | None] = mapped_column(String(100), nullable=True)  # для пометок при batch-генерации
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

**Генерация кода:** 8 символов, uppercase alphanumeric (A-Z, 0-9), без ambiguous chars (0/O, 1/I/L). Пример: `AB3K7XN2`.

```python
import secrets
import string

SAFE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'  # без 0,O,1,I,L

def generate_invite_code() -> str:
    return ''.join(secrets.choice(SAFE_CHARS) for _ in range(8))
```

### 1.2 `access_requests`

```python
class AccessRequestStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"

class AccessRequest(Base):
    __tablename__ = "access_requests"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    telegram: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[AccessRequestStatus] = mapped_column(default=AccessRequestStatus.PENDING)
    generated_invite_code_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("invite_codes.id"), nullable=True
    )
    reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

**Связь:** При approve админ генерирует invite_code → `generated_invite_code_id` связывает заявку с кодом.

### Миграция

```bash
docker compose exec api alembic revision --autogenerate -m "add invite_codes and access_requests tables"
docker compose exec api alembic upgrade head
```

---

## 2. Backend API

### 2.1 Заявка на доступ (публичный)

```
POST /api/auth/access-request
```

**Request:**
```json
{ "telegram": "@username" }
```

**Validation:**
- `telegram`: обязательное, regex `^@[a-zA-Z][a-zA-Z0-9_]{3,31}$` (4-32 символа после @, итого 5-33 с @; Telegram требует минимум 5 символов без @)
- Проверка дубликатов: если заявка с таким telegram уже есть со статусом `pending` - `409 Conflict`
- Повторная заявка после `rejected` - разрешена (создаётся новая запись)

**Response:**
- `201 Created`: `{ "message": "Заявка отправлена", "status": "pending" }`
- `409 Conflict`: `{ "detail": "Заявка с этим Telegram уже отправлена" }`
- `422 Validation Error`: невалидный формат
- `429 Too Many Requests`: rate limit (5 запросов/час на IP)

**Rate Limiting:** `limiter.limit("5/hour")` — используя существующий `SlowAPI`.

### 2.2 Регистрация с инвайт-кодом

**Изменение:** `POST /api/auth/register`

Добавить поле `invite_code` в `RegisterRequest`:

```python
class RegisterRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=2, max_length=50)
    password: str = Field(min_length=8)
    invite_code: str = Field(min_length=8, max_length=8)
```

**Validation backend:**
1. Найти `InviteCode` по `code` где `is_active=True`
2. Проверить `expires_at` (если задан, не истёк)
3. Проверить `used_by is None` (не использован)
4. Если всё ОК — создать пользователя, обновить invite_code: `used_by=user.id, used_at=now(), is_active=False`

**Error responses:**
- `400`: `{ "detail": "Недействительный код приглашения" }` — код не найден или неактивен
- `400`: `{ "detail": "Код приглашения уже использован" }` — `used_by is not None`
- `400`: `{ "detail": "Срок действия кода истёк" }` — `expires_at < now()`

**Env toggle (опционально):**
```python
# app/config.py
INVITE_CODE_REQUIRED: bool = True  # False для отключения проверки (dev/testing)
```

Если `INVITE_CODE_REQUIRED=False` - поле `invite_code` не обязательно. Этот toggle только для dev/testing. Фронтенд всегда показывает поле (упрощение: не нужен `/api/config` endpoint).

---

## 3. Frontend — Обновление Register.tsx

### Новое поле "Код приглашения"

Добавить перед email полем:

```tsx
<div className="space-y-2">
  <Label htmlFor="invite_code" className="text-gray-300">Код приглашения</Label>
  <Input
    id="invite_code"
    type="text"
    required
    maxLength={8}
    placeholder="XXXXXXXX"
    value={inviteCode}
    onChange={(e) => {
      setInviteCode(e.target.value.toUpperCase());
      clearError();
    }}
    className="bg-white/5 border-white/10 text-white font-mono tracking-widest text-center text-lg"
  />
  <p className="text-xs text-gray-500">Получите код, оставив заявку на главной странице</p>
</div>
```

**UX:**
- Автоматический uppercase при вводе
- Моноширинный шрифт с tracking для читаемости
- Подсказка со ссылкой на лендинг
- Поле первое в форме (визуально важнее email)
- `maxLength={8}`

### Checkbox согласия (из требования SPEC 2)

Добавить перед кнопкой "Зарегистрироваться":

```tsx
<label className="flex items-start gap-3 text-sm text-gray-400 cursor-pointer">
  <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} />
  <span>
    Я согласен с <Link to="/terms" target="_blank">Условиями использования</Link> и
    <Link to="/privacy" target="_blank">Политикой конфиденциальности</Link>
  </span>
</label>
```

- `consent` state, по умолчанию `false`
- Кнопка disabled пока `!consent`

### Audit trail для согласия

Добавить колонку в таблицу `users`:

```python
consent_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

Устанавливается при регистрации: `user.consent_accepted_at = datetime.now(timezone.utc)`

### Обновление auth store

```typescript
// stores/auth.ts → register()
register: async (email, username, password, inviteCode) => {
  const { data } = await api.post('/auth/register', {
    email, username, password, invite_code: inviteCode
  });
  // ...
}
```

---

## 4. Error Pages

### 4.1 404 — Not Found

**Файл:** `frontend/src/pages/NotFound.tsx`

**Дизайн:**

```
                    ┌───────────────────────────┐
                    │                           │
                    │       📉                  │
                    │                           │
                    │   404                     │
                    │   Ордер не найден         │
                    │                           │
                    │   Эта страница ушла       │
                    │   в ликвидацию            │
                    │                           │
                    │   [На главную]  [Назад]   │
                    │                           │
                    └───────────────────────────┘
```

**Контент:**
- ASCII-арт или SVG иллюстрация (падающий график/свеча)
- Код: `404` — крупный, gold gradient, `font-data`
- Заголовок: "Ордер не найден" — `font-sans`
- Подзаголовок: "Эта страница ушла в ликвидацию" — `text-gray-400`
- Кнопки: "На главную" (premium) + "Назад" (outline, `useNavigate(-1)`)
- Фон: `bg-brand-bg`, без sidebar, полный viewport

### 4.2 500 — Server Error

**Файл:** `frontend/src/pages/ServerError.tsx`

**Реализация:** React ErrorBoundary + статическая страница.

**ErrorBoundary компонент:**

```tsx
// frontend/src/components/ErrorBoundary.tsx
class ErrorBoundary extends React.Component<Props, State> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return <ServerError onRetry={() => this.setState({ hasError: false })} />;
    }
    return this.props.children;
  }
}
```

**Обернуть в App.tsx:**
```tsx
<ErrorBoundary>
  <RouterProvider router={router} />
</ErrorBoundary>
```

**Дизайн ServerError:**

```
                    ┌───────────────────────────┐
                    │                           │
                    │       ⚠️                  │
                    │                           │
                    │   500                     │
                    │   Маржин-колл серверу     │
                    │                           │
                    │   Что-то пошло не так.    │
                    │   Мы уже разбираемся.     │
                    │                           │
                    │   [Попробовать снова]      │
                    │   [На главную]             │
                    │                           │
                    └───────────────────────────┘
```

- Код: `500` — крупный, red gradient, `font-data`
- "Попробовать снова" - `onRetry()` сбрасывает ErrorBoundary
- "На главную" - `window.location.href = '/'` (hard redirect, не React Router)

> **ВАЖНО:** `ServerError.tsx` НЕ должен использовать React Router (`Link`, `useNavigate`). Только нативные `<a>` и `window.location`. ErrorBoundary оборачивает Router, поэтому при его падении Router-компоненты недоступны.

### 4.3 Обновление fallback route

**В `App.tsx`:**

```tsx
// Было:
<Route path="*" element={<Navigate to="/" replace />} />

// Стало:
<Route path="*" element={<NotFound />} />
```

---

## 5. Скоуп

### Включено
- Таблицы: `invite_codes`, `access_requests`
- Alembic миграция
- Backend: `POST /api/auth/access-request`, обновление `POST /api/auth/register`
- Frontend: поле invite_code в Register.tsx, обновление auth store
- Страницы: NotFound (404), ServerError (500)
- ErrorBoundary компонент
- Обновление fallback route

### НЕ включено
- Админ-панель для управления кодами/заявками (SPEC 5)
- Access Request Form на лендинге (SPEC 3 — frontend)
- Telegram-бот для уведомлений
- Email-верификация

---

## Чеклист реализации

- [ ] Создать модели `InviteCode`, `AccessRequest` в `auth/models.py`
- [ ] Создать schemas: `AccessRequestCreate`, `InviteCodeResponse`, обновить `RegisterRequest`
- [ ] Создать Alembic миграцию
- [ ] Реализовать `POST /api/auth/access-request` в `auth/router.py`
- [ ] Обновить `POST /api/auth/register` — валидация invite_code
- [ ] Добавить rate limiting на access-request endpoint
- [ ] Добавить `INVITE_CODE_REQUIRED` в config.py
- [ ] Обновить `Register.tsx` - поле invite_code + checkbox согласия + consent state
- [ ] Обновить `auth store` — параметр invite_code в register()
- [ ] Создать `NotFound.tsx` (404)
- [ ] Создать `ServerError.tsx` (500)
- [ ] Создать `ErrorBoundary.tsx`
- [ ] Обернуть App в ErrorBoundary
- [ ] Обновить fallback route → NotFound
- [ ] Добавить `consent_accepted_at` колонку в User model + миграция
- [ ] Тесты: invite_code validation, access_request creation, duplicate check, consent audit
- [ ] Вызвать `/simplify` для ревью
