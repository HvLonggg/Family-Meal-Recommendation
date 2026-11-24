import asyncio
import json
from collections.abc import Generator

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError
from sqlalchemy.exc import TimeoutError as PoolTimeoutError
from sqlalchemy.orm import Session, sessionmaker
from starlette.types import Receive, Scope, Send

from app.core.config import Settings, get_settings
from app.core.middleware import ConcurrencyLimitMiddleware
from app.db.session import engine_options, get_db_session
from app.main import create_app
from app.modules.recipes.models import Recipe
from app.modules.recipes.router import CATALOG_CACHE


def create_recipe(session: Session, *, slug: str, name: str) -> None:
    session.add(
        Recipe(
            slug=slug,
            name=name,
            excerpt="Món thử.",
            region="Bắc",
            category="Món mặn",
            difficulty="Dễ",
            prep_minutes=10,
            cook_minutes=10,
            base_servings=2,
            image_path=f"/assets/recipes/{slug}.jpg",
            image_alt=name,
            serving="Dùng nóng.",
            tip="",
            source_name="Bếp Việt",
            source_url=f"https://example.com/{slug}",
            status="published",
        )
    )
    session.commit()


def _app_with_failing_route(exc: Exception) -> TestClient:
    app = create_app()

    @app.get("/api/v1/_test/fail")
    def fail() -> None:
        raise exc

    return TestClient(app, raise_server_exceptions=False)


async def _call(app: ConcurrencyLimitMiddleware, path: str) -> tuple[int, dict[str, str], bytes]:
    messages: list[dict[str, object]] = []

    async def receive() -> dict[str, object]:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: dict[str, object]) -> None:
        messages.append(message)

    scope = {"type": "http", "method": "GET", "path": path, "headers": []}
    await app(scope, receive, send)  # type: ignore[arg-type]
    start = messages[0]
    headers = {k.decode(): v.decode() for k, v in start["headers"]}  # type: ignore[union-attr]
    body = b"".join(m.get("body", b"") for m in messages[1:])  # type: ignore[misc]
    return int(start["status"]), headers, body  # type: ignore[call-overload]


def test_concurrency_limiter_returns_503_overloaded_when_saturated() -> None:
    async def scenario() -> None:
        gate = asyncio.Event()

        async def slow_app(scope: Scope, receive: Receive, send: Send) -> None:
            await gate.wait()
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b"ok"})

        limiter = ConcurrencyLimitMiddleware(
            slow_app, limit=1, wait_seconds=0.05, retry_after_seconds=20
        )
        first = asyncio.create_task(_call(limiter, "/api/v1/recipes"))
        await asyncio.sleep(0)

        status, headers, body = await _call(limiter, "/api/v1/recipes")
        assert status == 503
        assert headers["retry-after"] == "20"
        payload = json.loads(body)
        assert payload["code"] == "OVERLOADED"
        assert set(payload) == {"code", "message", "field_errors", "trace_id"}

        # Kiểm tra trạng thái không bị chặn kể cả khi đầy (giao diện còn biết hệ thống sống).
        gate.set()
        assert (await first)[0] == 200
        assert (await _call(limiter, "/api/v1/recipes"))[0] == 200

    asyncio.run(scenario())


def test_concurrency_limiter_exempts_health_and_waits_briefly() -> None:
    async def scenario() -> None:
        gate = asyncio.Event()

        async def app(scope: Scope, receive: Receive, send: Send) -> None:
            if scope["path"] == "/api/v1/slow":
                await gate.wait()
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b"ok"})

        limiter = ConcurrencyLimitMiddleware(app, limit=1, wait_seconds=1, retry_after_seconds=5)
        slow = asyncio.create_task(_call(limiter, "/api/v1/slow"))
        await asyncio.sleep(0)
        for path in ("/api/v1/status", "/api/v1/livez", "/api/v1/readyz"):
            assert (await _call(limiter, path))[0] == 200

        # Slot được trả trong lúc chờ: request vẫn được phục vụ, không bị 503.
        waiting = asyncio.create_task(_call(limiter, "/api/v1/recipes"))
        await asyncio.sleep(0.05)
        gate.set()
        assert (await slow)[0] == 200
        assert (await waiting)[0] == 200

    asyncio.run(scenario())


