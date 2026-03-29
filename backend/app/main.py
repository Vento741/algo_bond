"""Точка входа FastAPI приложения AlgoBond."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.core.rate_limit import limiter
from app.modules.auth.router import router as auth_router
from app.modules.billing.router import router as billing_router
from app.modules.market.router import router as market_router
from app.modules.strategy.router import router as strategy_router
from app.modules.backtest.router import router as backtest_router
from app.modules.trading.router import router as trading_router
from app.modules.market.ws_router import router as ws_router
from app.modules.market.ws_info_router import router as ws_info_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Инициализация и завершение приложения."""
    # Startup
    from app.modules.trading.ws_bridge import start_ws_bridge
    start_ws_bridge()
    yield
    # Shutdown
    from app.modules.trading.ws_bridge import stop_ws_bridge
    await stop_ws_bridge()
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

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Роутеры модулей
app.include_router(auth_router)
app.include_router(billing_router)
app.include_router(strategy_router)
app.include_router(market_router)
app.include_router(trading_router)
app.include_router(backtest_router)
app.include_router(ws_router)
app.include_router(ws_info_router)


@app.get("/health")
async def health_check():
    """Проверка работоспособности API."""
    return {
        "status": "ok",
        "app": settings.app_name,
        "version": "0.1.0",
    }
