# SPEC 5: Admin Panel — Управление платформой

> **Статус:** Draft
> **Зависимости:** SPEC 1 (design-system), SPEC 4 (invite_codes, access_requests tables)
> **Параллельно:** Ничего (выполняется последним)
> **Блокирует:** Ничего

---

## Цель

Создать админ-панель для управления платформой: пользователи, заявки на доступ, инвайт-коды, стратегии, боты, billing-планы, системные логи.

---

## 1. Архитектура

### Backend — Centralized Admin Dependency

Вместо inline-проверок `if user.role != ADMIN` в каждом endpoint, создать переиспользуемую зависимость:

```python
# backend/app/modules/auth/dependencies.py

async def get_admin_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Зависимость для admin-only endpoints."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Требуются права администратора")
    return current_user
```

Все admin endpoints используют `admin: User = Depends(get_admin_user)`.

> **Рефакторинг:** Заменить inline-проверки в существующих admin endpoints (`billing/router.py`, `strategy/router.py`) на эту зависимость.

### Backend — Admin Router

```python
# backend/app/modules/admin/router.py
router = APIRouter(prefix="/api/admin", tags=["admin"])
```

Новый модуль: `backend/app/modules/admin/` с:
- `router.py` — все admin endpoints
- `service.py` — бизнес-логика
- `schemas.py` — request/response модели

### Frontend — Admin Route Guard

```tsx
// frontend/src/components/AdminRoute.tsx
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== 'admin') return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}
```

### Frontend — Sidebar Extension

Расширить существующий `Sidebar.tsx` с условным admin-блоком:

```tsx
{user?.role === 'admin' && (
  <>
    <Separator className="my-2 bg-white/10" />
    <span className="text-xs text-gray-500 px-4 uppercase tracking-wider">Админ</span>
    {adminNavItems.map(item => <NavItem key={item.path} {...item} />)}
  </>
)}
```

**Admin nav items:**
- `/admin` - Dashboard (`LayoutDashboard` icon)
- `/admin/users` - Пользователи (`Users` icon)
- `/admin/requests` - Заявки (`MessageCircle` icon)
- `/admin/invites` - Инвайт-коды (`KeyRound` icon)
- `/admin/billing` - Тарифы (`CreditCard` icon)
- `/admin/logs` - Логи (`Terminal` icon)

---

## 2. Страницы админ-панели

### 2.1 Admin Dashboard (`/admin`)

**Назначение:** Обзор состояния платформы.

**Метрики (карточки, 2x3 grid):**

| Метрика | Источник | Иконка |
|---------|----------|--------|
| Всего пользователей | `COUNT(users)` | Users |
| Активные боты | `COUNT(bots WHERE status=RUNNING)` | Bot |
| Заявки на рассмотрении | `COUNT(access_requests WHERE status=PENDING)` | MessageCircle |
| Всего сделок | `SUM(bots.total_trades)` | Activity |
| Суммарный P&L | `SUM(bots.total_pnl)` | TrendingUp |
| Активные инвайт-коды | `COUNT(invite_codes WHERE is_active=TRUE AND used_by IS NULL)` | Key |

**Backend endpoint:**
```
GET /api/admin/stats → { users_count, active_bots, pending_requests, total_trades, total_pnl, active_invites }
```

> **Исключение из правила module isolation:** Админ-статистика делает read-only агрегации напрямую через SQLAlchemy queries к таблицам других модулей. Это допустимо для dashboard-метрик, не нарушает бизнес-логику модулей.

### 2.2 Users (`/admin/users`)

**Назначение:** Управление пользователями.

**UI:**
- Таблица: email, username, role, status, bots count, subscription, created_at
- Поиск по email/username
- Фильтры: role (all/user/admin), status (active/inactive)
- Пагинация (20 per page)
- Actions per row: View details, Change role, Ban/Unban
- Delete: confirmation dialog с описанием последствий ("Будет удалено: N ботов, M ордеров. Введите email для подтверждения.")

**User Detail (modal или отдельная страница):**
- Профиль: email, username, role, created_at
- Подписка: plan name, status, expires_at
- Боты: список ботов с P&L
- Exchange accounts: количество (без API-ключей!)
- Actions: Change role, Ban, Delete