def test_concurrency_limiter_disabled_with_zero() -> None:
    limiter = ConcurrencyLimitMiddleware(lambda *_: None, limit=0)  # type: ignore[arg-type]
    assert limiter._semaphore is None


@pytest.mark.parametrize(
    "exc",
    [
        PoolTimeoutError("QueuePool limit of size 5 overflow 5 reached"),
        OperationalError("SELECT 1", {}, Exception("connection refused")),
    ],
)
def test_database_unavailable_maps_to_503_overloaded(exc: Exception) -> None:
    with _app_with_failing_route(exc) as client:
        response = client.get("/api/v1/_test/fail")

    assert response.status_code == 503
    assert response.json()["code"] == "OVERLOADED"
    assert int(response.headers["Retry-After"]) >= 1
    assert response.json()["trace_id"] == response.headers["X-Request-ID"]


def test_rate_limited_responses_carry_retry_after() -> None:
    with _app_with_failing_route(HTTPException(status_code=429, detail="Chậm lại")) as client:
        response = client.get("/api/v1/_test/fail")

    assert response.status_code == 429
    assert int(response.headers["Retry-After"]) > 0


def test_engine_options_use_pool_settings_for_postgres() -> None:
    settings = Settings(
        database_url="postgresql+psycopg://u:p@h/db",
        db_pool_size=3,
        db_max_overflow=2,
        db_pool_timeout_seconds=4,
    )
    options = engine_options(settings)
    assert options["pool_pre_ping"] is True
    assert (options["pool_size"], options["max_overflow"], options["pool_timeout"]) == (3, 2, 4)
    assert options["connect_args"]["connect_timeout"] == settings.db_connect_timeout_seconds
    assert engine_options(Settings(database_url="sqlite+pysqlite://")) == {"pool_pre_ping": True}


@pytest.fixture
def catalog_client(
    database_session_factory: sessionmaker[Session],
) -> Generator[TestClient, None, None]:
    CATALOG_CACHE.clear()
    app = create_app()

    def override() -> Generator[Session, None, None]:
        with database_session_factory() as session:
            yield session

    app.dependency_overrides[get_db_session] = override
    with TestClient(app) as client:
        yield client
    CATALOG_CACHE.clear()


def test_catalog_is_cached_with_etag_and_gzip(
    catalog_client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    with database_session_factory() as session:
        create_recipe(session, slug="pho-bo", name="Phở bò")

    first = catalog_client.get("/api/v1/recipes/catalog?limit=100")
    assert first.status_code == 200
    assert first.json()["total"] == 1
    assert first.headers["Content-Encoding"] == "gzip"
    etag = first.headers["ETag"]

    # Trình duyệt có phiên (cookie) vẫn được lưu để hỏi lại bằng ETag, không phải no-store.
    revalidated = catalog_client.get(
        "/api/v1/recipes/catalog?limit=100",
        headers={"If-None-Match": etag, "Cookie": "x=1"},
    )
    assert revalidated.status_code == 304
    assert revalidated.headers["Cache-Control"] == "private, no-cache"

    with database_session_factory() as session:
        create_recipe(session, slug="bun-cha", name="Bún chả")
    changed = catalog_client.get(
        "/api/v1/recipes/catalog?limit=100", headers={"If-None-Match": etag}
    )
    assert changed.status_code == 200
    assert changed.json()["total"] == 2
    assert changed.headers["ETag"] != etag


def test_catalog_without_gzip_returns_plain_json(catalog_client: TestClient) -> None:
    response = catalog_client.get(
        "/api/v1/recipes/catalog?limit=1", headers={"Accept-Encoding": "identity"}
    )
    assert response.status_code == 200
    assert "Content-Encoding" not in response.headers
    assert json.loads(response.content)["data"] == []


@pytest.fixture(autouse=True)
def _reset_settings() -> Generator[None, None, None]:
    yield
    get_settings.cache_clear()
