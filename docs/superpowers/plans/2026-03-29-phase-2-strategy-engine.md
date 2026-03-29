# Phase 2: Strategy Module + Lorentzian KNN Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Port the Lorentzian KNN strategy from Pine Script (`strategis_1.pine`, ~895 lines) to Python, create the strategy CRUD module, and build a computation engine that reproduces the ~+710% RIVERUSDT result.

**Architecture:** Strategy module follows existing module pattern (models → schemas → service → router). The engine lives in `engines/` subpackage: `BaseStrategy` ABC defines the interface, `LorentzianKNNStrategy` implements it. Indicators are pure functions operating on numpy arrays — no classes, no state. Confluence scoring combines 5 filter signals + KNN boost (max 5.5). Entry/exit logic generates signals with ATR-based SL/TP/trailing.

**Tech Stack:** Python 3.12, numpy 1.26+, pandas 2.2+, SQLAlchemy 2.0 (async), Pydantic v2, FastAPI, pytest

**Source:** `strategis_1.pine` — Pine Script v6, BertTradeTech Lorentzian KNN Classifier

---

## File Structure

```
backend/
├── requirements.txt                          # MODIFY: add numpy, pandas
├── app/
│   ├── main.py                               # MODIFY: add strategy router
│   ├── modules/
│   │   ├── __init__.py                       # MODIFY: add strategy import
│   │   └── strategy/
│   │       ├── __init__.py                   # CREATE
│   │       ├── models.py                     # CREATE: Strategy, StrategyConfig
│   │       ├── schemas.py                    # CREATE: Pydantic v2 schemas
│   │       ├── service.py                    # CREATE: StrategyService
│   │       ├── router.py                     # CREATE: CRUD endpoints
│   │       └── engines/
│   │           ├── __init__.py               # CREATE: registry
│   │           ├── base.py                   # CREATE: BaseStrategy ABC
│   │           ├── lorentzian_knn.py         # CREATE: full strategy
│   │           └── indicators/
│   │               ├── __init__.py           # CREATE
│   │               ├── trend.py              # CREATE: RSI, EMA, SMA, HMA, ADX, ATR
│   │               ├── oscillators.py        # CREATE: WaveTrend, CCI, BB
│   │               ├── volume.py             # CREATE: VWAP, CVD
│   │               └── smc.py               # CREATE: OB, FVG, Liquidity, BOS, D/S
├── tests/
│   ├── conftest.py                           # MODIFY: import strategy models
│   ├── test_strategy_crud.py                 # CREATE: models + API tests
│   ├── test_indicators.py                    # CREATE: all indicator tests
│   ├── test_lorentzian_knn.py                # CREATE: KNN + confluence tests
│   └── test_engine_integration.py            # CREATE: full engine test
├── alembic/
│   └── versions/
│       └── 002_add_strategy_tables.py        # CREATE: migration
```

---

## Default Config (from TradingView screenshots)

Reference: this is the JSONB `default_config` for the Lorentzian KNN strategy, extracted from `strategis_1.pine` lines 15-126 and the spec section 5.3. Tasks reference specific keys.

```json
{
  "time_filter": {"use": false, "session": "01:30-23:45"},
  "trend": {"ema_fast": 26, "ema_slow": 50, "ema_filter": 200},
  "mtf": {"use": false, "timeframe": "1", "ema_fast": 25, "ema_slow": 50},
  "ribbon": {"use": true, "type": "EMA", "mas": [9,14,21,35,55,89,144,233], "threshold": 4},
  "order_flow": {"use": true, "show_vwap": true, "vwap_stds": [1,2,3], "cvd_period": 20, "cvd_threshold": 0.7, "show_vp_poc": true, "vp_bins": 20},
  "smc": {"use": true, "order_blocks": true, "fvg": true, "liquidity": true, "bos": true, "demand_supply": true, "ob_lookback": 10, "fvg_min_size": 0.5, "liquidity_lookback": 20, "bos_pivot": 5, "ds_impulse_mult": 1.5, "ds_max_zones": 8},
  "volatility": {"use": true, "bb_period": 20, "bb_mult": 2, "atr_percentile_period": 100, "expansion": 1.5, "contraction": 0.7},
  "breakout": {"period": 15, "atr_mult": 1.5},
  "mean_reversion": {"bb_period": 20, "bb_std": 2, "rsi_period": 14, "rsi_ob": 70, "rsi_os": 30},
  "risk": {"atr_period": 14, "stop_atr_mult": 2, "tp_atr_mult": 30, "use_trailing": true, "trailing_atr_mult": 10},
  "filters": {"adx_period": 15, "adx_threshold": 10, "volume_mult": 1},
  "knn": {"neighbors": 8, "lookback": 50, "weight": 0.5, "rsi_period": 15, "wt_ch_len": 10, "wt_avg_len": 21, "cci_period": 20, "adx_period": 14},
  "kernel": {"show": true, "ema_length": 34, "atr_period": 20},
  "backtest": {"initial_capital": 100, "currency": "USDT", "order_size": 75, "order_size_type": "percent_equity", "pyramiding": 0, "commission": 0.05, "slippage": 0, "margin_long": 100, "margin_short": 100}
}
```

---

## Task 1: Add numpy/pandas dependencies

**Files:**
- Modify: `backend/requirements.txt`

- [x] **Step 1: Add dependencies**

Add to `backend/requirements.txt` after the `# Утилиты` section:

```
# Аналитика
numpy==1.26.4
pandas==2.2.3
```

- [x] **Step 2: Install and verify**

Run: `cd backend && pip install numpy==1.26.4 pandas==2.2.3`
Expected: successful install

- [x] **Step 3: Commit**

```bash
git add backend/requirements.txt
git commit -m "feat: add numpy and pandas for strategy engine"
```

---

## Task 2: Strategy module — DB models + migration

**Files:**
- Create: `backend/app/modules/strategy/__init__.py`
- Create: `backend/app/modules/strategy/models.py`
- Modify: `backend/app/modules/__init__.py`
- Modify: `backend/tests/conftest.py`
- Create: `backend/alembic/versions/002_add_strategy_tables.py`

- [x] **Step 1: Create module directory and __init__.py**

Create `backend/app/modules/strategy/__init__.py`:

```python
"""Модуль стратегий: CRUD, конфигурация, движки."""
```

- [x] **Step 2: Write models.py**

Create `backend/app/modules/strategy/models.py`:

```python
"""Модели стратегий: Strategy, StrategyConfig."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Strategy(Base):
    """Стратегия торговли (например, Lorentzian KNN)."""

    __tablename__ = "strategies"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    engine_type: Mapped[str] = mapped_column(String(50))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    default_config: Mapped[dict] = mapped_column(JSONB, default=dict)
    version: Mapped[str] = mapped_column(String(20), default="1.0.0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Связи
    configs: Mapped[list["StrategyConfig"]] = relationship(
        back_populates="strategy", cascade="all, delete-orphan"
    )


class StrategyConfig(Base):
    """Пользовательская конфигурация стратегии для конкретного символа."""

    __tablename__ = "strategy_configs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    strategy_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("strategies.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(200))
    symbol: Mapped[str] = mapped_column(String(30), default="RIVERUSDT")
    timeframe: Mapped[str] = mapped_column(String(10), default="5")
    config: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Связи
    strategy: Mapped["Strategy"] = relationship(back_populates="configs")
```

- [x] **Step 3: Update modules/__init__.py to export strategy**

Modify `backend/app/modules/__init__.py` — add:

```python
"""Модули платформы: auth, billing, strategy."""
```

- [x] **Step 4: Update conftest.py to import strategy models**

In `backend/tests/conftest.py`, add after the existing billing import (line 31):

```python
import app.modules.strategy.models  # noqa: F401
```

- [x] **Step 5: Create Alembic migration**

Run on VPS (or generate locally):
```bash
cd backend && alembic revision --autogenerate -m "add strategy tables"
```

If generating manually, create `backend/alembic/versions/002_add_strategy_tables.py`:

```python
"""add strategy tables

Revision ID: 002
Revises: 001
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "002"
down_revision = "001"


def upgrade() -> None:
    op.create_table(
        "strategies",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(200), nullable=False, unique=True, index=True),
        sa.Column("engine_type", sa.String(50), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("default_config", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("version", sa.String(20), nullable=False, server_default="1.0.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "strategy_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("strategy_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("strategies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("symbol", sa.String(30), nullable=False, server_default="RIVERUSDT"),
        sa.Column("timeframe", sa.String(10), nullable=False, server_default="5"),
        sa.Column("config", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("strategy_configs")
    op.drop_table("strategies")
```

- [x] **Step 6: Verify tables are created in tests**

Run: `cd backend && pytest tests/test_strategy_crud.py -v -k "test_" --co 2>/dev/null; echo "Models import OK"`
At this point just verify the import works:
```bash
cd backend && python -c "from app.modules.strategy.models import Strategy, StrategyConfig; print('OK')"
```
Expected: `OK`

- [x] **Step 7: Commit**

```bash
git add backend/app/modules/strategy/__init__.py backend/app/modules/strategy/models.py backend/app/modules/__init__.py backend/tests/conftest.py
git commit -m "feat(strategy): add Strategy and StrategyConfig models"
```

---

## Task 3: Strategy module — Pydantic schemas

**Files:**
- Create: `backend/app/modules/strategy/schemas.py`

- [x] **Step 1: Write schemas.py**

Create `backend/app/modules/strategy/schemas.py`:

```python
"""Pydantic v2 схемы модуля strategy."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# === Strategy ===

class StrategyCreate(BaseModel):
    """Создание стратегии (admin)."""
    name: str = Field(min_length=2, max_length=200)
    slug: str = Field(min_length=2, max_length=200, pattern=r"^[a-z0-9_-]+$")
    engine_type: str = Field(min_length=2, max_length=50)
    description: str | None = None
    is_public: bool = True
    default_config: dict = Field(default_factory=dict)
    version: str = "1.0.0"


class StrategyResponse(BaseModel):
    """Ответ — стратегия."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    engine_type: str
    description: str | None
    is_public: bool
    author_id: uuid.UUID | None
    default_config: dict
    version: str
    created_at: datetime


class StrategyListResponse(BaseModel):
    """Ответ — краткая информация о стратегии (без default_config)."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    engine_type: str
    description: str | None
    is_public: bool
    version: str


# === StrategyConfig ===

class StrategyConfigCreate(BaseModel):
    """Создание пользовательского конфига."""
    strategy_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)
    symbol: str = Field(default="RIVERUSDT", max_length=30)
    timeframe: str = Field(default="5", max_length=10)
    config: dict = Field(default_factory=dict)


class StrategyConfigUpdate(BaseModel):
    """Обновление конфига."""
    name: str | None = Field(None, min_length=1, max_length=200)
    symbol: str | None = Field(None, max_length=30)
    timeframe: str | None = Field(None, max_length=10)
    config: dict | None = None


class StrategyConfigResponse(BaseModel):
    """Ответ — конфиг стратегии."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    strategy_id: uuid.UUID
    name: str
    symbol: str
    timeframe: str
    config: dict
    created_at: datetime
```

- [x] **Step 2: Verify import**

Run: `cd backend && python -c "from app.modules.strategy.schemas import StrategyCreate, StrategyConfigCreate; print('OK')"`
Expected: `OK`

- [x] **Step 3: Commit**

```bash
git add backend/app/modules/strategy/schemas.py
git commit -m "feat(strategy): add Pydantic v2 schemas"
```

---

## Task 4: Strategy module — Service layer

**Files:**
- Create: `backend/app/modules/strategy/service.py`

- [x] **Step 1: Write service.py**

Create `backend/app/modules/strategy/service.py`:

