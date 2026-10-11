from datetime import date

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
            "/api/v1/auth/login", json={"email": "lan@example.com", "password": "BepViet2026"}
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
