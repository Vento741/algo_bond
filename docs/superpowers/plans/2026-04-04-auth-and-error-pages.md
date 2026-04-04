# Auth & Error Pages - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement closed registration with invite codes, access request system, branded 404/500 error pages, and ErrorBoundary

**Architecture:** Backend: new models InviteCode + AccessRequest in auth module, new endpoint POST /api/auth/access-request, modified register endpoint with invite code validation. Frontend: updated Register.tsx with invite code field + consent checkbox, new NotFound/ServerError pages, ErrorBoundary wrapper.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Pydantic v2, Alembic, React 18, TypeScript, pytest

---

### Task 1: Create InviteCode and AccessRequest models

**Files:**
- Modify: `backend/app/modules/auth/models.py`

Add two new models and an enum to the existing auth models file. These go after the existing `UserSettings` class.

- [ ] **Step 1: Add AccessRequestStatus enum and InviteCode model**

```python
# backend/app/modules/auth/models.py - add these imports at the top
import secrets
import string
from sqlalchemy import Text, func

# Add after SAFE_CHARS constant definition
SAFE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'  # без 0,O,1,I,L


def generate_invite_code() -> str:
    """Генерация 8-символьного инвайт-кода без ambiguous символов."""
    return ''.join(secrets.choice(SAFE_CHARS) for _ in range(8))


class AccessRequestStatus(str, enum.Enum):
    """Статусы заявки на доступ."""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class InviteCode(Base):
    """Инвайт-код для закрытой регистрации."""

    __tablename__ = "invite_codes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(String(8), unique=True, index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    used_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class AccessRequest(Base):
    """Заявка на получение доступа к платформе."""

    __tablename__ = "access_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    telegram: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[AccessRequestStatus] = mapped_column(
        Enum(AccessRequestStatus, name="access_request_status"),
        default=AccessRequestStatus.PENDING,
    )
    generated_invite_code_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invite_codes.id"), nullable=True
    )
    reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
```

The full modified `backend/app/modules/auth/models.py` should have the following structure:

```python
"""Модели аутентификации: User, ExchangeAccount, UserSettings, InviteCode, AccessRequest."""

import enum
import secrets
import string
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# Безопасные символы для инвайт-кодов (без ambiguous: 0/O, 1/I/L)
SAFE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'


def generate_invite_code() -> str:
    """Генерация 8-символьного инвайт-кода без ambiguous символов."""
    return ''.join(secrets.choice(SAFE_CHARS) for _ in range(8))


class UserRole(str, enum.Enum):
    """Роли пользователей."""
    USER = "user"
    ADMIN = "admin"


class ExchangeType(str, enum.Enum):
    """Поддерживаемые биржи."""
    BYBIT = "bybit"


class AccessRequestStatus(str, enum.Enum):
    """Статусы заявки на доступ."""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class User(Base):
    """Пользователь платформы."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    username: Mapped[str] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role"), default=UserRole.USER
    )
    consent_accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Связи
    settings: Mapped["UserSettings"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    exchange_accounts: Mapped[list["ExchangeAccount"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    subscription: Mapped["Subscription"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


# ... ExchangeAccount and UserSettings unchanged ...


class InviteCode(Base):
    """Инвайт-код для закрытой регистрации."""

    __tablename__ = "invite_codes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(String(8), unique=True, index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    used_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class AccessRequest(Base):
    """Заявка на получение доступа к платформе."""

    __tablename__ = "access_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    telegram: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[AccessRequestStatus] = mapped_column(
        Enum(AccessRequestStatus, name="access_request_status"),
        default=AccessRequestStatus.PENDING,
    )
    generated_invite_code_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invite_codes.id"), nullable=True
    )
    reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
```

- [ ] **Step 2: Update Alembic env.py imports**

Add `InviteCode, AccessRequest` to the auth models import line in `backend/alembic/env.py`:

```python
# Was:
from app.modules.auth.models import ExchangeAccount, User, UserSettings  # noqa: F401

# Becomes:
from app.modules.auth.models import AccessRequest, ExchangeAccount, InviteCode, User, UserSettings  # noqa: F401
```

- [ ] **Step 3: Update conftest.py imports**

Add model imports to `backend/tests/conftest.py` so SQLite test DB creates the new tables:

```python
# Add after existing auth model imports:
from app.modules.auth.models import User, UserRole, UserSettings, InviteCode, AccessRequest  # noqa: F401
```

- [ ] **Step 4: Verify models load correctly**

