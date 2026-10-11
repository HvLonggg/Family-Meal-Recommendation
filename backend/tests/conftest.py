from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings
from app.db import models as database_models  # noqa: F401
from app.db.base import Base
from app.db.session import get_db_session
from app.main import create_app


@pytest.fixture(autouse=True)
def isolated_auth_test_settings(monkeypatch: pytest.MonkeyPatch) -> Generator[None, None, None]:
    monkeypatch.setenv("BEP_VIET_APP_ENV", "test")
    monkeypatch.setenv("BEP_VIET_EMAIL_PROVIDER", "smtp")
    for key in (
        "BEP_VIET_EMAIL_SMTP_HOST",
        "BEP_VIET_EMAIL_SMTP_USERNAME",
        "BEP_VIET_EMAIL_SMTP_PASSWORD",
        "BEP_VIET_EMAIL_FROM_ADDRESS",
        "BEP_VIET_EMAIL_GMAIL_CLIENT_ID",
        "BEP_VIET_EMAIL_GMAIL_CLIENT_SECRET",
        "BEP_VIET_EMAIL_GMAIL_REFRESH_TOKEN",
    ):
        monkeypatch.setenv(key, "")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def database_session_factory() -> Generator[sessionmaker[Session], None, None]:
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    yield session_factory
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def client(database_session_factory: sessionmaker[Session]) -> Generator[TestClient, None, None]:
    app = create_app()

    def override_database_session() -> Generator[Session, None, None]:
        with database_session_factory() as session:
            yield session

    app.dependency_overrides[get_db_session] = override_database_session
    with TestClient(app) as test_client:
        yield test_client
