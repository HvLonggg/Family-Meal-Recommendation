import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import RequestContextMiddleware
from app.modules.assistant.service import warm_up as warm_up_assistant
from app.modules.auth.email import run_security_email_worker
from app.modules.cooking.service import run_cook_timer_worker
from app.modules.cooking.webpush import push_enabled
from app.modules.planner.email_reminders import run_meal_plan_reminder_worker


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.log_level)
    email_worker = (
        asyncio.create_task(run_security_email_worker())
        if settings.email_enabled and settings.app_env != "test"
        else None
    )
    meal_plan_worker = (
        asyncio.create_task(run_meal_plan_reminder_worker())
        if settings.email_enabled and settings.app_env != "test"
        else None
    )
    # Chuông hẹn giờ khi vào bếp: chỉ chạy khi đã cấu hình khóa VAPID.
    cook_timer_worker = (
        asyncio.create_task(run_cook_timer_worker())
        if push_enabled() and settings.app_env != "test"
        else None
    )
    if settings.app_env != "test":
        # Nạp sẵn dữ liệu cho Chú Rồng rồi đồng bộ kho tri thức RAG ở nền; lỗi không chặn khởi động.
        with suppress(Exception):
            warm_up_assistant()
    try:
        yield
    finally:
        if email_worker is not None:
            email_worker.cancel()
            with suppress(asyncio.CancelledError):
                await email_worker
        for worker in (meal_plan_worker, cook_timer_worker):
            if worker is not None:
                worker.cancel()
                with suppress(asyncio.CancelledError):
                    await worker


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description="API for Vietnamese recipes and family meal planning.",
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
        # Ẩn cả lược đồ API khi tắt tài liệu, không để lộ danh sách endpoint.
        openapi_url="/openapi.json" if settings.docs_enabled else None,
        lifespan=lifespan,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin).rstrip("/") for origin in settings.cors_origins],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )
    application.add_middleware(RequestContextMiddleware, hsts=settings.secure_cookies)
    register_exception_handlers(application)
    application.include_router(api_router, prefix=settings.api_v1_prefix)

    return application


app = create_app()