```bash
cd backend && python -c "from app.modules.auth.models import InviteCode, AccessRequest, generate_invite_code; code = generate_invite_code(); print(f'OK: {code}, len={len(code)}')"
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/auth/models.py backend/alembic/env.py backend/tests/conftest.py
git commit -m "feat: add InviteCode and AccessRequest models to auth module"
```

- [ ] **Step 6: Run /simplify for review**

---

### Task 2: Create Pydantic schemas for access request and invite code

**Files:**
- Modify: `backend/app/modules/auth/schemas.py`

- [ ] **Step 1: Add AccessRequestCreate schema**

Add at the end of `backend/app/modules/auth/schemas.py`:

```python
import re

# === Заявки на доступ ===

class AccessRequestCreate(BaseModel):
    """Заявка на получение доступа (публичный endpoint)."""
    telegram: str = Field(
        min_length=5,
        max_length=33,
        pattern=r"^@[a-zA-Z][a-zA-Z0-9_]{3,31}$",
        examples=["@username"],
    )


class AccessRequestResponse(BaseModel):
    """Ответ на создание заявки."""
    message: str
    status: str


# === Инвайт-коды ===

class InviteCodeResponse(BaseModel):
    """Ответ - инвайт-код (для админки)."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    created_by: uuid.UUID
    used_by: uuid.UUID | None
    used_at: datetime | None
    expires_at: datetime | None
    label: str | None
    is_active: bool
    created_at: datetime
```

- [ ] **Step 2: Update RegisterRequest to include invite_code**

Modify the existing `RegisterRequest` in `backend/app/modules/auth/schemas.py`:

```python
class RegisterRequest(BaseModel):
    """Запрос на регистрацию."""
    email: EmailStr
    username: str = Field(min_length=2, max_length=100)
    password: str = Field(min_length=8, max_length=128)
    invite_code: str | None = Field(None, min_length=8, max_length=8)
```

Note: `invite_code` is `str | None` because when `INVITE_CODE_REQUIRED=False` in config, it should be optional. Validation of requirement is done in the service layer.

- [ ] **Step 3: Verify schemas parse correctly**

```bash
cd backend && python -c "
from app.modules.auth.schemas import RegisterRequest, AccessRequestCreate, AccessRequestResponse
r = RegisterRequest(email='a@b.com', username='test', password='12345678', invite_code='AB3K7XN2')
print(f'RegisterRequest OK: invite_code={r.invite_code}')
a = AccessRequestCreate(telegram='@testuser')
print(f'AccessRequestCreate OK: telegram={a.telegram}')
print('All schemas OK')
"
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/modules/auth/schemas.py
git commit -m "feat: add AccessRequestCreate, InviteCodeResponse schemas and invite_code to RegisterRequest"
```

- [ ] **Step 5: Run /simplify for review**

---

### Task 3: Create Alembic migration

**Files:**
- Create: `backend/alembic/versions/xxxx_add_invite_codes_and_access_requests.py` (auto-generated)

- [ ] **Step 1: Generate migration**

```bash
docker compose exec api alembic revision --autogenerate -m "add invite_codes access_requests and consent_accepted_at"
```

If not running Docker locally, create manually:

```bash
cd backend && alembic revision --autogenerate -m "add invite_codes access_requests and consent_accepted_at"
```

- [ ] **Step 2: Review generated migration and verify it includes**

1. `invite_codes` table with all columns
2. `access_requests` table with all columns
3. `consent_accepted_at` column added to `users` table
4. Proper indexes on `invite_codes.code` and `access_requests.telegram`
5. `access_request_status` enum type

- [ ] **Step 3: Apply migration**

```bash
docker compose exec api alembic upgrade head
```

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/
git commit -m "feat: add migration for invite_codes, access_requests, consent_accepted_at"
```

- [ ] **Step 5: Run /simplify for review**

---

### Task 4: Add INVITE_CODE_REQUIRED to config.py

**Files:**
- Modify: `backend/app/config.py`

- [ ] **Step 1: Add setting to Settings class**

Add after the `cors_origins` field in `backend/app/config.py`:

```python
    # Регистрация
    invite_code_required: bool = True  # False для отключения проверки (dev/testing)
```

The full line to add in `backend/app/config.py` class `Settings`, after `cors_origins`:

```python
class Settings(BaseSettings):
    # ... existing fields ...

    # CORS
    cors_origins: list[str] = ["http://localhost:5173"]

    # Регистрация
    invite_code_required: bool = True

    # Bybit
    bybit_api_key: str = ""
    # ...
