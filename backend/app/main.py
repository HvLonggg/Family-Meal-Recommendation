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
from app.modules.auth.email import run_security_email_worker
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
    try:
        yield
    finally:
        if email_worker is not None:
            email_worker.cancel()
            with suppress(asyncio.CancelledError):
                await email_worker
        if meal_plan_worker is not None:
            meal_plan_worker.cancel()
            with suppress(asyncio.CancelledError):
                await meal_plan_worker


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description="API for Vietnamese recipes and family meal planning.",
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
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
    application.add_middleware(RequestContextMiddleware)
    register_exception_handlers(application)
    application.include_router(api_router, prefix=settings.api_v1_prefix)

    return application


app = create_app()