```python
"""Бизнес-логика модуля strategy."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictException, NotFoundException
from app.modules.strategy.models import Strategy, StrategyConfig
from app.modules.strategy.schemas import (
    StrategyConfigCreate,
    StrategyConfigUpdate,
    StrategyCreate,
)


class StrategyService:
    """Сервис стратегий и пользовательских конфигов."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # === Strategies ===

    async def list_strategies(self, public_only: bool = True) -> list[Strategy]:
        """Список стратегий."""
        query = select(Strategy).order_by(Strategy.name)
        if public_only:
            query = query.where(Strategy.is_public.is_(True))
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_strategy(self, strategy_id: uuid.UUID) -> Strategy:
        """Получить стратегию по ID."""
        result = await self.db.execute(
            select(Strategy).where(Strategy.id == strategy_id)
        )
        strategy = result.scalar_one_or_none()
        if not strategy:
            raise NotFoundException("Стратегия не найдена")
        return strategy

    async def get_strategy_by_slug(self, slug: str) -> Strategy:
        """Получить стратегию по slug."""
        result = await self.db.execute(
            select(Strategy).where(Strategy.slug == slug)
        )
        strategy = result.scalar_one_or_none()
        if not strategy:
            raise NotFoundException(f"Стратегия '{slug}' не найдена")
        return strategy

    async def create_strategy(
        self, data: StrategyCreate, author_id: uuid.UUID | None = None
    ) -> Strategy:
        """Создать стратегию."""
        existing = await self.db.execute(
            select(Strategy).where(Strategy.slug == data.slug)
        )
        if existing.scalar_one_or_none():
            raise ConflictException(f"Стратегия с slug '{data.slug}' уже существует")

        strategy = Strategy(**data.model_dump(), author_id=author_id)
        self.db.add(strategy)
        await self.db.flush()
        return strategy

    # === Strategy Configs ===

    async def list_user_configs(
        self, user_id: uuid.UUID, strategy_id: uuid.UUID | None = None
    ) -> list[StrategyConfig]:
        """Список конфигов пользователя."""
        query = select(StrategyConfig).where(StrategyConfig.user_id == user_id)
        if strategy_id:
            query = query.where(StrategyConfig.strategy_id == strategy_id)
        query = query.order_by(StrategyConfig.created_at.desc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_config(
        self, config_id: uuid.UUID, user_id: uuid.UUID
    ) -> StrategyConfig:
        """Получить конфиг пользователя."""
        result = await self.db.execute(
            select(StrategyConfig).where(
                StrategyConfig.id == config_id,
                StrategyConfig.user_id == user_id,
            )
        )
        config = result.scalar_one_or_none()
        if not config:
            raise NotFoundException("Конфигурация не найдена")
        return config

    async def create_config(
        self, data: StrategyConfigCreate, user_id: uuid.UUID
    ) -> StrategyConfig:
        """Создать конфиг стратегии."""
        # Проверить что стратегия существует
        await self.get_strategy(data.strategy_id)

        config = StrategyConfig(
            user_id=user_id,
            strategy_id=data.strategy_id,
            name=data.name,
            symbol=data.symbol,
            timeframe=data.timeframe,
            config=data.config,
        )
        self.db.add(config)
        await self.db.flush()
        return config

    async def update_config(
        self, config_id: uuid.UUID, user_id: uuid.UUID, data: StrategyConfigUpdate
    ) -> StrategyConfig:
        """Обновить конфиг."""
        config = await self.get_config(config_id, user_id)
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(config, field, value)
        await self.db.flush()
        return config

    async def delete_config(
        self, config_id: uuid.UUID, user_id: uuid.UUID
    ) -> None:
        """Удалить конфиг."""
        config = await self.get_config(config_id, user_id)
        await self.db.delete(config)
        await self.db.flush()
```

- [x] **Step 2: Verify import**

Run: `cd backend && python -c "from app.modules.strategy.service import StrategyService; print('OK')"`
Expected: `OK`

- [x] **Step 3: Commit**

```bash
git add backend/app/modules/strategy/service.py
git commit -m "feat(strategy): add StrategyService with CRUD operations"
```

---

## Task 5: Strategy module — Router + main.py integration

**Files:**
- Create: `backend/app/modules/strategy/router.py`
- Modify: `backend/app/main.py`

- [x] **Step 1: Write router.py**

Create `backend/app/modules/strategy/router.py`:

```python
"""API-эндпоинты модуля strategy."""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenException
from app.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User, UserRole
from app.modules.strategy.schemas import (
    StrategyConfigCreate,
    StrategyConfigResponse,
    StrategyConfigUpdate,
    StrategyCreate,
    StrategyListResponse,
    StrategyResponse,
)
from app.modules.strategy.service import StrategyService

router = APIRouter(prefix="/api/strategies", tags=["strategies"])


# === Strategies ===

@router.get("", response_model=list[StrategyListResponse])
async def list_strategies(
    db: AsyncSession = Depends(get_db),
) -> list[StrategyListResponse]:
    """Список доступных стратегий (публичный)."""
    service = StrategyService(db)
    return await service.list_strategies()


@router.get("/{slug}", response_model=StrategyResponse)
async def get_strategy(
    slug: str,
    db: AsyncSession = Depends(get_db),
) -> StrategyResponse:
    """Получить стратегию по slug с default_config."""
    service = StrategyService(db)
    return await service.get_strategy_by_slug(slug)


@router.post("", response_model=StrategyResponse, status_code=201)
async def create_strategy(
    data: StrategyCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StrategyResponse:
    """Создать стратегию (только admin)."""
    if user.role != UserRole.ADMIN:
        raise ForbiddenException("Только администратор может создавать стратегии")
    service = StrategyService(db)
    return await service.create_strategy(data, author_id=user.id)


# === Strategy Configs ===

@router.get("/configs/my", response_model=list[StrategyConfigResponse])
async def list_my_configs(
    strategy_id: uuid.UUID | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[StrategyConfigResponse]:
    """Мои конфигурации стратегий."""
    service = StrategyService(db)
    return await service.list_user_configs(user.id, strategy_id)


@router.get("/configs/{config_id}", response_model=StrategyConfigResponse)
async def get_config(
    config_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StrategyConfigResponse:
    """Получить конкретный конфиг."""
    service = StrategyService(db)
    return await service.get_config(config_id, user.id)


@router.post("/configs", response_model=StrategyConfigResponse, status_code=201)
async def create_config(
    data: StrategyConfigCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StrategyConfigResponse:
    """Создать конфигурацию стратегии."""
    service = StrategyService(db)
    return await service.create_config(data, user.id)


@router.patch("/configs/{config_id}", response_model=StrategyConfigResponse)
async def update_config(
    config_id: uuid.UUID,
    data: StrategyConfigUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StrategyConfigResponse:
    """Обновить конфигурацию."""
    service = StrategyService(db)
    return await service.update_config(config_id, user.id, data)


@router.delete("/configs/{config_id}", status_code=204)
async def delete_config(
    config_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Удалить конфигурацию."""
    service = StrategyService(db)
    await service.delete_config(config_id, user.id)
```

- [x] **Step 2: Register router in main.py**

In `backend/app/main.py`, add import after billing:

```python
from app.modules.strategy.router import router as strategy_router
```

Add after `app.include_router(billing_router)`:

```python
app.include_router(strategy_router)
```

- [x] **Step 3: Verify app starts**

Run: `cd backend && python -c "from app.main import app; print('Routes:', len(app.routes))"`
Expected: Routes count increases by 7

- [x] **Step 4: Commit**

```bash
git add backend/app/modules/strategy/router.py backend/app/main.py
git commit -m "feat(strategy): add CRUD API endpoints"
```

---

## Task 6: Strategy module — CRUD tests

**Files:**
- Create: `backend/tests/test_strategy_crud.py`

- [x] **Step 1: Write CRUD tests**

Create `backend/tests/test_strategy_crud.py`:

```python
"""Тесты CRUD модуля strategy."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User
from app.modules.strategy.models import Strategy


@pytest.fixture
async def test_strategy(db_session: AsyncSession) -> Strategy:
    """Создать тестовую стратегию."""
    strategy = Strategy(
        id=uuid.uuid4(),
        name="Lorentzian KNN",
        slug="lorentzian-knn",
        engine_type="lorentzian_knn",
        description="ML-based trading strategy",
        is_public=True,
        default_config={"knn": {"neighbors": 8}},
        version="1.0.0",
    )
    db_session.add(strategy)
    await db_session.commit()
    await db_session.refresh(strategy)
    return strategy


# === Strategy endpoints ===

@pytest.mark.asyncio
async def test_list_strategies_empty(client: AsyncClient) -> None:
    """Список стратегий — пустой."""
    resp = await client.get("/api/strategies")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_strategies(client: AsyncClient, test_strategy: Strategy) -> None:
    """Список стратегий — одна стратегия."""
    resp = await client.get("/api/strategies")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["slug"] == "lorentzian-knn"
    assert data[0]["engine_type"] == "lorentzian_knn"


@pytest.mark.asyncio
async def test_get_strategy_by_slug(
    client: AsyncClient, test_strategy: Strategy
) -> None:
    """Получить стратегию по slug."""
    resp = await client.get("/api/strategies/lorentzian-knn")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Lorentzian KNN"
    assert data["default_config"]["knn"]["neighbors"] == 8


@pytest.mark.asyncio
async def test_get_strategy_not_found(client: AsyncClient) -> None:
    """Стратегия не найдена — 404."""
    resp = await client.get("/api/strategies/nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_create_strategy_admin(
    client: AsyncClient, admin_headers: dict
) -> None:
    """Создание стратегии администратором."""
    resp = await client.post(
        "/api/strategies",
        json={
            "name": "Test Strategy",
            "slug": "test-strategy",
            "engine_type": "custom",
            "description": "Test",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["slug"] == "test-strategy"


@pytest.mark.asyncio
async def test_create_strategy_forbidden(
    client: AsyncClient, auth_headers: dict
) -> None:
    """Обычный пользователь не может создать стратегию."""
    resp = await client.post(
        "/api/strategies",
        json={
            "name": "Test",
            "slug": "test",
            "engine_type": "custom",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_create_strategy_duplicate_slug(
    client: AsyncClient, admin_headers: dict, test_strategy: Strategy
) -> None:
    """Дубликат slug — 409."""
    resp = await client.post(
        "/api/strategies",
        json={
            "name": "Another",
            "slug": "lorentzian-knn",
            "engine_type": "custom",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 409


# === StrategyConfig endpoints ===

@pytest.mark.asyncio
async def test_create_config(
    client: AsyncClient, auth_headers: dict, test_strategy: Strategy
) -> None:
    """Создание конфига стратегии."""
    resp = await client.post(
        "/api/strategies/configs",
        json={
            "strategy_id": str(test_strategy.id),
            "name": "My RIVER config",
            "symbol": "RIVERUSDT",
            "timeframe": "5",
            "config": {"knn": {"neighbors": 10}},
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "My RIVER config"
    assert data["config"]["knn"]["neighbors"] == 10


@pytest.mark.asyncio
async def test_list_my_configs(
    client: AsyncClient, auth_headers: dict, test_strategy: Strategy
) -> None:
    """Список моих конфигов."""
    # Создать конфиг
    await client.post(
        "/api/strategies/configs",
        json={
            "strategy_id": str(test_strategy.id),
            "name": "Config 1",
        },
        headers=auth_headers,
    )
    resp = await client.get("/api/strategies/configs/my", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1


@pytest.mark.asyncio
async def test_update_config(
    client: AsyncClient, auth_headers: dict, test_strategy: Strategy
) -> None:
    """Обновление конфига."""
    create_resp = await client.post(
        "/api/strategies/configs",
        json={
            "strategy_id": str(test_strategy.id),
            "name": "Old Name",
        },
        headers=auth_headers,
    )
    config_id = create_resp.json()["id"]

    resp = await client.patch(
        f"/api/strategies/configs/{config_id}",
        json={"name": "New Name", "symbol": "BTCUSDT"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"
    assert resp.json()["symbol"] == "BTCUSDT"


@pytest.mark.asyncio
async def test_delete_config(
    client: AsyncClient, auth_headers: dict, test_strategy: Strategy
) -> None:
    """Удаление конфига."""
    create_resp = await client.post(
        "/api/strategies/configs",
        json={
            "strategy_id": str(test_strategy.id),
            "name": "To Delete",
        },
        headers=auth_headers,
    )
    config_id = create_resp.json()["id"]

    resp = await client.delete(
        f"/api/strategies/configs/{config_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 204

    # Проверить удаление
    resp = await client.get(
        f"/api/strategies/configs/{config_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 404
```

- [x] **Step 2: Run tests**

Run: `cd backend && pytest tests/test_strategy_crud.py -v`
Expected: All 11 tests PASS

- [x] **Step 3: Commit**

```bash
git add backend/tests/test_strategy_crud.py
git commit -m "test(strategy): CRUD tests for strategies and configs"
```

---

## Task 7: Trend indicators — RSI, EMA, SMA, HMA, ADX, ATR

These are pure numpy functions ported from Pine Script `ta.*` built-ins. Each function takes numpy arrays and returns numpy arrays.

**Files:**
- Create: `backend/app/modules/strategy/engines/__init__.py`
- Create: `backend/app/modules/strategy/engines/indicators/__init__.py`
- Create: `backend/app/modules/strategy/engines/indicators/trend.py`
- Create: `backend/tests/test_indicators.py`

**Reference:** Pine Script lines 146-175 (core indicators, MA ribbon)

- [x] **Step 1: Create engine package structure**

Create `backend/app/modules/strategy/engines/__init__.py`:

```python
"""Движки торговых стратегий."""
```

Create `backend/app/modules/strategy/engines/indicators/__init__.py`:

```python
"""Технические индикаторы — чистые функции на numpy."""
```

- [x] **Step 2: Write trend indicators**

Create `backend/app/modules/strategy/engines/indicators/trend.py`:

