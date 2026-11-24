from collections.abc import Generator
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings, get_settings


def engine_options(settings: Settings) -> dict[str, Any]:
    """Tham số engine theo cấu hình; SQLite (test/local) giữ mặc định của SQLAlchemy."""
    options: dict[str, Any] = {"pool_pre_ping": True}
    if settings.database_url.startswith("sqlite"):
        return options
    options.update(
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_timeout=settings.db_pool_timeout_seconds,
        pool_recycle=settings.db_pool_recycle_seconds,
    )
    if settings.database_url.startswith("postgresql"):
        # Neon đang ngủ cần vài giây để thức dậy; quá hạn thì báo lỗi thay vì treo mãi.
        options["connect_args"] = {"connect_timeout": settings.db_connect_timeout_seconds}
    return options


settings = get_settings()
engine = create_engine(settings.database_url, **engine_options(settings))
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db_session() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session