```

- [ ] **Step 2: Set INVITE_CODE_REQUIRED=False in test env**

Add to `backend/tests/conftest.py` at the top, near the existing `os.environ.setdefault`:

```python
os.environ.setdefault("INVITE_CODE_REQUIRED", "false")
```

This ensures existing registration tests keep working without invite codes.

- [ ] **Step 3: Verify config loads**

```bash
cd backend && python -c "from app.config import settings; print(f'INVITE_CODE_REQUIRED={settings.invite_code_required}')"
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/config.py backend/tests/conftest.py
git commit -m "feat: add INVITE_CODE_REQUIRED toggle to config.py"
```

- [ ] **Step 5: Run /simplify for review**

---

### Task 5: Write tests for access request endpoint, then implement

**Files:**
- Modify: `backend/tests/test_auth.py`
- Modify: `backend/app/modules/auth/service.py`
- Modify: `backend/app/modules/auth/router.py`
- Modify: `backend/app/modules/auth/schemas.py` (import in router)

- [ ] **Step 1: Write failing tests for POST /api/auth/access-request**

Add to `backend/tests/test_auth.py`:

```python
from app.modules.auth.models import AccessRequest, AccessRequestStatus


class TestAccessRequest:
    """Тесты заявки на доступ."""

    async def test_access_request_success(self, client: AsyncClient):
        """Успешная отправка заявки на доступ."""
        response = await client.post("/api/auth/access-request", json={
            "telegram": "@validuser",
        })
        assert response.status_code == 201
        data = response.json()
        assert data["message"] == "Заявка отправлена"
        assert data["status"] == "pending"

    async def test_access_request_duplicate_pending(self, client: AsyncClient):
        """Ошибка при повторной заявке с тем же Telegram (pending)."""
        await client.post("/api/auth/access-request", json={
            "telegram": "@dupeuser",
        })
        response = await client.post("/api/auth/access-request", json={
            "telegram": "@dupeuser",
        })
        assert response.status_code == 409
        assert "уже отправлена" in response.json()["detail"]

    async def test_access_request_invalid_telegram(self, client: AsyncClient):
        """Ошибка при невалидном формате Telegram."""
        response = await client.post("/api/auth/access-request", json={
            "telegram": "no_at_sign",
        })
        assert response.status_code == 422

    async def test_access_request_too_short_telegram(self, client: AsyncClient):
        """Ошибка при слишком коротком Telegram username."""
        response = await client.post("/api/auth/access-request", json={
            "telegram": "@ab",
        })
        assert response.status_code == 422

    async def test_access_request_after_rejected(self, client: AsyncClient, db_session):
        """Повторная заявка после rejected - разрешена."""
        # Создать rejected заявку напрямую в БД
        rejected = AccessRequest(
            telegram="@rejecteduser",
            status=AccessRequestStatus.REJECTED,
        )
        db_session.add(rejected)
        await db_session.commit()

        response = await client.post("/api/auth/access-request", json={
            "telegram": "@rejecteduser",
        })
        assert response.status_code == 201
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
cd backend && pytest tests/test_auth.py::TestAccessRequest -v
```

- [ ] **Step 3: Implement service method - create_access_request**

Add to `backend/app/modules/auth/service.py`:

```python
from app.modules.auth.models import AccessRequest, AccessRequestStatus, InviteCode
from app.modules.auth.schemas import AccessRequestCreate
from app.core.exceptions import ConflictException


class AuthService:
    # ... existing methods ...

    async def create_access_request(self, data: AccessRequestCreate) -> AccessRequest:
        """Создать заявку на получение доступа."""
        # Проверка дубликатов: pending заявка с таким же telegram
        existing = await self.db.execute(
            select(AccessRequest).where(
                AccessRequest.telegram == data.telegram,
                AccessRequest.status == AccessRequestStatus.PENDING,
            )
        )
        if existing.scalar_one_or_none():
            raise ConflictException("Заявка с этим Telegram уже отправлена")

        access_request = AccessRequest(telegram=data.telegram)
        self.db.add(access_request)
        await self.db.flush()
        await self.db.commit()
        return access_request
```

- [ ] **Step 4: Implement router endpoint**

Add to `backend/app/modules/auth/router.py`:

```python
from app.modules.auth.schemas import AccessRequestCreate, AccessRequestResponse


@router.post("/access-request", response_model=AccessRequestResponse, status_code=201)
@limiter.limit("5/hour")
async def create_access_request(
    request: Request,
    data: AccessRequestCreate,
    db: AsyncSession = Depends(get_db),
) -> AccessRequestResponse:
    """Отправить заявку на получение доступа к платформе."""
    service = AuthService(db)
    await service.create_access_request(data)
    return AccessRequestResponse(message="Заявка отправлена", status="pending")