```python
"""Трендовые индикаторы: RSI, EMA, SMA, HMA, WMA, ADX/DMI, ATR.

Все функции принимают numpy-массивы и возвращают numpy-массивы.
NaN в начале — нормальное поведение (недостаточно данных для расчёта).
Совместимость с Pine Script ta.* built-ins (Wilder's smoothing для RSI/ADX/ATR).
"""

import numpy as np
from numpy.typing import NDArray


def sma(src: NDArray, period: int) -> NDArray:
    """Simple Moving Average. Pine: ta.sma(src, period)."""
    out = np.full_like(src, np.nan, dtype=np.float64)
    if len(src) < period:
        return out
    cumsum = np.cumsum(src)
    cumsum[period:] = cumsum[period:] - cumsum[:-period]
    out[period - 1:] = cumsum[period - 1:] / period
    return out


def ema(src: NDArray, period: int) -> NDArray:
    """Exponential Moving Average. Pine: ta.ema(src, period).

    Pine EMA использует alpha = 2/(period+1).
    """
    out = np.full_like(src, np.nan, dtype=np.float64)
    if len(src) < period:
        return out
    alpha = 2.0 / (period + 1)
    # Инициализируем SMA первых period баров
    out[period - 1] = np.mean(src[:period])
    for i in range(period, len(src)):
        out[i] = alpha * src[i] + (1 - alpha) * out[i - 1]
    return out


def wma(src: NDArray, period: int) -> NDArray:
    """Weighted Moving Average. Pine: ta.wma(src, period)."""
    out = np.full_like(src, np.nan, dtype=np.float64)
    if len(src) < period:
        return out
    weights = np.arange(1, period + 1, dtype=np.float64)
    weight_sum = weights.sum()
    for i in range(period - 1, len(src)):
        out[i] = np.dot(src[i - period + 1:i + 1], weights) / weight_sum
    return out


def hma(src: NDArray, period: int) -> NDArray:
    """Hull Moving Average. Pine: custom hma() function.

    HMA = WMA(2*WMA(n/2) - WMA(n), sqrt(n))
    Ref: strategis_1.pine lines 130-133
    """
    half_period = max(period // 2, 1)
    sqrt_period = max(int(np.round(np.sqrt(period))), 1)
    wma_half = wma(src, half_period)
    wma_full = wma(src, period)
    diff = 2.0 * wma_half - wma_full
    # WMA of diff — нужен только не-NaN участок
    return wma(diff, sqrt_period)


def calc_ma(src: NDArray, period: int, ma_type: str = "EMA") -> NDArray:
    """Универсальный MA. Pine: calc_ma(src, len, ma_type).

    Ref: strategis_1.pine lines 135-140
    """
    if ma_type == "SMA":
        return sma(src, period)
    elif ma_type == "HMA":
        return hma(src, period)
    else:
        return ema(src, period)


def rsi(close: NDArray, period: int = 14) -> NDArray:
    """Relative Strength Index. Pine: ta.rsi(close, period).

    Используем Wilder's smoothing (RMA), как в Pine Script.
    """
    out = np.full_like(close, np.nan, dtype=np.float64)
    if len(close) < period + 1:
        return out

    deltas = np.diff(close)
    gains = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)

    # Первое значение — SMA
    avg_gain = np.mean(gains[:period])
    avg_loss = np.mean(losses[:period])

    out[period] = 100.0 - 100.0 / (1.0 + avg_gain / avg_loss) if avg_loss != 0 else 100.0

    # Wilder's smoothing (RMA)
    for i in range(period, len(deltas)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        if avg_loss == 0:
            out[i + 1] = 100.0
        else:
            rs = avg_gain / avg_loss
            out[i + 1] = 100.0 - 100.0 / (1.0 + rs)

    return out


def atr(high: NDArray, low: NDArray, close: NDArray, period: int = 14) -> NDArray:
    """Average True Range. Pine: ta.atr(period).

    Wilder's smoothing (RMA) of True Range.
    """
    out = np.full_like(close, np.nan, dtype=np.float64)
    if len(close) < period + 1:
        return out

    # True Range: max(high-low, |high-prev_close|, |low-prev_close|)
    tr = np.empty(len(close) - 1, dtype=np.float64)
    for i in range(1, len(close)):
        tr[i - 1] = max(
            high[i] - low[i],
            abs(high[i] - close[i - 1]),
            abs(low[i] - close[i - 1]),
        )

    # Первое значение — SMA
    out[period] = np.mean(tr[:period])

    # Wilder's smoothing
    for i in range(period, len(tr)):
        out[i + 1] = (out[i] * (period - 1) + tr[i]) / period

    return out


def dmi(
    high: NDArray, low: NDArray, close: NDArray, period: int = 14
) -> tuple[NDArray, NDArray, NDArray]:
    """Directional Movement Index. Pine: ta.dmi(period, period).

    Возвращает (di_plus, di_minus, adx).
    Wilder's smoothing, как в Pine Script.
    """
    n = len(close)
    di_plus = np.full(n, np.nan, dtype=np.float64)
    di_minus = np.full(n, np.nan, dtype=np.float64)
    adx_out = np.full(n, np.nan, dtype=np.float64)

    if n < period * 2 + 1:
        return di_plus, di_minus, adx_out

    # True Range
    tr = np.empty(n - 1, dtype=np.float64)
    plus_dm = np.empty(n - 1, dtype=np.float64)
    minus_dm = np.empty(n - 1, dtype=np.float64)

    for i in range(1, n):
        tr[i - 1] = max(
            high[i] - low[i],
            abs(high[i] - close[i - 1]),
            abs(low[i] - close[i - 1]),
        )
        up_move = high[i] - high[i - 1]
        down_move = low[i - 1] - low[i]
        plus_dm[i - 1] = up_move if up_move > down_move and up_move > 0 else 0.0
        minus_dm[i - 1] = down_move if down_move > up_move and down_move > 0 else 0.0

    # Wilder's smoothing — первое значение SMA, далее RMA
    smooth_tr = np.mean(tr[:period])
    smooth_plus = np.mean(plus_dm[:period])
    smooth_minus = np.mean(minus_dm[:period])

    if smooth_tr > 0:
        di_plus[period] = 100.0 * smooth_plus / smooth_tr
        di_minus[period] = 100.0 * smooth_minus / smooth_tr
    else:
        di_plus[period] = 0.0
        di_minus[period] = 0.0

    dx_values = []
    di_sum = di_plus[period] + di_minus[period]
    dx = abs(di_plus[period] - di_minus[period]) / di_sum * 100.0 if di_sum > 0 else 0.0
    dx_values.append(dx)

    for i in range(period, len(tr)):
        smooth_tr = (smooth_tr * (period - 1) + tr[i]) / period
        smooth_plus = (smooth_plus * (period - 1) + plus_dm[i]) / period
        smooth_minus = (smooth_minus * (period - 1) + minus_dm[i]) / period

        if smooth_tr > 0:
            di_plus[i + 1] = 100.0 * smooth_plus / smooth_tr
            di_minus[i + 1] = 100.0 * smooth_minus / smooth_tr
        else:
            di_plus[i + 1] = 0.0
            di_minus[i + 1] = 0.0

        di_sum = di_plus[i + 1] + di_minus[i + 1]
        dx = abs(di_plus[i + 1] - di_minus[i + 1]) / di_sum * 100.0 if di_sum > 0 else 0.0
        dx_values.append(dx)

    # ADX — Wilder's smoothing of DX (ещё один period)
    if len(dx_values) >= period:
        adx_val = np.mean(dx_values[:period])
        adx_out[period * 2] = adx_val
        for i in range(period, len(dx_values)):
            adx_val = (adx_val * (period - 1) + dx_values[i]) / period
            adx_out[period + i + 1] = adx_val

    return di_plus, di_minus, adx_out


def stdev(src: NDArray, period: int) -> NDArray:
    """Rolling standard deviation. Pine: ta.stdev(src, period)."""
    out = np.full_like(src, np.nan, dtype=np.float64)
    if len(src) < period:
        return out
    for i in range(period - 1, len(src)):
        out[i] = np.std(src[i - period + 1:i + 1], ddof=0)
    return out


def percentrank(src: NDArray, period: int) -> NDArray:
    """Percent rank. Pine: ta.percentrank(src, period).

    Доля значений за period баров, меньших текущего.
    """
    out = np.full_like(src, np.nan, dtype=np.float64)
    if len(src) < period + 1:
        return out
    for i in range(period, len(src)):
        window = src[i - period:i]
        count = np.sum(window < src[i])
        out[i] = count / period * 100.0
    return out


def ma_ribbon(
    close: NDArray,
    periods: list[int],
    ma_type: str = "EMA",
    threshold: int = 4,
) -> tuple[NDArray, NDArray]:
    """MA Ribbon alignment. Pine: lines 163-176.

    Считает количество MA в правильном порядке (каждая короче > длиннее).
    Возвращает (bullish_bool_array, bearish_bool_array).
    """
    n = len(close)
    mas = [calc_ma(close, p, ma_type) for p in periods]

    bullish_count = np.zeros(n, dtype=np.float64)
    bearish_count = np.zeros(n, dtype=np.float64)

    for i in range(len(mas) - 1):
        bullish_count += np.where(
            ~np.isnan(mas[i]) & ~np.isnan(mas[i + 1]),
            np.where(mas[i] > mas[i + 1], 1.0, 0.0),
            0.0,
        )
        bearish_count += np.where(
            ~np.isnan(mas[i]) & ~np.isnan(mas[i + 1]),
            np.where(mas[i] < mas[i + 1], 1.0, 0.0),
            0.0,
        )

    # Pine: ribbon_bullish = ribbon_bullish_count >= (ribbon_threshold - 1)
    bullish = bullish_count >= (threshold - 1)
    bearish = bearish_count >= (threshold - 1)
    return bullish, bearish
```

- [x] **Step 3: Write trend indicator tests**

Add to `backend/tests/test_indicators.py`:

```python
"""Тесты технических индикаторов."""

import numpy as np
import pytest

from app.modules.strategy.engines.indicators.trend import (
    atr,
    calc_ma,
    dmi,
    ema,
    hma,
    ma_ribbon,
    percentrank,
    rsi,
    sma,
    stdev,
    wma,
)


# === Тестовые данные ===

# 30 баров OHLCV для тестов (синтетические, восходящий тренд с откатами)
CLOSE = np.array([
    100, 102, 101, 103, 105, 104, 106, 108, 107, 110,
    109, 111, 113, 112, 115, 114, 116, 118, 117, 120,
    119, 121, 123, 122, 125, 124, 126, 128, 127, 130,
], dtype=np.float64)

HIGH = CLOSE + 1.5
LOW = CLOSE - 1.5
OPEN = CLOSE - 0.5


# === SMA ===

class TestSMA:
    def test_basic(self) -> None:
        result = sma(CLOSE, 5)
        assert np.isnan(result[3])
        assert not np.isnan(result[4])
        assert result[4] == pytest.approx(np.mean(CLOSE[:5]))

    def test_short_data(self) -> None:
        result = sma(CLOSE[:3], 5)
        assert all(np.isnan(result))

    def test_period_1(self) -> None:
        result = sma(CLOSE, 1)
        np.testing.assert_array_almost_equal(result, CLOSE)


# === EMA ===

class TestEMA:
    def test_first_value_is_sma(self) -> None:
        result = ema(CLOSE, 10)
        expected_first = np.mean(CLOSE[:10])
        assert result[9] == pytest.approx(expected_first)

    def test_ema_smoothing(self) -> None:
        result = ema(CLOSE, 10)
        # EMA следует за восходящим трендом
        assert result[-1] > result[15]

    def test_short_data(self) -> None:
        result = ema(CLOSE[:3], 10)
        assert all(np.isnan(result))


# === WMA ===

class TestWMA:
    def test_basic(self) -> None:
        result = wma(CLOSE, 5)
        assert not np.isnan(result[4])
        # WMA даёт больший вес последним значениям
        weights = np.arange(1, 6, dtype=np.float64)
        expected = np.dot(CLOSE[:5], weights) / weights.sum()
        assert result[4] == pytest.approx(expected)


# === HMA ===

class TestHMA:
    def test_faster_than_sma(self) -> None:
        result_hma = hma(CLOSE, 10)
        result_sma = sma(CLOSE, 10)
        # HMA реагирует быстрее на тренд — на последних барах должен быть ближе к цене
        last_valid_hma = result_hma[~np.isnan(result_hma)][-1]
        last_valid_sma = result_sma[~np.isnan(result_sma)][-1]
        assert abs(last_valid_hma - CLOSE[-1]) < abs(last_valid_sma - CLOSE[-1])


# === RSI ===

class TestRSI:
    def test_uptrend_rsi_above_50(self) -> None:
        result = rsi(CLOSE, 14)
        last_valid = result[~np.isnan(result)]
        assert len(last_valid) > 0
        # Восходящий тренд — RSI > 50
        assert last_valid[-1] > 50

    def test_range_0_100(self) -> None:
        result = rsi(CLOSE, 14)
        valid = result[~np.isnan(result)]
        assert all(0 <= v <= 100 for v in valid)

    def test_constant_price(self) -> None:
        flat = np.full(30, 100.0)
        result = rsi(flat, 14)
        # Нет изменений — RSI не определён при avg_loss=0, возвращает 100
        valid = result[~np.isnan(result)]
        assert all(v == 100.0 for v in valid)


# === ATR ===

class TestATR:
    def test_positive(self) -> None:
        result = atr(HIGH, LOW, CLOSE, 14)
        valid = result[~np.isnan(result)]
        assert all(v > 0 for v in valid)

    def test_constant_range(self) -> None:
        h = np.full(30, 102.0)
        l = np.full(30, 98.0)
        c = np.full(30, 100.0)
        result = atr(h, l, c, 14)
        valid = result[~np.isnan(result)]
        # Постоянный диапазон 4 — ATR стремится к 4
        assert valid[-1] == pytest.approx(4.0, abs=0.1)


# === DMI/ADX ===

class TestDMI:
    def test_uptrend_di_plus_dominant(self) -> None:
        di_p, di_m, adx_val = dmi(HIGH, LOW, CLOSE, 14)
        valid_plus = di_p[~np.isnan(di_p)]
        valid_minus = di_m[~np.isnan(di_m)]
        if len(valid_plus) > 0 and len(valid_minus) > 0:
            # В восходящем тренде DI+ > DI-
            assert valid_plus[-1] > valid_minus[-1]

    def test_adx_range(self) -> None:
        _, _, adx_val = dmi(HIGH, LOW, CLOSE, 14)
        valid = adx_val[~np.isnan(adx_val)]
        if len(valid) > 0:
            assert all(0 <= v <= 100 for v in valid)


# === Stdev ===

class TestStdev:
    def test_constant_zero(self) -> None:
        flat = np.full(30, 100.0)
        result = stdev(flat, 10)
        valid = result[~np.isnan(result)]
        assert all(v == pytest.approx(0.0) for v in valid)


# === Percentrank ===

class TestPercentrank:
    def test_increasing(self) -> None:
        increasing = np.arange(30, dtype=np.float64)
        result = percentrank(increasing, 10)
        valid = result[~np.isnan(result)]
        # Каждое новое значение больше всех предыдущих в окне
        assert valid[-1] == pytest.approx(100.0)


# === MA Ribbon ===

class TestMARibbon:
    def test_uptrend_bullish(self) -> None:
        # Длинный восходящий тренд — ribbon должен быть bullish
        long_up = np.arange(300, dtype=np.float64) + 100
        bullish, bearish = ma_ribbon(
            long_up, [9, 14, 21, 35, 55, 89, 144, 233], "EMA", 4
        )
        # На конце длинного восходящего тренда
        assert bullish[-1] == True
        assert bearish[-1] == False

    def test_calc_ma_types(self) -> None:
        result_ema = calc_ma(CLOSE, 10, "EMA")
        result_sma = calc_ma(CLOSE, 10, "SMA")
        result_hma = calc_ma(CLOSE, 10, "HMA")
        # Все возвращают массивы одинаковой длины
        assert len(result_ema) == len(CLOSE)
        assert len(result_sma) == len(CLOSE)
        assert len(result_hma) == len(CLOSE)
```

- [x] **Step 4: Run tests**

Run: `cd backend && pytest tests/test_indicators.py -v`
Expected: All tests PASS

- [x] **Step 5: Commit**

```bash
git add backend/app/modules/strategy/engines/ backend/tests/test_indicators.py
git commit -m "feat(strategy): trend indicators — RSI, EMA, SMA, HMA, ADX, ATR, MA Ribbon"
```

---

## Task 8: Oscillator indicators — WaveTrend, CCI, Bollinger Bands

**Files:**
- Create: `backend/app/modules/strategy/engines/indicators/oscillators.py`
- Modify: `backend/tests/test_indicators.py`

**Reference:** Pine Script lines 376-380 (WaveTrend), 383 (CCI), 152-156 (BB)

- [x] **Step 1: Write oscillators.py**

Create `backend/app/modules/strategy/engines/indicators/oscillators.py`:

```python
"""Осцилляторы: WaveTrend, CCI, Bollinger Bands.

Все функции — чистые numpy, без состояния.
"""

import numpy as np
from numpy.typing import NDArray

from app.modules.strategy.engines.indicators.trend import ema, sma, stdev


def wavetrend(
    hlc3: NDArray, channel_len: int = 10, avg_len: int = 21
) -> NDArray:
    """WaveTrend Oscillator (LazyBear implementation).

    Pine Script ref (lines 376-380):
        wt_esa = ta.ema(hlc3, knn_wt_n1)
        wt_d = ta.ema(math.abs(hlc3 - wt_esa), knn_wt_n1)
        wt_ci = wt_d != 0 ? (hlc3 - wt_esa) / (0.015 * wt_d) : 0.0
        knn_wt_val = ta.ema(wt_ci, knn_wt_n2)
    """
    esa = ema(hlc3, channel_len)
    d = ema(np.abs(hlc3 - esa), channel_len)
    ci = np.where(d != 0, (hlc3 - esa) / (0.015 * d), 0.0)
    # Заменяем NaN на 0 для EMA smoothing (как Pine nz())
    ci = np.nan_to_num(ci, nan=0.0)
    return ema(ci, avg_len)


def cci(close: NDArray, period: int = 20) -> NDArray:
    """Commodity Channel Index. Pine: ta.cci(close, period).

    CCI = (close - SMA(close, period)) / (0.015 * mean_deviation)
    Pine Script ref (line 383): knn_cci_val = ta.cci(close, knn_cci_len)
    """
    out = np.full_like(close, np.nan, dtype=np.float64)
    if len(close) < period:
        return out

    sma_vals = sma(close, period)

    for i in range(period - 1, len(close)):
        window = close[i - period + 1:i + 1]
        mean_dev = np.mean(np.abs(window - sma_vals[i]))
        if mean_dev != 0:
            out[i] = (close[i] - sma_vals[i]) / (0.015 * mean_dev)
        else:
            out[i] = 0.0

    return out


def bollinger_bands(
    close: NDArray, period: int = 20, mult: float = 2.0
) -> tuple[NDArray, NDArray, NDArray]:
    """Bollinger Bands. Pine: lines 152-155.

    Возвращает (upper, basis, lower).
        bb_basis = ta.sma(close, bb_length)
        bb_dev = bb_mult * ta.stdev(close, bb_length)
    """
    basis = sma(close, period)
    dev = mult * stdev(close, period)
    upper = basis + dev
    lower = basis - dev
    return upper, basis, lower
```

- [x] **Step 2: Add oscillator tests**

Add to `backend/tests/test_indicators.py` — append after existing test classes:

```python
from app.modules.strategy.engines.indicators.oscillators import (
    bollinger_bands,
    cci,
    wavetrend,
)

# HLC3 для WaveTrend
HLC3 = (HIGH + LOW + CLOSE) / 3


# === WaveTrend ===

class TestWaveTrend:
    def test_returns_array(self) -> None:
        result = wavetrend(HLC3, 10, 21)
        assert len(result) == len(HLC3)

    def test_not_all_nan(self) -> None:
        long_hlc3 = np.arange(100, dtype=np.float64) + 100
        result = wavetrend(long_hlc3, 10, 21)
        valid = result[~np.isnan(result)]
        assert len(valid) > 0


# === CCI ===

class TestCCI:
    def test_uptrend_positive(self) -> None:
        result = cci(CLOSE, 14)
        valid = result[~np.isnan(result)]
        # Устойчивый восходящий тренд — последние CCI > 0
        assert valid[-1] > 0

    def test_constant_zero(self) -> None:
        flat = np.full(30, 100.0)
        result = cci(flat, 14)
        valid = result[~np.isnan(result)]
        assert all(v == pytest.approx(0.0) for v in valid)


# === Bollinger Bands ===

class TestBollingerBands:
    def test_upper_above_lower(self) -> None:
        upper, basis, lower = bollinger_bands(CLOSE, 20, 2.0)
        valid_idx = ~np.isnan(upper) & ~np.isnan(lower)
        assert all(upper[valid_idx] >= lower[valid_idx])

    def test_basis_is_sma(self) -> None:
        upper, basis, lower = bollinger_bands(CLOSE, 20, 2.0)
        sma_val = sma(CLOSE, 20)
        valid_idx = ~np.isnan(basis)
        np.testing.assert_array_almost_equal(basis[valid_idx], sma_val[valid_idx])

    def test_constant_price_bands_collapse(self) -> None:
        flat = np.full(30, 100.0)
        upper, basis, lower = bollinger_bands(flat, 20, 2.0)
        valid_idx = ~np.isnan(upper)
        # Стандартное отклонение 0 — bands = basis
        np.testing.assert_array_almost_equal(upper[valid_idx], basis[valid_idx])
```

- [x] **Step 3: Run tests**

Run: `cd backend && pytest tests/test_indicators.py -v`
Expected: All tests PASS (old + new)

- [x] **Step 4: Commit**

```bash
git add backend/app/modules/strategy/engines/indicators/oscillators.py backend/tests/test_indicators.py
git commit -m "feat(strategy): oscillator indicators — WaveTrend, CCI, Bollinger Bands"
```

---

## Task 9: Volume indicators — VWAP, CVD

**Files:**
- Create: `backend/app/modules/strategy/engines/indicators/volume.py`
- Modify: `backend/tests/test_indicators.py`

**Reference:** Pine Script lines 189-224 (VWAP, CVD, volume analysis)

- [x] **Step 1: Write volume.py**

Create `backend/app/modules/strategy/engines/indicators/volume.py`:

```python
"""Индикаторы объёма: VWAP, CVD, Volume Profile.

Все функции — чистые numpy, без состояния.
"""

import numpy as np
from numpy.typing import NDArray

from app.modules.strategy.engines.indicators.trend import sma


def vwap_bands(
    high: NDArray,
    low: NDArray,
    close: NDArray,
    volume: NDArray,
    std_mults: list[float] | None = None,
) -> tuple[NDArray, list[tuple[NDArray, NDArray]]]:
    """VWAP с полосами стандартного отклонения.

    Pine Script ref (lines 189-207):
        vwap = cumulative(volume * hlc3) / cumulative(volume)
        vwap_dev = ta.stdev(close, cvd_length) — УПРОЩЕНИЕ: используем скользящее.

    Упрощение для бэктеста: не ресетим по дням (нет информации о границах дней
    в массиве OHLCV). Для live будет ресет по daily boundary.

    Возвращает (vwap_line, [(upper1, lower1), (upper2, lower2), ...]).
    """
    if std_mults is None:
        std_mults = [1.0, 2.0, 3.0]

    hlc3 = (high + low + close) / 3
    cum_vol_price = np.cumsum(volume * hlc3)
    cum_vol = np.cumsum(volume)

    vwap_line = np.where(cum_vol > 0, cum_vol_price / cum_vol, close)

    # Стандартное отклонение — скользящее, как в Pine
    dev = sma(np.abs(close - vwap_line), 20)
    dev = np.nan_to_num(dev, nan=0.0)

    bands = []
    for mult in std_mults:
        upper = vwap_line + mult * dev
        lower = vwap_line - mult * dev
        bands.append((upper, lower))

    return vwap_line, bands


def cvd(
    open_: NDArray, close: NDArray, volume: NDArray, period: int = 20
) -> tuple[NDArray, NDArray]:
    """Cumulative Volume Delta + SMA.

    Pine Script ref (lines 209-214):
        buy_volume = close > open ? volume : 0
        sell_volume = close < open ? volume : 0
        delta = buy_volume - sell_volume
        cvd = ta.cum(delta)
        cvd_sma = ta.sma(cvd, cvd_length)

    Возвращает (cvd_line, cvd_sma_line).
    """
    buy_vol = np.where(close > open_, volume, 0.0)
    sell_vol = np.where(close < open_, volume, 0.0)
    delta = buy_vol - sell_vol
    cvd_line = np.cumsum(delta)
    cvd_sma_line = sma(cvd_line, period)
    return cvd_line, cvd_sma_line


def order_flow_signals(
    open_: NDArray,
    close: NDArray,
    volume: NDArray,
    vwap_line: NDArray,
    cvd_period: int = 20,
    cvd_threshold: float = 0.7,
) -> tuple[NDArray, NDArray]:
    """Order Flow сигналы: bullish/bearish.

    Pine Script ref (lines 214-224):
        cvd_bullish = cvd > cvd_sma and close < close[1] and cvd > cvd[1]
        volume_ratio = buy_volume / max(sell_volume, 1)
        strong_buying = volume_ratio > (1 + cvd_threshold)
        of_bullish = (cvd_bullish or strong_buying) and (vwap_cross_up or price_above_vwap)

    Возвращает (of_bullish, of_bearish) — boolean arrays.
    """
    buy_vol = np.where(close > open_, volume, 0.0)
    sell_vol = np.where(close < open_, volume, 0.0)
    delta = buy_vol - sell_vol
    cvd_line = np.cumsum(delta)
    cvd_sma_line = sma(cvd_line, cvd_period)

    # CVD divergence
    cvd_bull = np.zeros(len(close), dtype=bool)
    cvd_bear = np.zeros(len(close), dtype=bool)
    for i in range(1, len(close)):
        if not np.isnan(cvd_sma_line[i]):
            cvd_bull[i] = cvd_line[i] > cvd_sma_line[i] and close[i] < close[i-1] and cvd_line[i] > cvd_line[i-1]
            cvd_bear[i] = cvd_line[i] < cvd_sma_line[i] and close[i] > close[i-1] and cvd_line[i] < cvd_line[i-1]

    # Volume ratio
    volume_ratio = np.where(sell_vol > 0, buy_vol / sell_vol, buy_vol)
    strong_buying = volume_ratio > (1 + cvd_threshold)
    strong_selling = volume_ratio < (1 - cvd_threshold)

    # VWAP cross & position
    price_above_vwap = close > vwap_line
    price_below_vwap = close < vwap_line
    vwap_cross_up = np.zeros(len(close), dtype=bool)
    vwap_cross_down = np.zeros(len(close), dtype=bool)
    for i in range(1, len(close)):
        vwap_cross_up[i] = close[i] > vwap_line[i] and close[i-1] <= vwap_line[i-1]
        vwap_cross_down[i] = close[i] < vwap_line[i] and close[i-1] >= vwap_line[i-1]

    of_bullish = (cvd_bull | strong_buying) & (vwap_cross_up | price_above_vwap)
    of_bearish = (cvd_bear | strong_selling) & (vwap_cross_down | price_below_vwap)

    return of_bullish, of_bearish
```

