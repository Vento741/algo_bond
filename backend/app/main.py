"""Точка входа FastAPI приложения AlgoBond."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.modules.auth.router import router as auth_router
from app.modules.billing.router import router as billing_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Инициализация и завершение приложения."""
    # Startup
    yield
    # Shutdown
    from app.redis import pool
    await pool.disconnect()


app = FastAPI(
    title=settings.app_name,
    description="Платформа алгоритмической торговли криптовалютными фьючерсами",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Роутеры модулей
app.include_router(auth_router)
app.include_router(billing_router)


@app.get("/health")
async def health_check():
    """Проверка работоспособности API."""
    return {
        "status": "ok",
        "app": settings.app_name,
        "version": "0.1.0",
    }