**Backend endpoints:**
```
GET    /api/admin/users           → paginated list
GET    /api/admin/users/:id       → user detail with bots/subscription
PATCH  /api/admin/users/:id       → update role, is_active
DELETE /api/admin/users/:id       → delete user (cascade)
```

### 2.3 Access Requests (`/admin/requests`)

**Назначение:** Обработка заявок на доступ.

**UI:**
- Таблица: telegram, status, created_at, reviewed_at
- Фильтры по status: pending (default), approved, rejected, all
- Badge-цвета: pending (yellow), approved (green), rejected (red)
- Actions per row:
  - **Approve** → генерирует invite_code, обновляет status=approved, связывает `generated_invite_code_id`
  - **Reject** → dialog с optional reason, обновляет status=rejected

**Approve flow:**
1. Админ нажимает "Approve"
2. Backend: генерирует код → создаёт `InviteCode` → обновляет `AccessRequest`
3. Frontend: показывает сгенерированный код в modal с copy-to-clipboard
4. Админ копирует код и отправляет пользователю в Telegram вручную

**Backend endpoints:**
```
GET   /api/admin/requests                → paginated list, filter by status
POST  /api/admin/requests/:id/approve    → approve + generate invite code
POST  /api/admin/requests/:id/reject     → reject with optional reason
```

### 2.4 Invite Codes (`/admin/invites`)

**Назначение:** Генерация и управление инвайт-кодами.

**UI:**
- Таблица: code, status (active/used/expired), created_by, used_by email, created_at, used_at
- Badge-цвета: active (green), used (gray), expired (red)
- Actions: Deactivate, Copy to clipboard
- **Generate button** → dialog:
  - Количество кодов (1-20)
  - Срок действия (7 дней / 30 дней / бессрочно)
  - Generate → показать список кодов с bulk copy

**Backend endpoints:**
```
GET   /api/admin/invites              → paginated list
POST  /api/admin/invites/generate     → { count: N, expires_in_days: N | null } → list of codes
PATCH /api/admin/invites/:id          → deactivate
```

### 2.5 Billing Plans (`/admin/billing`)

**Назначение:** Управление тарифными планами.

**UI:**
- Карточки планов (grid) — существующие из таблицы `plans`
- Каждая карточка: name, price, limits (max_bots, max_strategies, max_backtests_per_day)
- Actions: Edit, Delete
- **Create Plan** button → form:
  - Name, Slug, Price (monthly)
  - max_bots, max_strategies, max_backtests_per_day (числовые поля)
  - Features: read-only JSON display (v1), полноценный редактор позже

> **Упрощение v1:** Features field отображается read-only. Редактирование features — через прямой API/DB запрос. Полноценный JSON-editor — в следующей итерации.

**Backend endpoints:**
- Используются существующие: `GET /api/billing/plans`, `POST /api/billing/plans`
- Добавить admin-endpoints в `billing/router.py` (не в admin module, чтобы не разделять CRUD):
```
PATCH  /api/billing/plans/:id   → update plan (admin only)
DELETE /api/billing/plans/:id   → delete plan (admin only, if no active subscriptions)
```

### 2.6 System Logs (`/admin/logs`)

**Назначение:** Просмотр логов ботов всех пользователей.

**Источник данных:** Таблица `bot_logs` (уже существует: `backend/app/modules/trading/models.py:261`).

**UI:**
- Таблица: timestamp, level, bot_id, user email, message
- Фильтры:
  - Level: all / info / warn / error / debug (multi-select)
  - Bot: dropdown (all bots)
  - User: search by email
  - Date range: from — to
- Пагинация: 50 per page
- Color coding: info (gray), warn (yellow), error (red), debug (blue)
- Expandable row → details JSON

**Режим обновления:** Кнопка "Обновить" + автообновление каждые 10 секунд (toggle).

> **v1:** Polling (10 сек interval). **v2 (позже):** WebSocket real-time tail.

**Backend endpoint:**
```
GET /api/admin/logs → paginated, filter by level/bot_id/user_id/date_range
```

Query params: `level`, `bot_id`, `user_id`, `from_date`, `to_date`, `limit`, `offset`

> Multi-select фильтр по level: использовать кастомный dropdown с checkboxes (нет нативного shadcn multi-select). Альтернатива: отдельные toggle-кнопки для каждого уровня.