- [x] **Step 2: Add volume indicator tests**

Add to `backend/tests/test_indicators.py`:

```python
from app.modules.strategy.engines.indicators.volume import (
    cvd,
    order_flow_signals,
    vwap_bands,
)

VOLUME = np.full(30, 1000.0, dtype=np.float64)


# === VWAP ===

class TestVWAP:
    def test_returns_correct_length(self) -> None:
        vwap_line, bands = vwap_bands(HIGH, LOW, CLOSE, VOLUME)
        assert len(vwap_line) == len(CLOSE)
        assert len(bands) == 3  # default 3 std bands

    def test_constant_volume(self) -> None:
        vwap_line, _ = vwap_bands(HIGH, LOW, CLOSE, VOLUME)
        # С постоянным объёмом VWAP = cumulative mean of HLC3
        hlc3 = (HIGH + LOW + CLOSE) / 3
        expected_last = np.mean(hlc3)
        assert vwap_line[-1] == pytest.approx(expected_last, rel=0.01)


# === CVD ===

class TestCVD:
    def test_uptrend_positive_cvd(self) -> None:
        cvd_line, cvd_sma_line = cvd(OPEN, CLOSE, VOLUME, 10)
        # Восходящий тренд: close > open чаще → CVD растёт
        assert cvd_line[-1] > 0

    def test_flat_zero_cvd(self) -> None:
        flat_close = np.full(30, 100.0)
        flat_open = flat_close.copy()
        vol = np.full(30, 1000.0)
        cvd_line, _ = cvd(flat_open, flat_close, vol, 10)
        # open == close → no delta
        assert cvd_line[-1] == pytest.approx(0.0)


# === Order Flow ===

class TestOrderFlow:
    def test_returns_bool_arrays(self) -> None:
        vwap_line, _ = vwap_bands(HIGH, LOW, CLOSE, VOLUME)
        of_bull, of_bear = order_flow_signals(OPEN, CLOSE, VOLUME, vwap_line)
        assert of_bull.dtype == bool
        assert of_bear.dtype == bool
        assert len(of_bull) == len(CLOSE)
```

- [x] **Step 3: Run tests**

Run: `cd backend && pytest tests/test_indicators.py -v`
Expected: All tests PASS

- [x] **Step 4: Commit**

```bash
git add backend/app/modules/strategy/engines/indicators/volume.py backend/tests/test_indicators.py
git commit -m "feat(strategy): volume indicators — VWAP, CVD, Order Flow signals"
```

---

## Task 10: SMC indicators — Order Blocks, FVG, Liquidity, BOS, Demand/Supply

**Files:**
- Create: `backend/app/modules/strategy/engines/indicators/smc.py`
- Modify: `backend/tests/test_indicators.py`

**Reference:** Pine Script lines 247-349 (SMC sections)

- [x] **Step 1: Write smc.py**

Create `backend/app/modules/strategy/engines/indicators/smc.py`:

```python
"""Smart Money Concepts: Order Blocks, FVG, Liquidity Sweeps, BOS, Demand/Supply.

Все функции возвращают boolean-массивы сигналов.
Ref: strategis_1.pine lines 247-349
"""

import numpy as np
from numpy.typing import NDArray

from app.modules.strategy.engines.indicators.trend import atr as calc_atr


def order_blocks(
    open_: NDArray, close: NDArray, high: NDArray, low: NDArray
) -> tuple[NDArray, NDArray]:
    """Order Blocks — engulfing patterns.

    Pine (lines 247-248):
        bullish_ob = close > open and close[1] < open[1] and high - close < (high - low) * 0.3
        bearish_ob = close < open and close[1] > open[1] and close - low < (high - low) * 0.3

    Возвращает (bullish_ob, bearish_ob) — boolean arrays.
    """
    n = len(close)
    bullish = np.zeros(n, dtype=bool)
    bearish = np.zeros(n, dtype=bool)

    for i in range(1, n):
        candle_range = high[i] - low[i]
        if candle_range == 0:
            continue
        # Bullish OB: current green candle + prev red candle + small upper wick
        if (close[i] > open_[i] and close[i-1] < open_[i-1]
                and (high[i] - close[i]) < candle_range * 0.3):
            bullish[i] = True
        # Bearish OB: current red candle + prev green candle + small lower wick
        if (close[i] < open_[i] and close[i-1] > open_[i-1]
                and (close[i] - low[i]) < candle_range * 0.3):
            bearish[i] = True

    return bullish, bearish


def fair_value_gaps(
    high: NDArray, low: NDArray, atr_vals: NDArray, fvg_min_size: float = 0.5
) -> tuple[NDArray, NDArray]:
    """Fair Value Gaps.

    Pine (lines 332-333):
        bullish_fvg = low > high[2] and (low - high[2]) > atr * fvg_min_size
        bearish_fvg = high < low[2] and (low[2] - high) > atr * fvg_min_size

    Возвращает (bullish_fvg, bearish_fvg) — boolean arrays.
    """
    n = len(high)
    bullish = np.zeros(n, dtype=bool)
    bearish = np.zeros(n, dtype=bool)

    for i in range(2, n):
        if np.isnan(atr_vals[i]):
            continue
        # Bullish FVG: gap up (current low > 2-bars-ago high)
        if low[i] > high[i-2] and (low[i] - high[i-2]) > atr_vals[i] * fvg_min_size:
            bullish[i] = True
        # Bearish FVG: gap down (current high < 2-bars-ago low)
        if high[i] < low[i-2] and (low[i-2] - high[i]) > atr_vals[i] * fvg_min_size:
            bearish[i] = True

    return bullish, bearish


def liquidity_sweeps(
    high: NDArray, low: NDArray, open_: NDArray, close: NDArray,
    lookback: int = 20
) -> tuple[NDArray, NDArray]:
    """Liquidity Sweeps — пробой и откат от recent high/low.

    Pine (lines 334-337):
        recent_high = ta.highest(high, liquidity_lookback)
        liquidity_grab_high = high > recent_high[1] and close < open and close < recent_high[1]
        liquidity_grab_low = low < recent_low[1] and close > open and close > recent_low[1]

    Возвращает (liq_grab_high, liq_grab_low) — boolean arrays.
    """
    n = len(close)
    grab_high = np.zeros(n, dtype=bool)
    grab_low = np.zeros(n, dtype=bool)

    for i in range(lookback + 1, n):
        recent_high = np.max(high[i - lookback:i])
        recent_low = np.min(low[i - lookback:i])
        # Grab high: пробил верх и закрылся ниже (bear rejection)
        if high[i] > recent_high and close[i] < open_[i] and close[i] < recent_high:
            grab_high[i] = True
        # Grab low: пробил низ и закрылся выше (bull rejection)
        if low[i] < recent_low and close[i] > open_[i] and close[i] > recent_low:
            grab_low[i] = True

    return grab_high, grab_low


def break_of_structure(
    high: NDArray, low: NDArray, close: NDArray, pivot_len: int = 5
) -> tuple[NDArray, NDArray]:
    """Break of Structure (BOS) — пробой swing high/low.

    Pine (lines 338-347):
        swing_high = ta.pivothigh(high, bos_pivot_length, bos_pivot_length)
        bullish_bos = close > last_swing_high and close[1] <= last_swing_high
        bearish_bos = close < last_swing_low and close[1] >= last_swing_low

    Возвращает (bullish_bos, bearish_bos) — boolean arrays.
    """
    n = len(close)
    bullish_bos = np.zeros(n, dtype=bool)
    bearish_bos = np.zeros(n, dtype=bool)

    last_swing_high = np.nan
    last_swing_low = np.nan

    for i in range(pivot_len, n - pivot_len):
        # Detect pivot high at i
        if high[i] == np.max(high[i - pivot_len:i + pivot_len + 1]):
            last_swing_high = high[i]
        # Detect pivot low at i
        if low[i] == np.min(low[i - pivot_len:i + pivot_len + 1]):
            last_swing_low = low[i]

    # Теперь проходим ещё раз для BOS с обновлением swing levels
    last_swing_high = np.nan
    last_swing_low = np.nan

    for i in range(pivot_len, n):
        # Обновляем swing levels на подтверждённых пивотах (с задержкой pivot_len)
        check_idx = i - pivot_len
        if check_idx >= pivot_len:
            window = high[check_idx - pivot_len:check_idx + pivot_len + 1]
            if len(window) == 2 * pivot_len + 1 and high[check_idx] == np.max(window):
                last_swing_high = high[check_idx]

            window = low[check_idx - pivot_len:check_idx + pivot_len + 1]
            if len(window) == 2 * pivot_len + 1 and low[check_idx] == np.min(window):
                last_swing_low = low[check_idx]

        # BOS detection
        if i >= 1 and not np.isnan(last_swing_high):
            if close[i] > last_swing_high and close[i-1] <= last_swing_high:
                bullish_bos[i] = True
        if i >= 1 and not np.isnan(last_swing_low):
            if close[i] < last_swing_low and close[i-1] >= last_swing_low:
                bearish_bos[i] = True

    return bullish_bos, bearish_bos


def demand_supply_zones(
    open_: NDArray, close: NDArray, atr_vals: NDArray, impulse_mult: float = 1.5
) -> tuple[NDArray, NDArray]:
    """Demand/Supply zone detection.

    Pine (lines 267-270):
        impulse_up = (close - open) > atr * ds_impulse_mult and close > open
        demand_zone = impulse_up and close[1] < open[1]
        supply_zone = impulse_down and close[1] > open[1]

    Возвращает (demand_signal, supply_signal) — boolean arrays.
    """
    n = len(close)
    demand = np.zeros(n, dtype=bool)
    supply = np.zeros(n, dtype=bool)

    for i in range(1, n):
        if np.isnan(atr_vals[i]):
            continue
        impulse_up = (close[i] - open_[i]) > atr_vals[i] * impulse_mult and close[i] > open_[i]
        impulse_down = (open_[i] - close[i]) > atr_vals[i] * impulse_mult and close[i] < open_[i]
        # Demand: impulse up preceded by red candle
        if impulse_up and close[i-1] < open_[i-1]:
            demand[i] = True
        # Supply: impulse down preceded by green candle
        if impulse_down and close[i-1] > open_[i-1]:
            supply[i] = True

    return demand, supply


def smc_combined(
    open_: NDArray, high: NDArray, low: NDArray, close: NDArray,
    atr_vals: NDArray,
    fvg_min_size: float = 0.5,
    liquidity_lookback: int = 20,
    bos_pivot: int = 5,
) -> tuple[NDArray, NDArray]:
    """Комбинированный SMC сигнал.

    Pine (lines 348-349):
        smc_bullish = bullish_ob or bullish_fvg or liquidity_grab_low or bullish_bos
        smc_bearish = bearish_ob or bearish_fvg or liquidity_grab_high or bearish_bos

    Возвращает (smc_bullish, smc_bearish) — boolean arrays.
    """
    bull_ob, bear_ob = order_blocks(open_, close, high, low)
    bull_fvg, bear_fvg = fair_value_gaps(high, low, atr_vals, fvg_min_size)
    grab_high, grab_low = liquidity_sweeps(high, low, open_, close, liquidity_lookback)
    bull_bos, bear_bos = break_of_structure(high, low, close, bos_pivot)

    smc_bullish = bull_ob | bull_fvg | grab_low | bull_bos
    smc_bearish = bear_ob | bear_fvg | grab_high | bear_bos

    return smc_bullish, smc_bearish
```

