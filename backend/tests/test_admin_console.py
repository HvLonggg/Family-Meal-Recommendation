from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from tests.helpers import create_admin, login, register_and_login
from tests.test_favorites import seed_recipe

SUBMISSION = {
    "name": "Canh cua rau đay",
    "region": "Bắc",
    "category": "Món canh",
    "servings": 4,
    "total_minutes": 40,
    "story": "Món canh mát lành của mẹ mỗi trưa hè.",
    "ingredients": "300 g cua đồng\n1 bó rau đay\n",
    "steps": "Giã cua, lọc lấy nước.\nĐun nhỏ lửa cho riêu nổi.\nCho rau vào và nêm.",
}


def test_admin_endpoints_require_admin_role(client: TestClient) -> None:
    headers = register_and_login(client, "lan@example.com")
    assert client.get("/api/v1/admin/overview", headers=headers).status_code == 403
    assert client.get("/api/v1/admin/overview").status_code == 401


def test_admin_manages_users_and_forces_relogin(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    admin = create_admin(client, database_session_factory, "admin@example.com")
    member = register_and_login(client, "lan@example.com")

    listed = client.get("/api/v1/admin/users?q=lan", headers=admin).json()
    assert listed["total"] == 1
    member_id = listed["data"][0]["id"]

    admin_id = client.get("/api/v1/auth/me", headers=admin).json()["id"]
    self_lock = client.patch(
        f"/api/v1/admin/users/{admin_id}", headers=admin, json={"status": "locked"}
    )
    assert self_lock.status_code == 409

    locked = client.patch(
        f"/api/v1/admin/users/{member_id}", headers=admin, json={"status": "locked"}
    )
    assert locked.json()["status"] == "locked"
    assert client.get("/api/v1/auth/me", headers=member).status_code in {401, 403}
    assert (
        client.post(
            "/api/v1/auth/login", json={"email": "lan@example.com", "password": "Test-Only-No-Login-2026!"}
        ).status_code
        == 403
    )

    client.patch(
        f"/api/v1/admin/users/{member_id}",
        headers=admin,
        json={"status": "active", "role": "admin"},
    )
    promoted = login(client, "lan@example.com")
    assert client.get("/api/v1/admin/overview", headers=promoted).status_code == 200


def test_admin_sees_each_users_plans_and_edits_recipes(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed_recipe(database_session_factory)
    admin = create_admin(client, database_session_factory, "admin@example.com")
    member = register_and_login(client, "lan@example.com")
    planned = client.post(
        "/api/v1/planner/items",
        headers=member,
        json={
            "recipe_slug": "bun-cha-ha-noi",
            "plan_date": date.today().isoformat(),
            "meal_type": "lunch",
            "servings": 3,
        },
    )
    assert planned.status_code == 201, planned.text

    planners = client.get("/api/v1/admin/plans", headers=admin).json()
    assert planners["total"] == 1
    assert planners["data"][0]["total_items"] == 1
    user_id = planners["data"][0]["user_id"]
    plans = client.get(f"/api/v1/admin/users/{user_id}/plans", headers=admin).json()
    assert plans["data"][0]["recipe_name"] == "Bún chả Hà Nội"

    recipes = client.get("/api/v1/admin/recipes?q=bun", headers=admin).json()
    recipe = recipes["data"][0]
    hidden = client.patch(
        "/api/v1/admin/recipes/bun-cha-ha-noi",
        headers=admin,
        json={
            **{
                key: recipe[key]
                for key in (
                    "name",
                    "excerpt",
                    "region",
                    "category",
                    "difficulty",
                    "prep_minutes",
                    "cook_minutes",
                    "base_servings",
                    "tip",
                    "serving",
                )
            },
            "status": "hidden",
        },
    )
    assert hidden.status_code == 200, hidden.text
    assert client.get("/api/v1/recipes/bun-cha-ha-noi").status_code == 404

    overview = client.get("/api/v1/admin/overview", headers=admin).json()
    assert overview["counts"]["recipes_hidden"] == 1
    assert overview["counts"]["planners"] == 1


def test_recipe_submission_lifecycle(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    member = register_and_login(client, "lan@example.com")
    draft = client.post(
        "/api/v1/submissions", headers=member, json={**SUBMISSION, "submit": False}
    ).json()
    assert draft["status"] == "draft"
    assert draft["ingredients"] == "300 g cua đồng\n1 bó rau đay"

    admin = create_admin(client, database_session_factory, "admin@example.com")
    assert client.get("/api/v1/admin/submissions", headers=admin).json()["total"] == 0

    submitted = client.put(
        f"/api/v1/submissions/{draft['id']}", headers=member, json=SUBMISSION
    ).json()
    assert submitted["status"] == "pending"

    reviewed = client.patch(
        f"/api/v1/admin/submissions/{draft['id']}",
        headers=admin,
        json={"status": "approved", "admin_note": "Cảm ơn bạn!"},
    )
    assert reviewed.json()["submitter"]["full_name"] == "Nguyễn Ngọc Lan"

    locked = client.put(f"/api/v1/submissions/{draft['id']}", headers=member, json=SUBMISSION)
    assert locked.status_code == 409
    mine = client.get("/api/v1/submissions/mine", headers=member).json()
    assert mine["data"][0]["admin_note"] == "Cảm ơn bạn!"


def test_support_ticket_flow_with_spam_protection(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    payload = {
        "name": "Lê Minh",
        "email": "Minh@Example.com",
        "topic": "bug",
        "subject": "Không lưu được kế hoạch",
        "message": "Tôi bấm lưu bữa ăn nhưng trang báo lỗi, nhờ đội ngũ kiểm tra giúp.",
    }
    sent = client.post("/api/v1/support/tickets", json=payload)
    assert sent.status_code == 201, sent.text
    assert sent.json()["reference"].startswith("BV-")

    bot = client.post("/api/v1/support/tickets", json={**payload, "website": "spam.example"})
    assert bot.status_code == 201

    admin = create_admin(client, database_session_factory, "admin@example.com")
    tickets = client.get("/api/v1/admin/support", headers=admin).json()
    assert tickets["total"] == 1
    assert tickets["data"][0]["email"] == "minh@example.com"

    resolved = client.patch(
        f"/api/v1/admin/support/{tickets['data'][0]['id']}",
        headers=admin,
        json={"status": "resolved", "admin_note": "Đã khắc phục"},
    )
    assert resolved.json()["status"] == "resolved"

    for _ in range(4):
        client.post("/api/v1/support/tickets", json=payload)
    limited = client.post("/api/v1/support/tickets", json=payload)
    assert limited.status_code == 429


def test_admin_support_read_and_email_reply_statuses(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent = client.post(
        "/api/v1/support/tickets",
        json={
            "name": "Lê Minh",
            "email": "minh@example.com",
            "topic": "general",
            "subject": "Xin tư vấn món ăn",
            "message": "Tôi muốn hỏi cách chọn món cho bữa cơm gia đình bốn người.",
        },
    )
    assert sent.status_code == 201
    admin = create_admin(client, database_session_factory, "admin@example.com")
    ticket = client.get("/api/v1/admin/support", headers=admin).json()["data"][0]
    assert ticket["viewed_at"] is None
    assert ticket["reply_status"] == "not_sent"

    viewed = client.post(f"/api/v1/admin/support/{ticket['id']}/viewed", headers=admin)
    assert viewed.status_code == 200, viewed.text
    assert viewed.json()["viewed_at"] is not None

    sent_message: dict[str, str] = {}
    monkeypatch.setattr(
        "app.modules.admin.router.send_support_reply_email",
        lambda **kwargs: sent_message.update(kwargs),
    )
    reply = client.post(
        f"/api/v1/admin/support/{ticket['id']}/reply",
        headers=admin,
        json={
            "subject": "Bếp Việt xin phản hồi",
            "message": (
                "Cảm ơn bạn đã gửi câu hỏi. Bếp Việt sẽ tư vấn món phù hợp với gia đình bạn."
            ),
        },
    )
    assert reply.status_code == 200, reply.text
    assert sent_message["recipient"] == "minh@example.com"
    assert reply.json()["reply_status"] == "sent"
    assert reply.json()["reply_sent_at"] is not None
    assert reply.json()["reply_attempts"] == 1
    assert reply.json()["status"] == "in_progress"

    recipients = client.get("/api/v1/admin/support/recipients", headers=admin)
    assert recipients.status_code == 200
    assert recipients.json()["data"][0]["email"] == "minh@example.com"


def test_admin_sends_and_tracks_personalized_meal_suggestions(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed_recipe(database_session_factory)
    admin = create_admin(client, database_session_factory, "admin@example.com")
    register_and_login(client, "lan@example.com")
    deliveries: list[dict[str, object]] = []

    def send_meal(**kwargs: object) -> None:
        deliveries.append(kwargs)
        if kwargs["recipient"] == "fail@example.com":
            raise RuntimeError("SMTP not available")

    monkeypatch.setattr("app.modules.auth.email.send_meal_suggestion_email", send_meal)
    response = client.post(
        "/api/v1/admin/meal-suggestions/send",
        headers=admin,
        json={
            "recipient_emails": ["lan@example.com", "fail@example.com"],
            "meal_type": "dinner",
            "recipe_slugs": ["bun-cha-ha-noi"],
            "subject": "Gợi ý bữa tối từ Bếp Việt",
            "intro_message": "Bếp Việt chọn món này cho bữa tối hôm nay.",
            "closing_message": "Chúc bạn dùng bữa ngon miệng!",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    # Phản hồi trả ngay với email đã xếp hàng; việc gửi chạy ở nền.
    assert body["queued"] == 2
    assert {row["status"] for row in body["data"]} == {"sending"}
    assert len(deliveries) == 2
    assert all(call["recipes"][0]["image_path"] == "/images/bun-cha.jpg" for call in deliveries)

    history = client.get("/api/v1/admin/meal-suggestions/history", headers=admin)
    assert history.status_code == 200
    assert history.json()["total"] == 2
    assert {row["status"] for row in history.json()["data"]} == {"sent", "failed"}
    failed = next(row for row in history.json()["data"] if row["status"] == "failed")
    assert failed["error_message"].startswith("Email chưa gửi được:")

    recipients = client.get(
        "/api/v1/admin/meal-suggestions/recipients", headers=admin, params={"limit": 5}
    ).json()
    assert recipients["total"] == 1
    assert recipients["data"][0]["email"] == "lan@example.com"
    assert recipients["data"][0]["sent_count"] == 1
    delivered_to_member = next(
        row for row in history.json()["data"] if row["recipient_email"] == "lan@example.com"
    )
    assert delivered_to_member["recipient_name"] == "Nguyễn Ngọc Lan"


def test_meal_suggestion_names_new_recipients_and_keeps_account_names(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed_recipe(database_session_factory)
    admin = create_admin(client, database_session_factory, "admin@example.com")
    register_and_login(client, "lan@example.com")
    ticket = client.post(
        "/api/v1/support/tickets",
        json={
            "name": "Lê Minh",
            "email": "minh@example.com",
            "topic": "bug",
            "subject": "Hỏi về thực đơn",
            "message": "Mình muốn nhận gợi ý món cho bữa tối của gia đình nhỏ.",
        },
    )
    assert ticket.status_code == 201, ticket.text

    lookups = {
        email: client.get(
            "/api/v1/admin/meal-suggestions/recipient", headers=admin, params={"email": email}
        ).json()
        for email in ("LAN@example.com", "minh@example.com", "moi@example.com")
    }
    assert lookups["LAN@example.com"] == {
        "email": "lan@example.com",
        "name": "Nguyễn Ngọc Lan",
        "source": "user",
    }
    assert lookups["minh@example.com"]["source"] == "support"
    assert lookups["minh@example.com"]["name"] == "Lê Minh"
    assert lookups["moi@example.com"] == {"email": "moi@example.com", "name": None, "source": "new"}
    member = register_and_login(client, "thanhvien@example.com")
    assert (
        client.get(
            "/api/v1/admin/meal-suggestions/recipient",
            headers=member,
            params={"email": "moi@example.com"},
        ).status_code
        == 403
    )

    deliveries: list[dict[str, object]] = []
    monkeypatch.setattr(
        "app.modules.auth.email.send_meal_suggestion_email",
        lambda **kwargs: deliveries.append(kwargs),
    )
    base = {
        "meal_type": "dinner",
        "recipe_slugs": ["bun-cha-ha-noi"],
        "subject": "Gợi ý bữa tối từ Bếp Việt",
        "intro_message": "Bếp Việt chọn món này cho bữa tối hôm nay.",
    }
    response = client.post(
        "/api/v1/admin/meal-suggestions/send",
        headers=admin,
        json={
            **base,
            "recipient_emails": [
                "lan@example.com",
                "minh@example.com",
                "moi@example.com",
                "trong@example.com",
            ],
            "recipient_names": {
                "lan@example.com": "Tên ghi đè",
                "minh@example.com": "  Anh   Minh ",
                "MOI@example.com": "Chị Hoa",
                "trong@example.com": "   ",
            },
        },
    )
    assert response.status_code == 200, response.text
    names = {call["recipient"]: call["recipient_name"] for call in deliveries}
    assert names == {
        "lan@example.com": "Nguyễn Ngọc Lan",
        "minh@example.com": "Anh Minh",
        "moi@example.com": "Chị Hoa",
        "trong@example.com": "bạn",
    }

    stray = client.post(
        "/api/v1/admin/meal-suggestions/send",
        headers=admin,
        json={
            **base,
            "recipient_emails": ["moi@example.com"],
            "recipient_names": {"khac@example.com": "Người lạ"},
        },
    )
    assert stray.status_code == 422
    too_long = client.post(
        "/api/v1/admin/meal-suggestions/send",
        headers=admin,
        json={
            **base,
            "recipient_emails": ["moi@example.com"],
            "recipient_names": {"moi@example.com": "A" * 81},
        },
    )
    assert too_long.status_code == 422


def test_admin_sees_user_behaviour_and_recipe_engagement(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed_recipe(database_session_factory)
    admin = create_admin(client, database_session_factory, "admin@example.com")
    member = register_and_login(client, "lan@example.com")
    today = date.today().isoformat()
    assert client.post("/api/v1/favorites/bun-cha-ha-noi", headers=member).status_code == 201
    client.post(
        "/api/v1/planner/items",
        headers=member,
        json={"recipe_slug": "bun-cha-ha-noi", "plan_date": today, "meal_type": "dinner"},
    )
    cooked = client.patch(
        "/api/v1/planner/meals/status",
        headers=member,
        json={"plan_date": today, "meal_type": "dinner", "completion_status": "completed"},
    )
    assert cooked.status_code == 200, cooked.text
    user_id = client.get("/api/v1/admin/users?q=lan", headers=admin).json()["data"][0]["id"]

    detail = client.get(f"/api/v1/admin/users/{user_id}", headers=admin)
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["stats"]["favorites"] == 1
    assert body["stats"]["plan_completed"] == 1
    assert body["stats"]["cooked_recipes"] == 1
    assert body["providers"] == ["password"]
    assert body["regions"] == [{"label": "Bắc", "count": 2}]
    assert len(body["activity"]) == 30
    assert sum(day["count"] for day in body["activity"]) >= 3
    assert body["top_cooked"][0]["slug"] == "bun-cha-ha-noi"

    favorites = client.get(f"/api/v1/admin/users/{user_id}/favorites", headers=admin).json()
    assert favorites["total"] == 1
    assert favorites["data"][0]["cooked_times"] == 1
    cooked_list = client.get(f"/api/v1/admin/users/{user_id}/cooked", headers=admin).json()
    assert cooked_list["data"][0]["times"] == 1

    activity = client.get(f"/api/v1/admin/users/{user_id}/activity", headers=admin).json()
    actions = [(event["kind"], event["action"]) for event in activity["data"]]
    assert ("plan", "completed") in actions
    assert ("plan", "added") in actions
    assert ("favorite", "favorited") in actions
    times = [event["occurred_at"] for event in activity["data"]]
    assert times == sorted(times, reverse=True)

    first_page = client.get(f"/api/v1/admin/users/{user_id}/activity?limit=1", headers=admin).json()
    assert len(first_page["data"]) == 1
    assert first_page["next_before"] is not None
    only_favorites = client.get(
        f"/api/v1/admin/users/{user_id}/activity?kind=favorite", headers=admin
    ).json()
    assert {event["kind"] for event in only_favorites["data"]} == {"favorite"}
    assert (
        client.get(f"/api/v1/admin/users/{user_id}/activity?kind=bogus", headers=admin).status_code
        == 422
    )

    recipes = client.get("/api/v1/admin/recipes?sort=favorites", headers=admin).json()
    assert recipes["data"][0]["favorites"] == 1
    assert recipes["data"][0]["cooked"] == 1
    insights = client.get("/api/v1/admin/recipes/bun-cha-ha-noi/insights", headers=admin).json()
    assert insights["recent_favorites"][0]["user_id"] == user_id
    assert insights["top_cooks"][0]["times"] == 1

    platform = client.get("/api/v1/admin/insights", headers=admin).json()
    assert len(platform["activity"]) == 14
    assert platform["top_recipes"][0]["slug"] == "bun-cha-ha-noi"
    assert client.get("/api/v1/admin/users/" + user_id, headers=member).status_code == 403


def test_breakfast_suggestions_and_stale_sending_rows_expire(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from datetime import UTC, datetime, timedelta

    from sqlalchemy import select

    from app.modules.support.models import AdminMealSuggestionEmail

    seed_recipe(database_session_factory)
    admin = create_admin(client, database_session_factory, "admin@example.com")
    calls: list[str] = []
    monkeypatch.setattr(
        "app.modules.auth.email.send_meal_suggestion_email",
        lambda **kwargs: calls.append(str(kwargs["meal_type"])),
    )
    response = client.post(
        "/api/v1/admin/meal-suggestions/send",
        headers=admin,
        json={
            "recipient_emails": ["sang@example.com"],
            "meal_type": "breakfast",
            "recipe_slugs": ["bun-cha-ha-noi"],
            "subject": "Gợi ý bữa sáng từ Bếp Việt",
            "intro_message": "Bếp Việt chọn món này cho bữa sáng hôm nay.",
        },
    )
    assert response.status_code == 200, response.text
    assert calls == ["breakfast"]

    with database_session_factory() as session:
        row = session.scalars(select(AdminMealSuggestionEmail)).one()
        row.status = "sending"
        row.created_at = datetime.now(UTC) - timedelta(hours=1)
        session.commit()
    history = client.get("/api/v1/admin/meal-suggestions/history", headers=admin).json()
    assert history["data"][0]["status"] == "failed"