```

Update imports at top of router.py:

```python
from app.modules.auth.schemas import (
    AccessRequestCreate,
    AccessRequestResponse,
    ExchangeAccountCreate,
    ExchangeAccountResponse,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
    UserSettingsResponse,
    UserSettingsUpdate,
    UserUpdateRequest,
)
```

- [ ] **Step 5: Run tests and confirm they pass**

```bash
cd backend && pytest tests/test_auth.py::TestAccessRequest -v
```

- [ ] **Step 6: Commit**

```bash
git add backend/tests/test_auth.py backend/app/modules/auth/service.py backend/app/modules/auth/router.py
git commit -m "feat: implement POST /api/auth/access-request with duplicate check"
```

- [ ] **Step 7: Run /simplify for review**

---

### Task 6: Write tests for invite code validation in register, then implement

**Files:**
- Modify: `backend/tests/test_auth.py`
- Modify: `backend/app/modules/auth/service.py`

- [ ] **Step 1: Write failing tests for invite code validation**

Add to `backend/tests/test_auth.py`:

```python
from app.modules.auth.models import InviteCode, generate_invite_code
from datetime import datetime, timezone, timedelta


class TestRegisterWithInviteCode:
    """Тесты регистрации с инвайт-кодом."""

    async def test_register_with_valid_invite_code(
        self, client: AsyncClient, db_session, test_user: User,
    ):
        """Успешная регистрация с валидным инвайт-кодом."""
        # Создать инвайт-код
        code = generate_invite_code()
        invite = InviteCode(
            code=code,
            created_by=test_user.id,
            is_active=True,
        )
        db_session.add(invite)
        await db_session.commit()

        response = await client.post("/api/auth/register", json={
            "email": "invited@example.com",
            "username": "inviteduser",
            "password": "SecurePass123",
            "invite_code": code,
        })
        assert response.status_code == 201
        assert response.json()["email"] == "invited@example.com"

        # Проверить что код помечен как использованный
        await db_session.refresh(invite)
        assert invite.used_by is not None
        assert invite.used_at is not None
        assert invite.is_active is False

    async def test_register_with_invalid_invite_code(self, client: AsyncClient):
        """Ошибка при невалидном инвайт-коде."""
        response = await client.post("/api/auth/register", json={
            "email": "bad@example.com",
            "username": "baduser",
            "password": "SecurePass123",
            "invite_code": "ZZZZZZZZ",
        })
        assert response.status_code == 400
        assert "Недействительный" in response.json()["detail"]

    async def test_register_with_used_invite_code(
        self, client: AsyncClient, db_session, test_user: User,
    ):
        """Ошибка при использованном инвайт-коде."""
        code = generate_invite_code()
        invite = InviteCode(
            code=code,
            created_by=test_user.id,
            used_by=test_user.id,
            used_at=datetime.now(timezone.utc),
            is_active=False,
        )
        db_session.add(invite)
        await db_session.commit()

        response = await client.post("/api/auth/register", json={
            "email": "used@example.com",
            "username": "useduser",
            "password": "SecurePass123",
            "invite_code": code,
        })
        assert response.status_code == 400
        assert "уже использован" in response.json()["detail"]

    async def test_register_with_expired_invite_code(
        self, client: AsyncClient, db_session, test_user: User,
    ):
        """Ошибка при просроченном инвайт-коде."""
        code = generate_invite_code()
        invite = InviteCode(
            code=code,
            created_by=test_user.id,
            is_active=True,
            expires_at=datetime.now(timezone.utc) - timedelta(days=1),
        )
        db_session.add(invite)
        await db_session.commit()

        response = await client.post("/api/auth/register", json={
            "email": "expired@example.com",
            "username": "expireduser",
            "password": "SecurePass123",
            "invite_code": code,
        })
        assert response.status_code == 400
        assert "истёк" in response.json()["detail"]

    async def test_register_without_invite_code_when_not_required(
        self, client: AsyncClient, monkeypatch,
    ):
        """Регистрация без инвайт-кода когда INVITE_CODE_REQUIRED=False."""
        from app.config import settings
        monkeypatch.setattr(settings, "invite_code_required", False)

        response = await client.post("/api/auth/register", json={
            "email": "noinvite@example.com",
            "username": "noinviteuser",
            "password": "SecurePass123",
        })
        assert response.status_code == 201
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
cd backend && pytest tests/test_auth.py::TestRegisterWithInviteCode -v
```

- [ ] **Step 3: Add BadRequestException to core exceptions**

Add to `backend/app/core/exceptions.py`:

```python
class BadRequestException(HTTPException):
    """Некорректный запрос (400)."""

    def __init__(self, detail: str = "Некорректный запрос"):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)