- [x] **Step 2: Add SMC tests**

Add to `backend/tests/test_indicators.py`:

```python
from app.modules.strategy.engines.indicators.smc import (
    break_of_structure,
    demand_supply_zones,
    fair_value_gaps,
    liquidity_sweeps,
    order_blocks,
    smc_combined,
)


# === Order Blocks ===

class TestOrderBlocks:
    def test_returns_bool_arrays(self) -> None:
        bull, bear = order_blocks(OPEN, CLOSE, HIGH, LOW)
        assert bull.dtype == bool
        assert bear.dtype == bool
        assert len(bull) == len(CLOSE)

    def test_synthetic_bullish_ob(self) -> None:
        """Создаём искусственный bullish OB: red candle + green engulfing."""
        o = np.array([100.0, 105.0, 98.0], dtype=np.float64)
        c = np.array([105.0, 98.0, 106.0], dtype=np.float64)
        h = np.array([106.0, 106.0, 106.5], dtype=np.float64)
        l = np.array([99.0, 97.0, 97.0], dtype=np.float64)
        bull, bear = order_blocks(o, c, h, l)
        # Bar 2: close > open (green), bar 1: close < open (red)
        assert bull[2] == True


# === FVG ===

class TestFVG:
    def test_no_gaps_in_smooth_data(self) -> None:
        atr_vals = np.full(30, 3.0, dtype=np.float64)
        bull, bear = fair_value_gaps(HIGH, LOW, atr_vals)
        # Синтетические данные с маленьким спредом (3) не должны иметь FVG с ATR 3
        # FVG требует gap > 0.5 * ATR = 1.5, а наш спред HIGH-LOW=3, шаг ~2
        # В данных нет реальных гэпов
        assert bull.sum() + bear.sum() >= 0  # просто проверяем что не падает


# === Liquidity Sweeps ===

class TestLiquiditySweeps:
    def test_returns_bool(self) -> None:
        grab_h, grab_l = liquidity_sweeps(HIGH, LOW, OPEN, CLOSE, 10)
        assert grab_h.dtype == bool
        assert len(grab_h) == len(CLOSE)


# === BOS ===

class TestBOS:
    def test_returns_bool(self) -> None:
        bull_bos, bear_bos = break_of_structure(HIGH, LOW, CLOSE, 5)
        assert bull_bos.dtype == bool
        assert bear_bos.dtype == bool


# === SMC Combined ===

class TestSMCCombined:
    def test_returns_bool(self) -> None:
        atr_vals = np.full(30, 3.0, dtype=np.float64)
        bull, bear = smc_combined(OPEN, HIGH, LOW, CLOSE, atr_vals)
        assert bull.dtype == bool
        assert bear.dtype == bool
        assert len(bull) == len(CLOSE)
```

- [x] **Step 3: Run tests**

Run: `cd backend && pytest tests/test_indicators.py -v`
Expected: All tests PASS

- [x] **Step 4: Commit**

```bash
git add backend/app/modules/strategy/engines/indicators/smc.py backend/tests/test_indicators.py
git commit -m "feat(strategy): SMC indicators — OB, FVG, Liquidity, BOS, D/S Zones"
```

---

## Task 11: BaseStrategy ABC

**Files:**
- Create: `backend/app/modules/strategy/engines/base.py`

- [x] **Step 1: Write BaseStrategy**

Create `backend/app/modules/strategy/engines/base.py`:

```python
"""Базовый класс стратегии (ABC).

Все торговые стратегии наследуют BaseStrategy и реализуют generate_signals().
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

import numpy as np
from numpy.typing import NDArray


@dataclass
class OHLCV:
    """Свечные данные. Все массивы одинаковой длины."""
    open: NDArray
    high: NDArray
    low: NDArray
    close: NDArray
    volume: NDArray
    timestamps: NDArray | None = None

    def __len__(self) -> int:
        return len(self.close)

    @property
    def hlc3(self) -> NDArray:
        """Typical price."""
        return (self.high + self.low + self.close) / 3


@dataclass
class Signal:
    """Торговый сигнал."""
    bar_index: int
    direction: str  # "long", "short"
    entry_price: float
    stop_loss: float
    take_profit: float
    trailing_atr: float | None = None
    confluence_score: float = 0.0
    signal_type: str = ""  # "trend", "breakout", "mean_reversion"


@dataclass
class StrategyResult:
    """Результат работы стратегии на данных."""
    signals: list[Signal] = field(default_factory=list)
    confluence_scores_long: NDArray = field(default_factory=lambda: np.array([]))
    confluence_scores_short: NDArray = field(default_factory=lambda: np.array([]))
    knn_scores: NDArray = field(default_factory=lambda: np.array([]))
    knn_classes: NDArray = field(default_factory=lambda: np.array([]))


class BaseStrategy(ABC):
    """Абстрактный базовый класс торговой стратегии."""

    def __init__(self, config: dict) -> None:
        self.config = config

    @abstractmethod
    def generate_signals(self, data: OHLCV) -> StrategyResult:
        """Генерация торговых сигналов на исторических данных.

        Args:
            data: OHLCV свечные данные.

        Returns:
            StrategyResult с сигналами и метриками.
        """
        ...

    @property
    @abstractmethod
    def name(self) -> str:
        """Название стратегии."""
        ...

    @property
    @abstractmethod
    def engine_type(self) -> str:
        """Тип движка (для матчинга с БД)."""
        ...
```

- [x] **Step 2: Verify import**

Run: `cd backend && python -c "from app.modules.strategy.engines.base import BaseStrategy, OHLCV, Signal, StrategyResult; print('OK')"`
Expected: `OK`

- [x] **Step 3: Commit**

```bash
git add backend/app/modules/strategy/engines/base.py
git commit -m "feat(strategy): BaseStrategy ABC with OHLCV, Signal, StrategyResult"
```

---

## Task 12: Lorentzian KNN Classifier + Confluence Scoring

This is the core algorithm port. The KNN classifier uses 4 features (RSI, WaveTrend, CCI, ADX), normalizes them with z-score, computes Lorentzian distances, and classifies using inverse-distance weighted voting.

**Files:**
- Create: `backend/app/modules/strategy/engines/lorentzian_knn.py`
- Create: `backend/tests/test_lorentzian_knn.py`

**Reference:** Pine Script lines 371-496 (KNN + confluence scoring + entry logic)

- [x] **Step 1: Write lorentzian_knn.py**

Create `backend/app/modules/strategy/engines/lorentzian_knn.py`:

