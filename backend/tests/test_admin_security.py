"""Kiểm thử hồi quy bảo mật cho khu vực quản trị."""

import logging
import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.core.rate_limit import SlidingWindowLimiter
from app.modules.admin import router as admin_router
from tests.helpers import create_admin, register_and_login
from tests.test_favorites import seed_recipe

MEAL_EMAIL = {
    "recipient_emails": ["lan@example.com"],
    "meal_type": "dinner",
    "recipe_slugs": ["bun-cha-ha-noi"],
    "subject": "Gợi ý bữa tối từ Bếp Việt",
    "intro_message": "Bếp Việt chọn món này cho bữa tối hôm nay.",
}


def test_every_admin_route_rejects_non_admins(client: TestClient) -> None:
    member = register_and_login(client, "lan@example.com")
    paths = client.get("/openapi.json").json()["paths"]
    admin_paths = {path: ops for path, ops in paths.items() if "/admin" in path}
    assert len(admin_paths) > 20
    checked = 0
    for path, operations in admin_paths.items():
        url = re.sub(r"\{[^}]+\}", "00000000-0000-0000-0000-000000000000", path)
        for method in operations:
            if method not in {"get", "post", "put", "patch", "delete"}:
                continue
            response = client.request(method.upper(), url, headers=member, json={})
            assert response.status_code == 403, f"{method.upper()} {path} -> {response.status_code}"
            anonymous = client.request(method.upper(), url, json={})
            assert anonymous.status_code == 401, f"{method.upper()} {path} (anonymous)"
            checked += 1
    assert checked > 30


def test_user_update_rejects_unknown_fields(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    admin = create_admin(client, database_session_factory, "admin@example.com")
    register_and_login(client, "lan@example.com")
    member_id = client.get("/api/v1/admin/users?q=lan", headers=admin).json()["data"][0]["id"]
    for payload in ({"is_admin": True}, {"auth_version": 0}, {"email": "x@example.com"}):
        response = client.patch(f"/api/v1/admin/users/{member_id}", headers=admin, json=payload)
        assert response.status_code == 422, payload
    assert (
        client.get("/api/v1/admin/users?q=lan", headers=admin).json()["data"][0]["role"] == "user"
    )


def test_admin_can_demote_another_admin_and_change_is_audited(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    caplog: pytest.LogCaptureFixture,
) -> None:
    admin = create_admin(client, database_session_factory, "admin@example.com")
    create_admin(client, database_session_factory, "second@example.com")
    second_id = client.get("/api/v1/admin/users?q=second", headers=admin).json()["data"][0]["id"]
    with caplog.at_level(logging.INFO, logger="bep_viet.admin"):
        response = client.patch(
            f"/api/v1/admin/users/{second_id}", headers=admin, json={"role": "user"}
        )
    assert response.status_code == 200, response.text
    assert response.json()["role"] == "user"
    audit = [
        record.getMessage() for record in caplog.records if "admin_audit" in record.getMessage()
    ]
    assert any("action=user.access_change" in line and "role_to=user" in line for line in audit)


def test_last_active_admin_cannot_be_demoted(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin = create_admin(client, database_session_factory, "admin@example.com")
    create_admin(client, database_session_factory, "second@example.com")
    second_id = client.get("/api/v1/admin/users?q=second", headers=admin).json()["data"][0]["id"]
    # Mô phỏng trạng thái không còn quản trị viên hoạt động nào khác (ví dụ dữ liệu bị sửa tay).
    monkeypatch.setattr(admin_router, "_count", lambda _session, _statement: 0)
    response = client.patch(
        f"/api/v1/admin/users/{second_id}", headers=admin, json={"status": "locked"}
    )
    assert response.status_code == 409


def test_meal_suggestion_sends_are_rate_limited_per_admin(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed_recipe(database_session_factory)
    admin = create_admin(client, database_session_factory, "admin@example.com")
    register_and_login(client, "lan@example.com")
    monkeypatch.setattr("app.modules.auth.email.send_meal_suggestion_email", lambda **_: None)
    monkeypatch.setattr(
        admin_router,
        "MEAL_SUGGESTION_SENDS_PER_ADMIN",
        SlidingWindowLimiter(limit=1, window_seconds=3600),
    )
    first = client.post("/api/v1/admin/meal-suggestions/send", headers=admin, json=MEAL_EMAIL)
    assert first.status_code == 200, first.text
    second = client.post("/api/v1/admin/meal-suggestions/send", headers=admin, json=MEAL_EMAIL)
    assert second.status_code == 429
    assert second.json()["code"] == "ADMIN_EMAIL_RATE_LIMITED"


def test_support_replies_are_rate_limited_per_admin(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    member = register_and_login(client, "minh@example.com")
    created = client.post(
        "/api/v1/support/tickets",
        headers=member,
        json={
            "name": "Lê Minh",
            "email": "minh@example.com",
            "topic": "general",
            "subject": "Xin tư vấn món ăn",
            "message": "Tôi muốn hỏi cách chọn món cho bữa cơm gia đình bốn người.",
        },
    )
    assert created.status_code == 201
    admin = create_admin(client, database_session_factory, "admin@example.com")
    ticket_id = client.get("/api/v1/admin/support", headers=admin).json()["data"][0]["id"]
    monkeypatch.setattr(admin_router, "send_support_reply_email", lambda **_: None)
    monkeypatch.setattr(
        admin_router,
        "SUPPORT_REPLIES_PER_ADMIN",
        SlidingWindowLimiter(limit=1, window_seconds=3600),
    )
    reply = {"subject": "Bếp Việt xin phản hồi", "message": "Cảm ơn bạn, Bếp Việt sẽ tư vấn món."}
    url = f"/api/v1/admin/support/{ticket_id}/reply"
    assert client.post(url, headers=admin, json=reply).status_code == 200
    assert client.post(url, headers=admin, json=reply).status_code == 429


def test_corrupted_recipe_image_is_rejected_not_crashing(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed_recipe(database_session_factory)
    admin = create_admin(client, database_session_factory, "admin@example.com")
    # Chữ ký PNG hợp lệ nhưng thân tệp rác: phải trả lỗi 4xx thay vì 500.
    fake_png = "data:image/png;base64,iVBORw0KGgoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    response = client.put(
        "/api/v1/admin/recipes/bun-cha-ha-noi/image", headers=admin, json={"image": fake_png}
    )
    assert 400 <= response.status_code < 500, response.text


def test_insights_expose_period_metrics_with_previous_period(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed_recipe(database_session_factory)
    admin = create_admin(client, database_session_factory, "admin@example.com")
    register_and_login(client, "lan@example.com")
    response = client.get("/api/v1/admin/insights?days=7", headers=admin)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["period_days"] == 7
    metrics = {metric["key"]: metric for metric in body["metrics"]}
    assert set(metrics) == {
        "signups",
        "active_users",
        "plans_created",
        "recipes_cooked",
        "favorites",
    }
    assert all(len(metric["series"]) == 7 for metric in metrics.values())
    assert metrics["signups"]["total"] == 2
    assert metrics["signups"]["previous_total"] == 0
    # Cả hai tài khoản vừa đăng nhập nên đều được tính là đang hoạt động.
    assert metrics["active_users"]["total"] == 2
    assert client.get("/api/v1/admin/insights?days=120", headers=admin).status_code == 422
    overview = client.get("/api/v1/admin/overview", headers=admin).json()["counts"]
    assert overview["locked_logins"] == 0
    assert overview["tickets_unviewed"] == 0