```

- [ ] **Step 4: Implement invite code validation in AuthService.register**

Update the `register` method in `backend/app/modules/auth/service.py`:

```python
from datetime import datetime, timezone

from app.config import settings
from app.core.exceptions import BadRequestException, ConflictException, CredentialsException, NotFoundException
from app.modules.auth.models import (
    AccessRequest,
    AccessRequestStatus,
    ExchangeAccount,
    InviteCode,
    User,
    UserSettings,
)


class AuthService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def _validate_invite_code(self, code_str: str) -> InviteCode:
        """Валидация инвайт-кода. Возвращает InviteCode или выбрасывает BadRequestException."""
        result = await self.db.execute(
            select(InviteCode).where(InviteCode.code == code_str.upper())
        )
        invite = result.scalar_one_or_none()

        if not invite or not invite.is_active:
            raise BadRequestException("Недействительный код приглашения")

        if invite.used_by is not None:
            raise BadRequestException("Код приглашения уже использован")

        if invite.expires_at and invite.expires_at < datetime.now(timezone.utc):
            raise BadRequestException("Срок действия кода истёк")

        return invite

    async def register(self, data: RegisterRequest) -> User:
        """Регистрация нового пользователя с проверкой инвайт-кода."""
        # Проверка инвайт-кода (если требуется)
        invite: InviteCode | None = None
        if settings.invite_code_required:
            if not data.invite_code:
                raise BadRequestException("Код приглашения обязателен")
            invite = await self._validate_invite_code(data.invite_code)
        elif data.invite_code:
            # Даже если не обязателен, валидируем если передан
            invite = await self._validate_invite_code(data.invite_code)

        # Проверка дубликата email
        existing = await self.db.execute(
            select(User).where(User.email == data.email)
        )
        if existing.scalar_one_or_none():
            raise ConflictException("Пользователь с таким email уже существует")

        user = User(
            email=data.email,
            username=data.username,
            hashed_password=hash_password(data.password),
            consent_accepted_at=datetime.now(timezone.utc),
        )
        self.db.add(user)
        await self.db.flush()

        # Пометить инвайт-код как использованный
        if invite:
            invite.used_by = user.id
            invite.used_at = datetime.now(timezone.utc)
            invite.is_active = False

        # Создать дефолтные настройки
        user_settings = UserSettings(user_id=user.id)
        self.db.add(user_settings)
        await self.db.flush()
        await self.db.commit()

        return user

    # ... rest of methods unchanged ...
```

- [ ] **Step 5: Run tests and confirm they pass**

```bash
cd backend && pytest tests/test_auth.py::TestRegisterWithInviteCode -v
cd backend && pytest tests/test_auth.py -v  # all auth tests still pass
```

- [ ] **Step 6: Commit**

```bash
git add backend/tests/test_auth.py backend/app/modules/auth/service.py backend/app/core/exceptions.py
git commit -m "feat: invite code validation in register with BadRequestException"
```

- [ ] **Step 7: Run /simplify for review**

---

### Task 7: Add consent_accepted_at to User model + test

**Files:**
- Modify: `backend/app/modules/auth/models.py` (already done in Task 1)
- Modify: `backend/tests/test_auth.py`

- [ ] **Step 1: Write test for consent audit trail**

Add to `backend/tests/test_auth.py`:

```python
class TestConsentAuditTrail:
    """Тест аудита согласия пользователя."""

    async def test_consent_timestamp_set_on_register(
        self, client: AsyncClient, db_session, test_user: User,
    ):
        """consent_accepted_at устанавливается при регистрации."""
        from app.config import settings as app_settings
        # Ensure invite code is not required for this test
        original = app_settings.invite_code_required
        app_settings.invite_code_required = False

        try:
            response = await client.post("/api/auth/register", json={
                "email": "consent@example.com",
                "username": "consentuser",
                "password": "SecurePass123",
            })
            assert response.status_code == 201

            # Проверить consent_accepted_at в БД
            from sqlalchemy import select
            result = await db_session.execute(
                select(User).where(User.email == "consent@example.com")
            )
            user = result.scalar_one()
            assert user.consent_accepted_at is not None
        finally:
            app_settings.invite_code_required = original
```

- [ ] **Step 2: Run test and confirm it passes** (implementation already in Task 6 service code)

```bash
cd backend && pytest tests/test_auth.py::TestConsentAuditTrail -v
```

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_auth.py
git commit -m "test: add consent_accepted_at audit trail test"
```

- [ ] **Step 4: Run /simplify for review**

---

### Task 8: Update Register.tsx - invite code field + consent checkbox

**Files:**
- Modify: `frontend/src/pages/Register.tsx`

