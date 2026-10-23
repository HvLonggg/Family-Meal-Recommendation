from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.modules.recipes.models import Recipe


def create_user(client: TestClient, email: str) -> str:
    created = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Nguyễn Ngọc Lan",
            "email": email,
            "password": "Test-Only-No-Login-2026!",
        },
    )
    assert created.status_code == 201
    verified = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Test-Only-No-Login-2026!"},
    )
    assert verified.status_code == 200
    return verified.json()["access_token"]


def seed_recipe(database_session_factory: sessionmaker[Session]) -> None:
    with database_session_factory() as session:
        session.add(
            Recipe(
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
                image_alt="Bún chả Hà Nội",
                serving="Ăn nóng.",
                tip="Nướng vừa lửa.",
                source_name="Bếp Việt",
                source_url="https://bepviet.example/recipes/bun-cha-ha-noi",
                status="published",
                content={},
                search_text="bun cha ha noi",
            )
        )
        session.commit()


def test_favorites_are_private_to_each_account(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed_recipe(database_session_factory)
    lan_token = create_user(client, "lan@example.com")
    lan_headers = {"Authorization": f"Bearer {lan_token}"}

    saved = client.post("/api/v1/favorites/bun-cha-ha-noi", headers=lan_headers)
    assert saved.status_code == 201
    assert saved.json()["slug"] == "bun-cha-ha-noi"

    repeated = client.post("/api/v1/favorites/bun-cha-ha-noi", headers=lan_headers)
    assert repeated.status_code == 201

    mai_token = create_user(client, "mai@example.com")
    mai_headers = {"Authorization": f"Bearer {mai_token}"}
    mai_favorites = client.get("/api/v1/favorites", headers=mai_headers)
    assert mai_favorites.status_code == 200
    assert mai_favorites.json() == []

    removed = client.delete("/api/v1/favorites/bun-cha-ha-noi", headers=lan_headers)
    assert removed.status_code == 204
    lan_favorites = client.get("/api/v1/favorites", headers=lan_headers)
    assert lan_favorites.status_code == 200
    assert lan_favorites.json() == []


def test_favorites_require_authentication(client: TestClient) -> None:
    assert client.get("/api/v1/favorites").status_code == 401