### Формат пагинации (стандарт для всех admin endpoints)

```typescript
interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
```

Backend возвращает этот формат для всех списочных admin endpoints. Frontend использует `limit/offset` query params.

---

## 3. Backend Module Structure

```
backend/app/modules/admin/
├── __init__.py
├── router.py      # All admin endpoints
├── service.py     # Business logic (stats, user mgmt, invite generation)
└── schemas.py     # AdminStats, UserListItem, InviteCodeCreate, PaginatedResponse, etc.
# Примечание: models.py отсутствует - admin не имеет собственных моделей,
# использует модели из auth, trading, billing, backtest модулей (read-only).
```

**Регистрация в main.py:**
```python
from app.modules.admin.router import router as admin_router
app.include_router(admin_router)
```

**Import models в alembic env.py** — убедиться что `InviteCode`, `AccessRequest` импортированы.

---

## 4. Frontend Route Structure

```tsx
// App.tsx
<Route element={<AdminRoute><DashboardLayout /></AdminRoute>}>
  <Route path="/admin" element={<AdminDashboard />} />
  <Route path="/admin/users" element={<AdminUsers />} />
  <Route path="/admin/requests" element={<AdminRequests />} />
  <Route path="/admin/invites" element={<AdminInvites />} />
  <Route path="/admin/billing" element={<AdminBilling />} />
  <Route path="/admin/logs" element={<AdminLogs />} />
</Route>
```

**Файлы страниц:**
```
frontend/src/pages/admin/
├── AdminDashboard.tsx
├── AdminUsers.tsx
├── AdminRequests.tsx
├── AdminInvites.tsx
├── AdminBilling.tsx
└── AdminLogs.tsx
```

---

## 5. Empty States

Каждая admin-страница должна обрабатывать пустое состояние:

| Страница | Empty state |
|----------|-------------|
| Users | "Пользователи не найдены" (после фильтрации) |
| Requests | "Нет заявок на рассмотрении" (с фильтром pending) |
| Invites | "Нет инвайт-кодов. Сгенерируйте первый!" |
| Billing | "Нет тарифных планов. Создайте первый!" |
| Logs | "Нет записей в логах" |

---

## 6. Скоуп

### Включено
- Backend: admin module (router, service, schemas)
- Backend: `get_admin_user` dependency
- Backend: рефакторинг existing admin checks → `get_admin_user`
- Frontend: 6 admin pages
- Frontend: `AdminRoute` компонент
- Frontend: sidebar extension для admin
- Frontend: empty states для всех admin pages

### НЕ включено
- Telegram-бот для уведомлений
- Real-time WebSocket logs (v2)
- Features JSON editor (v2)
- Impersonate user
- Export/import данных

---

## Чеклист реализации

- [ ] Создать `get_admin_user` dependency в `auth/dependencies.py`
- [ ] Рефакторинг: заменить inline admin checks в billing/strategy routers
- [ ] Создать `backend/app/modules/admin/` (router, service, schemas)
- [ ] Реализовать `GET /api/admin/stats`
- [ ] Реализовать CRUD `/api/admin/users`
- [ ] Реализовать `/api/admin/requests` (list, approve, reject)
- [ ] Реализовать `/api/admin/invites` (list, generate, deactivate)
- [ ] Реализовать `PATCH/DELETE /api/admin/billing/plans`
- [ ] Реализовать `GET /api/admin/logs` с фильтрами
- [ ] Зарегистрировать admin router в `main.py`
- [ ] Создать `AdminRoute.tsx`
- [ ] Обновить `Sidebar.tsx` — admin section
- [ ] Создать `AdminDashboard.tsx`
- [ ] Создать `AdminUsers.tsx` с таблицей и поиском
- [ ] Создать `AdminRequests.tsx` с approve/reject
- [ ] Создать `AdminInvites.tsx` с генерацией
- [ ] Создать `AdminBilling.tsx` с карточками планов
- [ ] Создать `AdminLogs.tsx` с фильтрами и polling
- [ ] Routes в App.tsx
- [ ] Тесты: admin stats, user CRUD, invite generation, request approve/reject
- [ ] Вызвать `/simplify` для ревью