- [ ] **Step 1: Update Register.tsx with invite code field and consent checkbox**

Replace the full content of `frontend/src/pages/Register.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export function Register() {
  const [inviteCode, setInviteCode] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [success, setSuccess] = useState(false);
  const { register, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await register(email, username, password, inviteCode);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch {
      // error is set in store
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background image + overlay */}
      <div className="absolute inset-0">
        <img
          src="/hero-mobile.webp"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-brand-bg/85 backdrop-blur-sm" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full bg-brand-premium/5 blur-[150px]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <Link to="/" className="flex items-center gap-2.5 group">
            <img src="/logo.webp" alt="AlgoBond" className="w-10 h-10 rounded-lg transition-opacity group-hover:opacity-80" />
            <span className="text-2xl font-bold text-white font-heading">AlgoBond</span>
          </Link>
        </div>

        {/* Card */}
        <Card className="border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-2xl shadow-black/50">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl text-white font-heading tracking-tight">
              Готов торговать?
            </CardTitle>
            <CardDescription className="text-gray-400">
              Пара минут - и рынок ваш.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <CheckCircle2 className="h-12 w-12 text-brand-profit" />
                <p className="text-white font-medium">Регистрация успешна!</p>
                <p className="text-gray-400 text-sm">
                  Перенаправляем на страницу входа...
                </p>
              </div>
            ) : (
              <>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-brand-loss/10 border border-brand-loss/20 text-brand-loss text-sm">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      {error}
                    </div>
                  )}

                  {/* Код приглашения - первое поле */}
                  <div className="space-y-2">
                    <Label htmlFor="invite_code" className="text-gray-300">
                      Код приглашения
                    </Label>
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
                      className="bg-white/5 border-white/10 text-white font-mono tracking-widest text-center text-lg placeholder:text-gray-500 focus:border-brand-premium/50"
                    />
                    <p className="text-xs text-gray-500">
                      Получите код, оставив заявку на{' '}
                      <Link to="/" className="text-brand-premium hover:underline">
                        главной странице
                      </Link>
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-gray-300">
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        clearError();
                      }}
                      required
                      className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-brand-premium/50"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="username" className="text-gray-300">
                      Имя пользователя
                    </Label>
                    <Input
                      id="username"
                      type="text"
                      placeholder="trader_name"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        clearError();
                      }}
                      required
                      minLength={2}
                      className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-brand-premium/50"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-gray-300">
                      Пароль
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Минимум 8 символов"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        clearError();
                      }}
                      required
                      minLength={8}
                      className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-brand-premium/50"
                    />
                  </div>

                  {/* Checkbox согласия */}
                  <label className="flex items-start gap-3 text-sm text-gray-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      required
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      className="mt-0.5 rounded border-white/20 bg-white/5 text-brand-premium focus:ring-brand-premium/50"
                    />
                    <span>
                      Я согласен с{' '}
                      <Link to="/terms" target="_blank" className="text-brand-premium hover:underline">
                        Условиями использования
                      </Link>{' '}
                      и{' '}
                      <Link to="/privacy" target="_blank" className="text-brand-premium hover:underline">
                        Политикой конфиденциальности
                      </Link>
                    </span>
                  </label>

                  <Button
                    type="submit"
                    variant="premium"
                    className="w-full"
                    disabled={isLoading || !consent}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Регистрация...
                      </>
                    ) : (
                      'Создать аккаунт'
                    )}
                  </Button>
                </form>

                <div className="mt-6 text-center text-sm text-gray-400">
                  Уже есть аккаунт?{' '}
                  <Link
                    to="/login"
                    className="text-brand-premium hover:underline font-medium"
                  >
                    Войти
                  </Link>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Register.tsx
git commit -m "feat: add invite code field and consent checkbox to Register.tsx"
```

- [ ] **Step 3: Run /simplify for review**

---

### Task 9: Update auth store - add inviteCode param to register

**Files:**
- Modify: `frontend/src/stores/auth.ts`
- Modify: `frontend/src/types/api.ts`

- [ ] **Step 1: Update RegisterRequest type**

In `frontend/src/types/api.ts`, update:

```typescript
export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  invite_code: string;
}
```

- [ ] **Step 2: Update auth store register function**

In `frontend/src/stores/auth.ts`, update the interface and implementation:

```typescript
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string, inviteCode: string) => Promise<void>;
  logout: () => void;
  fetchUser: () => Promise<void>;
  clearError: () => void;
}
```

Update the `register` method implementation:

```typescript
  register: async (email: string, username: string, password: string, inviteCode: string) => {
    set({ isLoading: true, error: null });
    try {
      await api.post('/auth/register', {
        email,
        username,
        password,
        invite_code: inviteCode,
      });
      set({ isLoading: false });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ||
        'Ошибка регистрации';
      set({ error: message, isLoading: false });
      throw err;
    }
  },
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/auth.ts frontend/src/types/api.ts
git commit -m "feat: add inviteCode param to auth store register function"
```

- [ ] **Step 4: Run /simplify for review**

---

### Task 10: Create NotFound.tsx (404 page with trading humor)

**Files:**
- Create: `frontend/src/pages/NotFound.tsx`

- [ ] **Step 1: Create NotFound.tsx**

Create `frontend/src/pages/NotFound.tsx`:

```tsx
import { Link, useNavigate } from 'react-router-dom';
import { TrendingDown, ArrowLeft, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4 relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-brand-premium/5 blur-[120px]" />

      <div className="relative z-10 flex flex-col items-center text-center max-w-md">
        {/* Icon */}
        <div className="mb-6 p-4 rounded-2xl bg-brand-loss/10 border border-brand-loss/20">
          <TrendingDown className="h-12 w-12 text-brand-loss" />
        </div>

        {/* 404 code */}
        <h1
          className="text-[120px] font-bold leading-none font-data bg-gradient-to-b from-brand-premium to-brand-premium/40 bg-clip-text text-transparent"
        >
          404
        </h1>

        {/* Title */}
        <h2 className="mt-2 text-2xl font-heading font-semibold text-white">
          Ордер не найден
        </h2>

        {/* Subtitle */}
        <p className="mt-3 text-gray-400 text-lg">
          Эта страница ушла в ликвидацию
        </p>
        <p className="mt-1 text-gray-500 text-sm">
          Похоже, маркет-мейкеры забрали эту страницу раньше вас
        </p>

        {/* Falling candle ASCII art */}
        <pre className="mt-6 text-brand-loss/60 text-xs font-mono leading-tight select-none">
{`     |
     |
   __|__
  |     |
  |     |
  |     |
  |_____|
     |
     |
     |
     |
     |`}
        </pre>

        {/* Buttons */}
        <div className="mt-8 flex items-center gap-3">
          <Button
            variant="premium"
            onClick={() => navigate('/')}
            className="gap-2"
          >
            <Home className="h-4 w-4" />
            На главную
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="gap-2 border-white/10 text-gray-300 hover:text-white hover:bg-white/5"
          >
            <ArrowLeft className="h-4 w-4" />
            Назад
          </Button>
        </div>

        {/* Logo footer */}
        <div className="mt-12 flex items-center gap-2 opacity-40">
          <img src="/logo.webp" alt="" className="w-5 h-5 rounded" />
          <span className="text-sm text-gray-500 font-heading">AlgoBond</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/NotFound.tsx
git commit -m "feat: create NotFound.tsx (404) with trading-themed design"
```

- [ ] **Step 3: Run /simplify for review**

---

### Task 11: Create ServerError.tsx (500 page)

**Files:**
- Create: `frontend/src/pages/ServerError.tsx`

- [ ] **Step 1: Create ServerError.tsx**

Create `frontend/src/pages/ServerError.tsx`:

IMPORTANT: This component must NOT use React Router components (Link, useNavigate) because ErrorBoundary wraps the Router, so Router context is unavailable when this renders.

```tsx
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface ServerErrorProps {
  onRetry?: () => void;
}

export function ServerError({ onRetry }: ServerErrorProps) {
  return (
    <div className="min-h-screen bg-[#0d0d1a] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-red-500/5 blur-[120px]" />

      <div className="relative z-10 flex flex-col items-center text-center max-w-md">
        {/* Icon */}
        <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
          <AlertTriangle className="h-12 w-12 text-red-500" />
        </div>

        {/* 500 code */}
        <h1
          className="text-[120px] font-bold leading-none bg-gradient-to-b from-red-500 to-red-500/40 bg-clip-text text-transparent"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          500
        </h1>

        {/* Title */}
        <h2 className="mt-2 text-2xl font-semibold text-white" style={{ fontFamily: "'Jiro', sans-serif" }}>
          Маржин-колл серверу
        </h2>

        {/* Subtitle */}
        <p className="mt-3 text-gray-400 text-lg">
          Что-то пошло не так. Мы уже разбираемся.
        </p>
        <p className="mt-1 text-gray-500 text-sm">
          Сервер попал в стоп-лосс, но скоро вернётся в рынок
        </p>

        {/* Broken chart ASCII art */}
        <pre className="mt-6 text-red-500/50 text-xs font-mono leading-tight select-none">
{`  ___
 |   |
 |   |___
 |       |  ___
 |       | |   |
 |       | |   |
 |       |_|   |
 |             |  X
 |             |/ 
 |              \\
 |               \\___`}
        </pre>

        {/* Buttons - using native elements, NOT React Router */}
        <div className="mt-8 flex items-center gap-3">
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-gradient-to-r from-[#FFD700] to-[#FFA500] text-black font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              <RefreshCw className="h-4 w-4" />
              Попробовать снова
            </button>
          )}
          <a
            href="/"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg border border-white/10 text-gray-300 font-medium text-sm hover:text-white hover:bg-white/5 transition-colors"
          >
            <Home className="h-4 w-4" />
            На главную
          </a>
        </div>

        {/* Logo footer */}
        <div className="mt-12 flex items-center gap-2 opacity-40">
          <img src="/logo.webp" alt="" className="w-5 h-5 rounded" />
          <span className="text-sm text-gray-500" style={{ fontFamily: "'Jiro', sans-serif" }}>AlgoBond</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/ServerError.tsx
git commit -m "feat: create ServerError.tsx (500) with trading-themed design"
```