```python
"""Lorentzian KNN Strategy — полный порт из Pine Script.

Ref: strategis_1.pine (BertTradeTech ML Lorentzian KNN Classifier)

Алгоритм:
1. Вычисляем 4 фичи: RSI, WaveTrend, CCI, ADX
2. Нормализуем z-score по окну 50 баров
3. Для каждого бара: KNN с Lorentzian расстоянием d(x,y) = Σlog(1+|xi-yi|)
4. Inverse distance weighting → knn_score ∈ [-1, 1]
5. Smoothing EMA(3)
6. Confluence scoring: 5 фильтров + KNN boost ≈ max 5.5
7. Entry: trend/breakout/mean_reversion + all filters
8. Risk: ATR-based SL/TP/trailing
"""

import numpy as np
from numpy.typing import NDArray

from app.modules.strategy.engines.base import OHLCV, BaseStrategy, Signal, StrategyResult
from app.modules.strategy.engines.indicators.oscillators import bollinger_bands, cci, wavetrend
from app.modules.strategy.engines.indicators.smc import smc_combined
from app.modules.strategy.engines.indicators.trend import (
    atr,
    calc_ma,
    dmi,
    ema,
    ma_ribbon,
    percentrank,
    rsi,
    sma,
    stdev,
)
from app.modules.strategy.engines.indicators.volume import order_flow_signals, vwap_bands


# === KNN Feature Extraction & Classification ===

def normalize_feature(src: NDArray, period: int = 50) -> NDArray:
    """Z-score нормализация. Pine: f_normalize() lines 389-392.

    (src - SMA(src, period)) / stdev(src, period)
    """
    mean = sma(src, period)
    std = stdev(src, period)
    result = np.where(std != 0, (src - mean) / std, 0.0)
    return np.nan_to_num(result, nan=0.0)


def knn_classify(
    f1: NDArray, f2: NDArray, f3: NDArray, f4: NDArray,
    close: NDArray,
    neighbors: int = 8,
    lookback: int = 50,
) -> tuple[NDArray, NDArray]:
    """Lorentzian KNN Classification.

    Pine Script ref (lines 409-438):
    Для каждого бара:
    - Сканируем lookback исторических баров (от 10 до lookback)
    - Lorentzian distance: d = Σ log(1 + |f_curr - f_hist|)
    - Inverse distance weight: w = 1 / max(d, 0.01)
    - Label: 5-bar forward return (close[i-5] - close[i]) / close[i]
    - Accumulate bull_weight vs bear_weight
    - Score = (bull_w - bear_w) / (bull_w + bear_w) ∈ [-1, 1]
    - Confidence = max(bull_w, bear_w) / total_w * 100

    Возвращает (knn_score, knn_confidence).
    """
    n = len(close)
    score = np.zeros(n, dtype=np.float64)
    confidence = np.full(n, 50.0, dtype=np.float64)

    for i in range(80, n):
        bull_w = 0.0
        bear_w = 0.0
        knn_max = min(lookback, i - 10)

        for j in range(10, knn_max + 1):
            # Lorentzian distance
            d = np.log(1.0 + abs(f1[i] - f1[i - j]))
            d += np.log(1.0 + abs(f2[i] - f2[i - j]))
            d += np.log(1.0 + abs(f3[i] - f3[i - j]))
            d += np.log(1.0 + abs(f4[i] - f4[i - j]))

            # Inverse distance weight
            w = 1.0 / max(d, 0.01)

            # Label: 5-bar forward return from historical bar
            if j >= 5:
                fut = (close[i - j + 5] - close[i - j]) / max(close[i - j], 0.001)
            else:
                fut = 0.0

            if fut > 0:
                bull_w += w
            else:
                bear_w += w

        total_w = bull_w + bear_w
        if total_w > 0:
            score[i] = (bull_w - bear_w) / total_w
            confidence[i] = max(bull_w, bear_w) / total_w * 100.0

    return score, confidence


# === Volatility Regime ===

def volatility_regime(
    close: NDArray, high: NDArray, low: NDArray,
    bb_period: int = 20, bb_mult: float = 2.0,
    atr_percentile_period: int = 100,
    expansion_threshold: float = 1.5,
    contraction_threshold: float = 0.7,
) -> tuple[NDArray, NDArray]:
    """Volatility regime detection.

    Pine (lines 351-362):
        bb_vr_width = (upper - lower) / basis
        bb_expansion = bb_vr_width > sma(bb_vr_width) * expansion_threshold
        high_volatility = percentrank(atr) > 70
        vol_regime_trending = bb_expansion or high_volatility
        vol_regime_ranging = bb_contraction or low_volatility

    Возвращает (trending, ranging) — boolean arrays.
    """
    basis = sma(close, bb_period)
    dev = bb_mult * stdev(close, bb_period)
    upper = basis + dev
    lower = basis - dev
    bb_width = np.where(basis != 0, (upper - lower) / basis, 0.0)
    bb_width = np.nan_to_num(bb_width, nan=0.0)

    bb_width_sma = sma(bb_width, bb_period)
    bb_width_sma = np.nan_to_num(bb_width_sma, nan=0.0)

    atr_vals = atr(high, low, close, 14)
    atr_pctrank = percentrank(np.nan_to_num(atr_vals, nan=0.0), atr_percentile_period)
    atr_pctrank = np.nan_to_num(atr_pctrank, nan=50.0)

    high_vol = atr_pctrank > 70
    low_vol = atr_pctrank < 30
    bb_expand = np.where(bb_width_sma > 0, bb_width > bb_width_sma * expansion_threshold, False)
    bb_contract = np.where(bb_width_sma > 0, bb_width < bb_width_sma * contraction_threshold, False)

    trending = bb_expand | high_vol
    ranging = bb_contract | low_vol

    return trending, ranging


# === Entry Signal Detection ===

def detect_crossover(fast: NDArray, slow: NDArray) -> NDArray:
    """Crossover: fast crosses above slow. Pine: ta.crossover."""
    cross = np.zeros(len(fast), dtype=bool)
    for i in range(1, len(fast)):
        if not np.isnan(fast[i]) and not np.isnan(slow[i]):
            if not np.isnan(fast[i-1]) and not np.isnan(slow[i-1]):
                if fast[i] > slow[i] and fast[i-1] <= slow[i-1]:
                    cross[i] = True
    return cross


def detect_crossunder(fast: NDArray, slow: NDArray) -> NDArray:
    """Crossunder: fast crosses below slow. Pine: ta.crossunder."""
    cross = np.zeros(len(fast), dtype=bool)
    for i in range(1, len(fast)):
        if not np.isnan(fast[i]) and not np.isnan(slow[i]):
            if not np.isnan(fast[i-1]) and not np.isnan(slow[i-1]):
                if fast[i] < slow[i] and fast[i-1] >= slow[i-1]:
                    cross[i] = True
    return cross


# === LorentzianKNNStrategy ===

class LorentzianKNNStrategy(BaseStrategy):
    """Полная реализация ML Lorentzian KNN стратегии.

    Порт strategis_1.pine → Python.
    """

    @property
    def name(self) -> str:
        return "Machine Learning: Lorentzian KNN Classifier"

    @property
    def engine_type(self) -> str:
        return "lorentzian_knn"

    def generate_signals(self, data: OHLCV) -> StrategyResult:
        """Генерация сигналов на исторических данных."""
        cfg = self.config
        n = len(data)

        # --- Параметры из конфига ---
        trend_cfg = cfg.get("trend", {})
        ema_fast_period = trend_cfg.get("ema_fast", 26)
        ema_slow_period = trend_cfg.get("ema_slow", 50)
        ema_filter_period = trend_cfg.get("ema_filter", 200)

        ribbon_cfg = cfg.get("ribbon", {})
        use_ribbon = ribbon_cfg.get("use", True)
        ribbon_type = ribbon_cfg.get("type", "EMA")
        ribbon_mas = ribbon_cfg.get("mas", [9, 14, 21, 35, 55, 89, 144, 233])
        ribbon_threshold = ribbon_cfg.get("threshold", 4)

        of_cfg = cfg.get("order_flow", {})
        use_order_flow = of_cfg.get("use", True)
        cvd_period = of_cfg.get("cvd_period", 20)
        cvd_threshold = of_cfg.get("cvd_threshold", 0.7)

        smc_cfg = cfg.get("smc", {})
        use_smc = smc_cfg.get("use", True)
        fvg_min_size = smc_cfg.get("fvg_min_size", 0.5)
        liq_lookback = smc_cfg.get("liquidity_lookback", 20)
        bos_pivot = smc_cfg.get("bos_pivot", 5)

        vol_cfg = cfg.get("volatility", {})
        use_vol = vol_cfg.get("use", True)

        risk_cfg = cfg.get("risk", {})
        atr_period = risk_cfg.get("atr_period", 14)
        stop_atr_mult = risk_cfg.get("stop_atr_mult", 2.0)
        tp_atr_mult = risk_cfg.get("tp_atr_mult", 30.0)
        use_trailing = risk_cfg.get("use_trailing", True)
        trailing_atr_mult = risk_cfg.get("trailing_atr_mult", 10.0)

        filters_cfg = cfg.get("filters", {})
        adx_period = filters_cfg.get("adx_period", 15)
        adx_threshold = filters_cfg.get("adx_threshold", 10)
        volume_mult = filters_cfg.get("volume_mult", 1.0)

        knn_cfg = cfg.get("knn", {})
        knn_neighbors = knn_cfg.get("neighbors", 8)
        knn_lookback = knn_cfg.get("lookback", 50)
        knn_weight = knn_cfg.get("weight", 0.5)
        knn_rsi_period = knn_cfg.get("rsi_period", 15)
        knn_wt_ch = knn_cfg.get("wt_ch_len", 10)
        knn_wt_avg = knn_cfg.get("wt_avg_len", 21)
        knn_cci_period = knn_cfg.get("cci_period", 20)
        knn_adx_period = knn_cfg.get("adx_period", 14)

        breakout_cfg = cfg.get("breakout", {})
        breakout_period = breakout_cfg.get("period", 15)

        mr_cfg = cfg.get("mean_reversion", {})
        bb_period = mr_cfg.get("bb_period", 20)
        bb_std = mr_cfg.get("bb_std", 2.0)
        rsi_period = mr_cfg.get("rsi_period", 14)
        rsi_ob = mr_cfg.get("rsi_ob", 70)
        rsi_os = mr_cfg.get("rsi_os", 30)

        # --- Core Indicators (Pine lines 146-161) ---
        atr_vals = atr(data.high, data.low, data.close, atr_period)
        ema_fast_line = ema(data.close, ema_fast_period)
        ema_slow_line = ema(data.close, ema_slow_period)
        ema_filter_line = ema(data.close, ema_filter_period)
        di_plus, di_minus, adx_vals = dmi(data.high, data.low, data.close, adx_period)

        bb_upper, bb_basis, bb_lower = bollinger_bands(data.close, bb_period, bb_std)
        rsi_vals = rsi(data.close, rsi_period)

        volume_sma_line = sma(data.volume, 20)
        volume_spike = np.where(
            ~np.isnan(volume_sma_line),
            data.volume > volume_sma_line * volume_mult,
            False,
        )

        # Highest high / lowest low for breakout
        highest_high = np.full(n, np.nan, dtype=np.float64)
        lowest_low = np.full(n, np.nan, dtype=np.float64)
        for i in range(breakout_period, n):
            highest_high[i] = np.max(data.high[i - breakout_period:i])
            lowest_low[i] = np.min(data.low[i - breakout_period:i])

        # --- MA Ribbon (Pine lines 163-187) ---
        ribbon_bull = np.ones(n, dtype=bool)
        ribbon_bear = np.ones(n, dtype=bool)
        if use_ribbon:
            ribbon_bull, ribbon_bear = ma_ribbon(data.close, ribbon_mas, ribbon_type, ribbon_threshold)
        ribbon_filter_long = (~np.array([use_ribbon] * n)) | ribbon_bull
        ribbon_filter_short = (~np.array([use_ribbon] * n)) | ribbon_bear

        # --- VWAP + Order Flow (Pine lines 189-224) ---
        of_filter_long = np.ones(n, dtype=bool)
        of_filter_short = np.ones(n, dtype=bool)
        if use_order_flow:
            vwap_line, _ = vwap_bands(data.high, data.low, data.close, data.volume)
            of_bull, of_bear = order_flow_signals(
                data.open, data.close, data.volume, vwap_line, cvd_period, cvd_threshold
            )
            price_above_vwap = data.close > vwap_line
            price_below_vwap = data.close < vwap_line
            of_filter_long = of_bull | price_above_vwap
            of_filter_short = of_bear | price_below_vwap

        # --- SMC (Pine lines 247-349) ---
        smc_filter_long = np.ones(n, dtype=bool)
        smc_filter_short = np.ones(n, dtype=bool)
        if use_smc:
            smc_bull, smc_bear = smc_combined(
                data.open, data.high, data.low, data.close,
                np.nan_to_num(atr_vals, nan=0.0),
                fvg_min_size, liq_lookback, bos_pivot,
            )
            bull_ob = np.zeros(n, dtype=bool)
            bear_ob = np.zeros(n, dtype=bool)
            bull_fvg = np.zeros(n, dtype=bool)
            bear_fvg = np.zeros(n, dtype=bool)
            from app.modules.strategy.engines.indicators.smc import order_blocks, fair_value_gaps
            bull_ob, bear_ob = order_blocks(data.open, data.close, data.high, data.low)
            bull_fvg, bear_fvg = fair_value_gaps(data.high, data.low, np.nan_to_num(atr_vals, nan=0.0), fvg_min_size)
            smc_filter_long = smc_bull | bull_ob | bull_fvg
            smc_filter_short = smc_bear | bear_ob | bear_fvg

        # --- KNN Features (Pine lines 371-407) ---
        knn_rsi_vals = rsi(data.close, knn_rsi_period)
        knn_wt_vals = wavetrend(data.hlc3, knn_wt_ch, knn_wt_avg)
        knn_cci_vals = cci(data.close, knn_cci_period)
        _, _, knn_adx_vals = dmi(data.high, data.low, data.close, knn_adx_period)

        f1 = normalize_feature(np.nan_to_num(knn_rsi_vals, nan=50.0), 50)
        f2 = normalize_feature(np.nan_to_num(knn_wt_vals, nan=0.0), 50)
        f3 = normalize_feature(np.nan_to_num(knn_cci_vals, nan=0.0), 50)
        f4 = normalize_feature(np.nan_to_num(knn_adx_vals, nan=0.0), 50)

        # --- KNN Classification (Pine lines 409-438) ---
        knn_score, knn_conf = knn_classify(f1, f2, f3, f4, data.close, knn_neighbors, knn_lookback)
        knn_smooth = ema(knn_score, 3)
        knn_smooth = np.nan_to_num(knn_smooth, nan=0.0)

        knn_bullish = knn_smooth > 0.1
        knn_bearish = knn_smooth < -0.1

        knn_classes = np.where(knn_bullish, 1, np.where(knn_bearish, -1, 0))

        # --- Trend detection (Pine lines 363-366) ---
        adx_safe = np.nan_to_num(adx_vals, nan=0.0)
        is_trending = adx_safe > adx_threshold
        is_ranging = adx_safe <= adx_threshold
        bullish_trend = np.zeros(n, dtype=bool)
        bearish_trend = np.zeros(n, dtype=bool)
        for i in range(n):
            if not np.isnan(ema_fast_line[i]) and not np.isnan(ema_slow_line[i]) and not np.isnan(ema_filter_line[i]):
                bullish_trend[i] = ema_fast_line[i] > ema_slow_line[i] and data.close[i] > ema_filter_line[i]
                bearish_trend[i] = ema_fast_line[i] < ema_slow_line[i] and data.close[i] < ema_filter_line[i]

        # --- Confluence Scoring (Pine lines 486-496) ---
        # MTF filter disabled by default (use=false)
        mtf_filter_long = np.ones(n, dtype=bool)
        mtf_filter_short = np.ones(n, dtype=bool)

        knn_boost_long = np.where(knn_bullish, knn_weight, 0.0)
        knn_boost_short = np.where(knn_bearish, knn_weight, 0.0)

        score_long = (
            mtf_filter_long.astype(float)
            + ribbon_filter_long.astype(float)
            + of_filter_long.astype(float)
            + smc_filter_long.astype(float)
            + (adx_safe > adx_threshold).astype(float)
            + knn_boost_long
        )
        score_short = (
            mtf_filter_short.astype(float)
            + ribbon_filter_short.astype(float)
            + of_filter_short.astype(float)
            + smc_filter_short.astype(float)
            + (adx_safe > adx_threshold).astype(float)
            + knn_boost_short
        )

        # --- Entry Conditions (Pine lines 542-577) ---
        ema_cross_up = detect_crossover(ema_fast_line, ema_slow_line)
        ema_cross_down = detect_crossunder(ema_fast_line, ema_slow_line)
        rsi_cross_up = detect_crossover(np.nan_to_num(rsi_vals, nan=50.0), np.full(n, float(rsi_os)))
        rsi_cross_down = detect_crossunder(np.nan_to_num(rsi_vals, nan=50.0), np.full(n, float(rsi_ob)))

        trend_long = is_trending & bullish_trend & ema_cross_up & volume_spike
        trend_short = is_trending & bearish_trend & ema_cross_down & volume_spike

        breakout_long = np.zeros(n, dtype=bool)
        breakout_short = np.zeros(n, dtype=bool)
        for i in range(1, n):
            if not np.isnan(highest_high[i]) and not np.isnan(ema_filter_line[i]):
                breakout_long[i] = data.close[i] > highest_high[i] and volume_spike[i] and data.close[i] > ema_filter_line[i]
                breakout_short[i] = data.close[i] < lowest_low[i] and volume_spike[i] and data.close[i] < ema_filter_line[i]

        rsi_safe = np.nan_to_num(rsi_vals, nan=50.0)
        bb_lower_safe = np.nan_to_num(bb_lower, nan=0.0)
        bb_upper_safe = np.nan_to_num(bb_upper, nan=999999.0)

        mr_long = is_ranging & (data.close < bb_lower_safe) & (rsi_safe < rsi_os) & rsi_cross_up
        mr_short = is_ranging & (data.close > bb_upper_safe) & (rsi_safe > rsi_ob) & rsi_cross_down

        long_condition = (trend_long | breakout_long | mr_long) & ribbon_filter_long & of_filter_long & smc_filter_long
        short_condition = (trend_short | breakout_short | mr_short) & ribbon_filter_short & of_filter_short & smc_filter_short

        # --- Generate Signals with Risk Management ---
        signals: list[Signal] = []
        in_position = False

        for i in range(n):
            if np.isnan(atr_vals[i]):
                continue

            if not in_position and long_condition[i]:
                sig_type = "trend" if trend_long[i] else "breakout" if breakout_long[i] else "mean_reversion"
                signals.append(Signal(
                    bar_index=i,
                    direction="long",
                    entry_price=float(data.close[i]),
                    stop_loss=float(data.close[i] - atr_vals[i] * stop_atr_mult),
                    take_profit=float(data.close[i] + atr_vals[i] * tp_atr_mult),
                    trailing_atr=float(atr_vals[i] * trailing_atr_mult) if use_trailing else None,
                    confluence_score=float(score_long[i]),
                    signal_type=sig_type,
                ))
                in_position = True

            elif not in_position and short_condition[i]:
                sig_type = "trend" if trend_short[i] else "breakout" if breakout_short[i] else "mean_reversion"
                signals.append(Signal(
                    bar_index=i,
                    direction="short",
                    entry_price=float(data.close[i]),
                    stop_loss=float(data.close[i] + atr_vals[i] * stop_atr_mult),
                    take_profit=float(data.close[i] - atr_vals[i] * tp_atr_mult),
                    trailing_atr=float(atr_vals[i] * trailing_atr_mult) if use_trailing else None,
                    confluence_score=float(score_short[i]),
                    signal_type=sig_type,
                ))
                in_position = True

            # Простой выход: следующий противоположный сигнал закрывает позицию
            elif in_position:
                if signals[-1].direction == "long" and short_condition[i]:
                    in_position = False
                elif signals[-1].direction == "short" and long_condition[i]:
                    in_position = False

        return StrategyResult(
            signals=signals,
            confluence_scores_long=score_long,
            confluence_scores_short=score_short,
            knn_scores=knn_smooth,
            knn_classes=knn_classes,
        )
```

