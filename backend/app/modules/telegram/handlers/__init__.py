"""Регистрация Telegram-handler роутеров."""

from aiogram import Dispatcher, Router

from app.modules.telegram.middleware import AdminMiddleware, AuthMiddleware


def register_handlers(dp: Dispatcher) -> None:
    """Зарегистрировать все handler-роутеры."""
    from app.modules.telegram.handlers.start import router as start_router
    from app.modules.telegram.handlers.help import router as help_router
    from app.modules.telegram.handlers.status import router as status_router
    from app.modules.telegram.handlers.admin import router as admin_router
    from app.modules.telegram.handlers.callbacks import router as callbacks_router
    from app.modules.telegram.handlers.sentinel import router as sentinel_router

    # user_router с AuthMiddleware (status, callbacks)
    user_router = Router(name="user")
    user_router.message.middleware(AuthMiddleware())
    user_router.callback_query.middleware(AuthMiddleware())
    user_router.include_routers(status_router, callbacks_router)

    # admin с Auth + Admin middleware (admin, sentinel)
    admin_secured = Router(name="admin_secured")
    admin_secured.message.middleware(AuthMiddleware())
    admin_secured.message.middleware(AdminMiddleware())
    admin_secured.callback_query.middleware(AuthMiddleware())
    admin_secured.callback_query.middleware(AdminMiddleware())
    admin_secured.include_routers(admin_router, sentinel_router)

    # start и help без AuthMiddleware (работают до привязки)
    dp.include_routers(start_router, help_router, user_router, admin_secured)
