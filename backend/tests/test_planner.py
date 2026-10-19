from datetime import date
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.modules.recipes.models import Recipe, RecipeIngredient


def register_and_login(client: TestClient, email: str) -> dict[str, str]:
    registered = client.post(
        "/api/v1/auth/register",
        json={"full_name": "Nguyễn An", "email": email, "password": "BepViet2026"},
    )
    assert registered.status_code == 201
    response = client.post("/api/v1/auth/login", json={"email": email, "password": "BepViet2026"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def seed_planner_recipes(database_session_factory: sessionmaker[Session]) -> None:
    with database_session_factory() as session:
        bun_cha = Recipe(
            slug="bun-cha-ha-noi",
            name="Bún chả Hà Nội",
            excerpt="Bún chả nướng than hoa.",
            region="Bắc",
            category="Món mặn",
            difficulty="Trung bình",
            prep_minutes=30,
            cook_minutes=20,
            base_servings=4,
            image_path="/images/bun-cha.jpg",
            image_alt="Bún chả",
            serving="Ăn nóng.",
            tip="Nướng vừa lửa.",
            source_name="Bếp Việt",
            source_url="https://bepviet.example/bun-cha",
            status="published",
            content={},
            search_text="bun cha ha noi",
        )
        soup = Recipe(
            slug="canh-chua-ca",
            name="Canh chua cá",
            excerpt="Canh chua dịu vị.",
            region="Nam",
            category="Món canh",
            difficulty="Dễ",
            prep_minutes=15,
            cook_minutes=25,
            base_servings=2,
            image_path="/images/canh-chua.jpg",
            image_alt="Canh chua cá",
            serving="Dùng nóng.",
            tip="Nêm vừa vị.",
            source_name="Bếp Việt",
            source_url="https://bepviet.example/canh-chua",
            status="published",
            content={},
            search_text="canh chua ca",
        )
        session.add_all([bun_cha, soup])
        session.flush()
        session.add_all(
            [
                RecipeIngredient(
                    recipe_id=bun_cha.id,
                    group_name="Nguyên liệu chính",
                    name="Thịt heo",
                    amount=Decimal("400"),
                    unit="g",
                    note=None,
                    scalable=True,
                    position=0,
                ),
                RecipeIngredient(
                    recipe_id=bun_cha.id,
                    group_name="Gia vị",
                    name="Muối",
                    amount=Decimal("2"),
                    unit="g",
                    note=None,
                    scalable=False,
                    position=1,
                ),
                RecipeIngredient(
                    recipe_id=soup.id,
                    group_name="Nguyên liệu chính",
                    name="Thịt heo",
                    amount=Decimal("200"),
                    unit="g",
                    note="Thái mỏng",
                    scalable=True,
                    position=0,
                ),
                RecipeIngredient(
                    recipe_id=soup.id,
                    group_name="Gia vị",
                    name="Muối",
                    amount=Decimal("1"),
                    unit="g",
                    note=None,
                    scalable=False,
                    position=1,
                ),
                RecipeIngredient(
                    recipe_id=soup.id,
                    group_name="Rau thơm",
                    name="Rau thơm",
                    amount=None,
                    unit="nắm",
                    note="Tùy khẩu vị",
                    scalable=False,
                    position=2,
                ),
            ]
        )
        session.commit()


def test_plans_are_private_and_keep_an_immutable_change_history(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed_planner_recipes(database_session_factory)
    an_headers = register_and_login(client, "an-planner@example.com")
    binh_headers = register_and_login(client, "binh-planner@example.com")

    created = client.post(
        "/api/v1/planner/items",
        headers=an_headers,
        json={
            "recipe_slug": "bun-cha-ha-noi",
            "plan_date": "2026-10-07",
            "meal_type": "lunch",
            "servings": 2,
        },
    )
    assert created.status_code == 201
    item = created.json()
    assert item["recipe"]["image_path"] == "/images/bun-cha.jpg"
    item_id = item["id"]

    repeated = client.post(
        "/api/v1/planner/items",
        headers=an_headers,
        json={
            "recipe_slug": "bun-cha-ha-noi",
            "plan_date": "2026-10-07",
            "meal_type": "lunch",
            "servings": 2,
        },
    )
    assert repeated.status_code == 409

    own_items = client.get(
        "/api/v1/planner/items?from=2026-10-05&to=2026-10-11", headers=an_headers
    )
    assert own_items.status_code == 200
    assert len(own_items.json()) == 1
    other_items = client.get(
        "/api/v1/planner/items?from=2026-10-05&to=2026-10-11", headers=binh_headers
    )
    assert other_items.status_code == 200
    assert other_items.json() == []
    assert (
        client.delete(f"/api/v1/planner/items/{item_id}", headers=binh_headers).status_code == 404
    )

    updated = client.patch(
        f"/api/v1/planner/items/{item_id}", headers=an_headers, json={"servings": 3}
    )
    assert updated.status_code == 200
    removed = client.delete(f"/api/v1/planner/items/{item_id}", headers=an_headers)
    assert removed.status_code == 204

    history = client.get("/api/v1/planner/history", headers=an_headers)
    assert history.status_code == 200
    assert [event["action"] for event in history.json()["data"]] == [
        "removed",
        "updated",
        "added",
    ]
    assert history.json()["data"][0]["recipe_name"] == "Bún chả Hà Nội"
    assert client.get("/api/v1/planner/history", headers=binh_headers).json()["total"] == 0


def test_shopping_list_aggregates_scaled_ingredients_for_day_week_and_month(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed_planner_recipes(database_session_factory)
    headers = register_and_login(client, "shopping-planner@example.com")
    for slug, meal, servings in (
        ("bun-cha-ha-noi", "lunch", 2),
        ("canh-chua-ca", "dinner", 4),
    ):
        response = client.post(
            "/api/v1/planner/items",
            headers=headers,
            json={
                "recipe_slug": slug,
                "plan_date": "2026-10-07",
                "meal_type": meal,
                "servings": servings,
            },
        )
        assert response.status_code == 201

    day = client.get("/api/v1/planner/shopping-list?period=day&date=2026-10-07", headers=headers)
    assert day.status_code == 200
    day_list = {item["name"]: item for item in day.json()["items"]}
    assert day.json()["recipe_count"] == 2
    assert Decimal(day_list["Thịt heo"]["amount"]) == Decimal("600.00")
    assert Decimal(day_list["Muối"]["amount"]) == Decimal("3.00")
    assert day_list["Rau thơm"]["amount"] is None
    assert set(day_list["Thịt heo"]["recipe_names"]) == {"Bún chả Hà Nội", "Canh chua cá"}
    assert day_list["Thịt heo"]["category"] == "ingredient"
    assert day_list["Muối"]["category"] == "seasoning"
    assert {dish["name"] for dish in day.json()["dishes"]} == {"Bún chả Hà Nội", "Canh chua cá"}

    week = client.get("/api/v1/planner/shopping-list?period=week&date=2026-10-07", headers=headers)
    assert week.json()["from_date"] == date(2026, 10, 5).isoformat()
    assert week.json()["to_date"] == date(2026, 10, 11).isoformat()
    month = client.get(
        "/api/v1/planner/shopping-list?period=month&date=2026-10-07", headers=headers
    )
    assert month.json()["from_date"] == date(2026, 10, 1).isoformat()
    assert month.json()["to_date"] == date(2026, 10, 31).isoformat()


def test_bulk_meal_save_and_completion_history_are_private_and_persisted(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed_planner_recipes(database_session_factory)
    headers = register_and_login(client, "bulk-planner@example.com")
    other_headers = register_and_login(client, "bulk-planner-other@example.com")

    saved = client.post(
        "/api/v1/planner/meals",
        headers=headers,
        json={
            "recipe_slugs": ["bun-cha-ha-noi", "canh-chua-ca"],
            "plan_date": "2026-10-07",
            "meal_type": "dinner",
            "servings": 3,
        },
    )
    assert saved.status_code == 201
    assert len(saved.json()["items"]) == 2
    assert {item["completion_status"] for item in saved.json()["items"]} == {"planned"}

    repeated = client.post(
        "/api/v1/planner/meals",
        headers=headers,
        json={
            "recipe_slugs": ["bun-cha-ha-noi", "canh-chua-ca"],
            "plan_date": "2026-10-07",
            "meal_type": "dinner",
            "servings": 3,
        },
    )
    assert repeated.status_code == 200
    assert repeated.json() == {"items": [], "already_planned": 2}

    history = client.get("/api/v1/planner/history/meals?through=2026-10-07", headers=headers)
    assert history.status_code == 200
    assert history.json()["total"] == 1
    assert len(history.json()["data"][0]["items"]) == 2
    assert client.get(
        "/api/v1/planner/history/meals?through=2026-10-07", headers=other_headers
    ).json()["data"] == []

    status_update = client.patch(
        "/api/v1/planner/meals/status",
        headers=headers,
        json={
            "plan_date": "2026-10-07",
            "meal_type": "dinner",
            "completion_status": "completed",
        },
    )
    assert status_update.status_code == 200
    assert {item["completion_status"] for item in status_update.json()} == {"completed"}
    refreshed_history = client.get(
        "/api/v1/planner/history/meals?through=2026-10-07", headers=headers
    )
    assert refreshed_history.json()["data"][0]["completion_status"] == "completed"
    assert client.get("/api/v1/planner/history", headers=headers).json()["total"] == 4


def test_planner_requires_authentication(client: TestClient) -> None:
    assert client.get("/api/v1/planner/history").status_code == 401
    assert (
        client.get("/api/v1/planner/shopping-list?period=week&date=2026-10-07").status_code == 401
    )


def test_vegetarian_days_are_private_upserted_and_range_limited(client: TestClient) -> None:
    headers = register_and_login(client, "chay@example.com")
    other_headers = register_and_login(client, "khac@example.com")

    marked = client.put(
        "/api/v1/planner/vegetarian-days/2026-10-24",
        headers=headers,
        json={"is_vegetarian": True},
    )
    assert marked.status_code == 200, marked.text
    assert marked.json() == {"day": "2026-10-24", "is_vegetarian": True}

    # Bỏ đánh dấu một ngày rằm phải được lưu lại để ghi đè quy tắc tự động.
    unmarked = client.put(
        "/api/v1/planner/vegetarian-days/2026-10-25",
        headers=headers,
        json={"is_vegetarian": False},
    )
    assert unmarked.status_code == 200
    toggled = client.put(
        "/api/v1/planner/vegetarian-days/2026-10-24",
        headers=headers,
        json={"is_vegetarian": False},
    )
    assert toggled.json()["is_vegetarian"] is False

    listed = client.get(
        "/api/v1/planner/vegetarian-days?from=2026-10-19&to=2026-10-25", headers=headers
    )
    assert listed.status_code == 200
    assert listed.json() == [
        {"day": "2026-10-24", "is_vegetarian": False},
        {"day": "2026-10-25", "is_vegetarian": False},
    ]
    assert (
        client.get(
            "/api/v1/planner/vegetarian-days?from=2026-10-19&to=2026-10-25",
            headers=other_headers,
        ).json()
        == []
    )
    assert (
        client.get(
            "/api/v1/planner/vegetarian-days?from=2026-10-25&to=2026-10-19", headers=headers
        ).status_code
        == 422
    )
    assert (
        client.get(
            "/api/v1/planner/vegetarian-days?from=2026-01-01&to=2027-06-01", headers=headers
        ).status_code
        == 422
    )
    assert (
        client.put(
            "/api/v1/planner/vegetarian-days/2026-10-24",
            headers=headers,
            json={"is_vegetarian": True, "note": "x"},
        ).status_code
        == 422
    )
    exported = client.get("/api/v1/account/export", headers=headers).json()
    assert {"date": "2026-10-24", "is_vegetarian": False} in exported["vegetarian_days"]


def test_vegetarian_days_require_authentication(client: TestClient) -> None:
    assert (
        client.get("/api/v1/planner/vegetarian-days?from=2026-10-19&to=2026-10-25").status_code
        == 401
    )
    assert (
        client.put(
            "/api/v1/planner/vegetarian-days/2026-10-24", json={"is_vegetarian": True}
        ).status_code
        == 401
    )
