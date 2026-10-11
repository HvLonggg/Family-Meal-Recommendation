from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.modules.saved_meals.models import SavedMeal


def register_user(
    client: TestClient,
    email: str = "quyen.mamcom@example.com",
) -> str:
    created = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Nguyễn Quyên",
            "email": email,
            "password": "BepViet2026",
        },
    )
    assert created.status_code == 201
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "BepViet2026"},
    )
    assert response.status_code == 200
    return str(response.json()["access_token"])


def test_saved_meals_require_login(client: TestClient) -> None:
    response = client.get("/api/v1/saved-meals")
    assert response.status_code == 401


def test_save_and_list_meal_history(client: TestClient) -> None:
    token = register_user(client)
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "profile": "balanced",
        "dish_ids": [
            "main:ca-chep-kho-rieng",
            "soup:canh-chua-ca",
            "vegetable:rau-muong-xao-toi",
            "dessert:seasonal-fruit",
        ],
    }

    created = client.post("/api/v1/saved-meals", headers=headers, json=payload)
    assert created.status_code == 201
    assert created.json()["profile"] == "balanced"
    assert created.json()["dish_ids"] == payload["dish_ids"]

    history = client.get("/api/v1/saved-meals", headers=headers)
    assert history.status_code == 200
    assert len(history.json()) == 1
    assert history.json()[0]["id"] == created.json()["id"]


def test_saved_meal_history_is_isolated_per_account(client: TestClient) -> None:
    first_token = register_user(client)
    saved = client.post(
        "/api/v1/saved-meals",
        headers={"Authorization": f"Bearer {first_token}"},
        json={
            "profile": "balanced",
            "dish_ids": ["main:ca-kho", "soup:canh-chua", "vegetable:rau-xao"],
        },
    )
    assert saved.status_code == 201

    second_token = register_user(
        client,
        email="mai@example.com",
    )
    second_history = client.get(
        "/api/v1/saved-meals", headers={"Authorization": f"Bearer {second_token}"}
    )
    assert second_history.status_code == 200
    assert second_history.json() == []


def test_rejects_duplicate_dishes(client: TestClient) -> None:
    token = register_user(client)
    headers = {"Authorization": f"Bearer {token}"}
    response = client.post(
        "/api/v1/saved-meals",
        headers=headers,
        json={
            "profile": "light",
            "dish_ids": ["main:pho-ga-gia-dinh"] * 3,
        },
    )
    assert response.status_code == 422


def test_legacy_history_is_returned_with_the_english_contract(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    token = register_user(client)
    headers = {"Authorization": f"Bearer {token}"}
    response = client.post(
        "/api/v1/saved-meals",
        headers=headers,
        json={
            "profile": "balanced",
            "dish_ids": ["main:a", "soup:b", "vegetable:c"],
        },
    )
    assert response.status_code == 201
    with database_session_factory() as session:
        meal = session.scalar(select(SavedMeal))
        assert meal is not None
        meal.profile = "can_bang"
        session.commit()
    saved = client.get("/api/v1/saved-meals", headers=headers).json()[0]
    assert saved["profile"] == "balanced"
    assert set(saved) == {"id", "profile", "dish_ids", "created_at"}