- [ ] **Step 3: Run /simplify for review**

---

### Task 12: Create ErrorBoundary.tsx

**Files:**
- Create: `frontend/src/components/ErrorBoundary.tsx`

- [ ] **Step 1: Create ErrorBoundary.tsx**

Create `frontend/src/components/ErrorBoundary.tsx`:

```tsx
import React from 'react';
import { ServerError } from '@/pages/ServerError';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return <ServerError onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ErrorBoundary.tsx
git commit -m "feat: create ErrorBoundary component wrapping ServerError"
```

- [ ] **Step 3: Run /simplify for review**

---

### Task 13: Wire ErrorBoundary in App.tsx + update fallback route

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Update App.tsx**

Replace the full content of `frontend/src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Landing } from '@/pages/Landing';
import { Login } from '@/pages/Login';
import { Register } from '@/pages/Register';
import { Dashboard } from '@/pages/Dashboard';
import { Strategies } from '@/pages/Strategies';
import { StrategyDetail } from '@/pages/StrategyDetail';
import { Chart } from '@/pages/Chart';
import { Bots } from '@/pages/Bots';
import { BotDetail } from '@/pages/BotDetail';
import { Backtest } from '@/pages/Backtest';
import { Settings } from '@/pages/Settings';
import { NotFound } from '@/pages/NotFound';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastProvider } from '@/components/ui/toast';

function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Protected routes with dashboard layout */}
            <Route
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/strategies" element={<Strategies />} />
              <Route path="/strategies/:slug" element={<StrategyDetail />} />
              <Route path="/chart/:symbol" element={<Chart />} />
              <Route path="/chart" element={<Chart />} />
              <Route path="/bots" element={<Bots />} />
              <Route path="/bots/:id" element={<BotDetail />} />
              <Route path="/backtest" element={<Backtest />} />
              <Route path="/settings" element={<Settings />} />
            </Route>

            {/* Fallback - 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
```

Key changes:
1. Removed `Navigate` import (no longer needed)
2. Added `NotFound` import
3. Added `ErrorBoundary` import
4. Wrapped everything with `<ErrorBoundary>`
5. Changed fallback route from `<Navigate to="/" replace />` to `<NotFound />`

- [ ] **Step 2: Verify frontend compiles**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: wire ErrorBoundary in App.tsx and update fallback route to NotFound"
```

- [ ] **Step 4: Run /simplify for review**

---

### Task 14: Final integration check - run all tests

**Files:** None (verification only)

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && pytest tests/ -v
```

Verify all existing tests pass plus the new ones:
- `TestAccessRequest::test_access_request_success`
- `TestAccessRequest::test_access_request_duplicate_pending`
- `TestAccessRequest::test_access_request_invalid_telegram`
- `TestAccessRequest::test_access_request_too_short_telegram`
- `TestAccessRequest::test_access_request_after_rejected`
- `TestRegisterWithInviteCode::test_register_with_valid_invite_code`
- `TestRegisterWithInviteCode::test_register_with_invalid_invite_code`
- `TestRegisterWithInviteCode::test_register_with_used_invite_code`
- `TestRegisterWithInviteCode::test_register_with_expired_invite_code`
- `TestRegisterWithInviteCode::test_register_without_invite_code_when_not_required`
- `TestConsentAuditTrail::test_consent_timestamp_set_on_register`

- [ ] **Step 2: Verify frontend compiles with no TypeScript errors**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Verify backend loads**

```bash
cd backend && python -c "from app.main import app; print('App OK')"
```

- [ ] **Step 4: Run /simplify for final review**