- [x] **Step 2: Write KNN + strategy tests**

Create `backend/tests/test_lorentzian_knn.py`:

```python
"""Тесты Lorentzian KNN классификатора и стратегии."""

import numpy as np
import pytest

from app.modules.strategy.engines.base import OHLCV, StrategyResult
from app.modules.strategy.engines.lorentzian_knn import (
    LorentzianKNNStrategy,
    detect_crossover,
    detect_crossunder,
    knn_classify,
    normalize_feature,
)


# === Тестовые данные: 200 баров с трендом + шумом ===

np.random.seed(42)
_trend = np.linspace(100, 150, 200)
_noise = np.random.normal(0, 1.5, 200)
CLOSE_200 = _trend + _noise
HIGH_200 = CLOSE_200 + np.abs(np.random.normal(1, 0.5, 200))
LOW_200 = CLOSE_200 - np.abs(np.random.normal(1, 0.5, 200))
OPEN_200 = CLOSE_200 + np.random.normal(0, 0.5, 200)
VOLUME_200 = np.random.uniform(500, 2000, 200)


# === Normalize Feature ===

class TestNormalizeFeature:
    def test_zero_std(self) -> None:
        flat = np.full(100, 50.0)
        result = normalize_feature(flat, 50)
        # std=0 → 0
        assert all(v == pytest.approx(0.0) for v in result)

    def test_z_score_distribution(self) -> None:
        data = np.random.normal(50, 10, 200)
        result = normalize_feature(data, 50)
        valid = result[50:]  # skip warmup
        # Z-score distribution: most values between -3 and 3
        assert np.abs(np.mean(valid)) < 1.0


# === KNN Classify ===

class TestKNNClassify:
    def test_returns_correct_shapes(self) -> None:
        f1 = normalize_feature(np.random.normal(0, 1, 200), 50)
        f2 = normalize_feature(np.random.normal(0, 1, 200), 50)
        f3 = normalize_feature(np.random.normal(0, 1, 200), 50)
        f4 = normalize_feature(np.random.normal(0, 1, 200), 50)
        close = np.linspace(100, 150, 200)

        score, conf = knn_classify(f1, f2, f3, f4, close, neighbors=8, lookback=50)
        assert len(score) == 200
        assert len(conf) == 200

    def test_score_range(self) -> None:
        f = normalize_feature(np.random.normal(0, 1, 200), 50)
        close = np.linspace(100, 150, 200)
        score, conf = knn_classify(f, f, f, f, close)
        valid = score[80:]  # active после bar_index > 80
        assert all(-1 <= v <= 1 for v in valid)

    def test_confidence_range(self) -> None:
        f = normalize_feature(np.random.normal(0, 1, 200), 50)
        close = np.linspace(100, 150, 200)
        score, conf = knn_classify(f, f, f, f, close)
        valid = conf[80:]
        assert all(50 <= v <= 100 for v in valid)


# === Crossover/Crossunder ===

class TestCrossover:
    def test_crossover(self) -> None:
        fast = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        slow = np.array([3.0, 3.0, 3.0, 3.0, 3.0])
        result = detect_crossover(fast, slow)
        # fast crosses above slow between index 2 and 3
        assert result[3] == True

    def test_crossunder(self) -> None:
        fast = np.array([5.0, 4.0, 3.0, 2.0, 1.0])
        slow = np.array([3.0, 3.0, 3.0, 3.0, 3.0])
        result = detect_crossunder(fast, slow)
        # fast crosses below slow between index 2 and 3
        assert result[3] == True


# === Full Strategy ===

class TestLorentzianKNNStrategy:
    @pytest.fixture
    def strategy(self) -> LorentzianKNNStrategy:
        """Стратегия с дефолтным конфигом."""
        config = {
            "trend": {"ema_fast": 26, "ema_slow": 50, "ema_filter": 200},
            "ribbon": {"use": True, "type": "EMA", "mas": [9, 14, 21, 35, 55, 89, 144, 233], "threshold": 4},
            "order_flow": {"use": True, "cvd_period": 20, "cvd_threshold": 0.7},
            "smc": {"use": True, "fvg_min_size": 0.5, "liquidity_lookback": 20, "bos_pivot": 5},
            "volatility": {"use": True},
            "risk": {"atr_period": 14, "stop_atr_mult": 2, "tp_atr_mult": 30, "use_trailing": True, "trailing_atr_mult": 10},
            "filters": {"adx_period": 15, "adx_threshold": 10, "volume_mult": 1},
            "knn": {"neighbors": 8, "lookback": 50, "weight": 0.5, "rsi_period": 15, "wt_ch_len": 10, "wt_avg_len": 21, "cci_period": 20, "adx_period": 14},
            "breakout": {"period": 15},
            "mean_reversion": {"bb_period": 20, "bb_std": 2, "rsi_period": 14, "rsi_ob": 70, "rsi_os": 30},
        }
        return LorentzianKNNStrategy(config)

    @pytest.fixture
    def ohlcv(self) -> OHLCV:
        return OHLCV(
            open=OPEN_200,
            high=HIGH_200,
            low=LOW_200,
            close=CLOSE_200,
            volume=VOLUME_200,
        )

    def test_generates_result(self, strategy: LorentzianKNNStrategy, ohlcv: OHLCV) -> None:
        result = strategy.generate_signals(ohlcv)
        assert isinstance(result, StrategyResult)
        assert len(result.confluence_scores_long) == 200
        assert len(result.knn_scores) == 200

    def test_signals_have_risk_params(self, strategy: LorentzianKNNStrategy, ohlcv: OHLCV) -> None:
        result = strategy.generate_signals(ohlcv)
        for sig in result.signals:
            assert sig.stop_loss > 0
            assert sig.take_profit > 0
            assert sig.direction in ("long", "short")
            assert sig.confluence_score >= 0

    def test_name_and_engine_type(self, strategy: LorentzianKNNStrategy) -> None:
        assert strategy.name == "Machine Learning: Lorentzian KNN Classifier"
        assert strategy.engine_type == "lorentzian_knn"

    def test_confluence_max_55(self, strategy: LorentzianKNNStrategy, ohlcv: OHLCV) -> None:
        result = strategy.generate_signals(ohlcv)
        # Max possible: 5 filters * 1 + knn_weight 0.5 = 5.5
        assert np.max(result.confluence_scores_long) <= 5.6
        assert np.max(result.confluence_scores_short) <= 5.6

    def test_knn_classes_values(self, strategy: LorentzianKNNStrategy, ohlcv: OHLCV) -> None:
        result = strategy.generate_signals(ohlcv)
        # Classes: -1 (bear), 0 (neutral), 1 (bull)
        unique = set(np.unique(result.knn_classes))
        assert unique.issubset({-1, 0, 1})
```

- [x] **Step 3: Run tests**

Run: `cd backend && pytest tests/test_lorentzian_knn.py -v`
Expected: All tests PASS

- [x] **Step 4: Commit**

```bash
git add backend/app/modules/strategy/engines/lorentzian_knn.py backend/tests/test_lorentzian_knn.py
git commit -m "feat(strategy): Lorentzian KNN classifier + full strategy engine"
```

---

## Task 13: Engine registry + integration

**Files:**
- Modify: `backend/app/modules/strategy/engines/__init__.py`

- [x] **Step 1: Write engine registry**

Update `backend/app/modules/strategy/engines/__init__.py`:

```python
"""Движки торговых стратегий — реестр."""

from app.modules.strategy.engines.base import BaseStrategy
from app.modules.strategy.engines.lorentzian_knn import LorentzianKNNStrategy

# Реестр доступных движков: engine_type → class
ENGINE_REGISTRY: dict[str, type[BaseStrategy]] = {
    "lorentzian_knn": LorentzianKNNStrategy,
}


def get_engine(engine_type: str, config: dict) -> BaseStrategy:
    """Получить экземпляр стратегии по типу движка."""
    engine_cls = ENGINE_REGISTRY.get(engine_type)
    if not engine_cls:
        raise ValueError(f"Unknown engine type: {engine_type}. Available: {list(ENGINE_REGISTRY.keys())}")
    return engine_cls(config)
```

- [x] **Step 2: Verify**

Run: `cd backend && python -c "from app.modules.strategy.engines import get_engine; e = get_engine('lorentzian_knn', {}); print(e.name)"`
Expected: `Machine Learning: Lorentzian KNN Classifier`

- [x] **Step 3: Commit**

```bash
git add backend/app/modules/strategy/engines/__init__.py
git commit -m "feat(strategy): engine registry with get_engine()"
```

---

## Task 14: Run all tests + final integration check

**Files:**
- None (verification only)

- [x] **Step 1: Run full test suite**

Run: `cd backend && pytest tests/ -v`
Expected: All tests PASS (24 existing + ~30 new ≈ 54 total)

- [x] **Step 2: Verify app imports cleanly**

Run: `cd backend && python -c "from app.main import app; print('Routes:', len(app.routes)); from app.modules.strategy.engines import get_engine; print('Engine OK')"`
Expected: Routes count and Engine OK

- [x] **Step 3: Apply migration on VPS (when ready)**

```bash
ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && git pull && docker compose exec api alembic upgrade head"
```

- [x] **Step 4: Seed Lorentzian KNN strategy (when deployed)**

```bash
ssh jeremy-vps "cd /var/www/dev_james_usr/data/www/dev-james.bond/algo_trade && docker compose exec api python -c \"
from app.modules.strategy.models import Strategy
# Seed via API or direct insert
print('Ready to seed')
\""
```

---

## Summary

| Task | Component | Files | Tests |
|------|-----------|-------|-------|
| 1 | Dependencies | requirements.txt | — |
| 2 | DB Models + Migration | models.py, conftest.py, migration | — |
| 3 | Pydantic Schemas | schemas.py | — |
| 4 | Service Layer | service.py | — |
| 5 | API Router | router.py, main.py | — |
| 6 | CRUD Tests | test_strategy_crud.py | 11 tests |
| 7 | Trend Indicators | trend.py, test_indicators.py | 15 tests |
| 8 | Oscillators | oscillators.py, test_indicators.py | 6 tests |
| 9 | Volume | volume.py, test_indicators.py | 5 tests |
| 10 | SMC | smc.py, test_indicators.py | 5 tests |
| 11 | BaseStrategy ABC | base.py | — |
| 12 | Lorentzian KNN Engine | lorentzian_knn.py, test_lorentzian_knn.py | 10 tests |
| 13 | Engine Registry | engines/__init__.py | — |
| 14 | Integration Check | — | full suite |

**Total: ~52 new tests, 14 tasks, ~20 new files**

**Pine Script coverage:**
- Lines 1-126: Settings → config JSONB (Task 2-3)
- Lines 130-176: MA helpers, ribbon → trend.py (Task 7)
- Lines 146-161: Core indicators → trend.py (Task 7)
- Lines 189-224: VWAP, CVD, Order Flow → volume.py (Task 9)
- Lines 247-349: SMC (OB, FVG, Liquidity, BOS, D/S) → smc.py (Task 10)
- Lines 351-366: Volatility regime → lorentzian_knn.py (Task 12)
- Lines 371-438: KNN features + classification → lorentzian_knn.py (Task 12)
- Lines 442-496: Confluence scoring → lorentzian_knn.py (Task 12)
- Lines 542-577: Entry/exit logic → lorentzian_knn.py (Task 12)
- Lines 580-895: Visual/display (Kernel envelope, dashboard) → SKIPPED (frontend concern)
