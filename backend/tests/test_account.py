from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.modules.account.preferences import UserPreferences, portion_factor
from tests.helpers import PNG_DATA_URL, create_admin, register_and_login


def test_household_members_drive_default_servings() -> None:
    family = UserPreferences.model_validate(
        {
            "household_members": [
                {"label": "Bố", "age": 42},
                {"label": "Mẹ", "age": 40},
                {"label": "Bé", "age": 12},
            ]
        }
    )
    assert portion_factor(12) == 0.7
    assert family.household_portions() == 2.7
    assert family.default_servings() == 3

    manual = family.model_copy(update={"servings_mode": "manual", "manual_servings": 6})
    assert manual.default_servings() == 6


def test_preferences_round_trip_and_are_returned_with_session(client: TestClient) -> None:
    headers = register_and_login(client, "lan@example.com")
    saved = client.put(
        "/api/v1/account/preferences",
        headers=headers,
        json={
            "language": "en",
            "household_description": "2 chị em, 25 và 22 tuổi",
            "household_members": [
                {"label": "Chị", "age": 25},
                {"label": "Em", "age": 22, "appetite": "light"},
            ],
            "dietary_tags": ["no_beef", "no_beef"],
        },
    )
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["language"] == "en"
    assert body["dietary_tags"] == ["no_beef"]
    assert body["computed_servings"] == 2

    me = client.get("/api/v1/auth/me", headers=headers).json()
    assert me["preferences"]["language"] == "en"
    assert me["preferences"]["household_members"][1]["appetite"] == "light"


def test_regular_user_cannot_write_admin_only_preferences(client: TestClient) -> None:
    headers = register_and_login(client, "user@example.com")
    response = client.put(
        "/api/v1/account/preferences",
        headers=headers,
        json={"admin_landing": "home", "admin_notify_pending": False},
    )
    assert response.status_code == 200
    assert response.json()["admin_landing"] == "admin"
    assert response.json()["admin_notify_pending"] is True


def test_admin_can_save_admin_only_preferences(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    headers = create_admin(client, database_session_factory, "admin@example.com")
    response = client.put(
        "/api/v1/account/preferences", headers=headers, json={"admin_landing": "home"}
    )
    assert response.status_code == 200
    assert response.json()["admin_landing"] == "home"


def test_invalid_preferences_are_rejected(client: TestClient) -> None:
    headers = register_and_login(client, "lan@example.com")
    response = client.put(
        "/api/v1/account/preferences",
        headers=headers,
        json={"household_members": [{"label": "Ông", "age": 300}]},
    )
    assert response.status_code == 422


def test_profile_and_avatar_lifecycle(client: TestClient) -> None:
    headers = register_and_login(client, "lan@example.com")

    renamed = client.patch(
        "/api/v1/account/profile", headers=headers, json={"full_name": "  Trần   Thu Hà "}
    )
    assert renamed.json()["full_name"] == "Trần Thu Hà"

    uploaded = client.put(
        "/api/v1/account/avatar", headers=headers, json={"data_url": PNG_DATA_URL}
    )
    assert uploaded.status_code == 200, uploaded.text
    avatar_url = uploaded.json()["avatar_url"]
    assert avatar_url.startswith("/account/avatar/")

    image = client.get(f"/api/v1{avatar_url}")
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/png"

    removed = client.delete("/api/v1/account/avatar", headers=headers)
    assert removed.json()["avatar_url"] is None


def test_avatar_rejects_spoofed_content(client: TestClient) -> None:
    headers = register_and_login(client, "lan@example.com")
    fake = "data:image/png;base64," + "PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="
    response = client.put("/api/v1/account/avatar", headers=headers, json={"data_url": fake})
    assert response.status_code == 400
    assert response.json()["code"] == "INVALID_IMAGE"


def test_overview_and_export(client: TestClient) -> None:
    headers = register_and_login(client, "lan@example.com")
    overview = client.get("/api/v1/account/overview", headers=headers)
    assert overview.status_code == 200
    assert overview.json()["has_password"] is True
    assert overview.json()["stats"]["favorites"] == 0

    exported = client.get("/api/v1/account/export", headers=headers)
    assert exported.status_code == 200
    assert exported.json()["profile"]["email"] == "lan@example.com"


def test_revoke_all_sessions_invalidates_access_token(client: TestClient) -> None:
    headers = register_and_login(client, "lan@example.com")
    revoked = client.post("/api/v1/account/sessions/revoke-all", headers=headers)
    assert revoked.status_code == 200
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401
