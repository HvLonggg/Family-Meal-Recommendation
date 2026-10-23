from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.modules.auth.models import AuthIdentity, SecurityEmailOutbox, User

PASSWORD = "Test-Only-No-Login-2026!"


def register_and_login(client: TestClient, email: str) -> dict[str, str]:
    created = client.post(
        "/api/v1/auth/register",
        json={"full_name": "Nguyễn Ngọc Lan", "email": email, "password": PASSWORD},
    )
    assert created.status_code == 201
    login = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def request_code(
    client: TestClient, headers: dict[str, str], new_email: str, password: str | None = PASSWORD
) -> Any:
    return client.post(
        "/api/v1/auth/change-email",
        headers=headers,
        json={"new_email": new_email, "current_password": password},
    )


def test_email_change_requires_code_sent_to_new_address(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    headers = register_and_login(client, "lan.nguyen@example.com")
    requested = request_code(client, headers, "  Lan.Moi@Example.com ")
    assert requested.status_code == 200
    challenge = requested.json()

    wrong_code = "11111" if challenge["development_code"] == "00000" else "00000"
    wrong = client.post(
        "/api/v1/auth/change-email/confirm",
        headers=headers,
        json={"challenge_id": challenge["challenge_id"], "code": wrong_code},
    )
    assert wrong.status_code == 400

    confirmed = client.post(
        "/api/v1/auth/change-email/confirm",
        headers=headers,
        json={"challenge_id": challenge["challenge_id"], "code": challenge["development_code"]},
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["email"] == "lan.moi@example.com"
    # Phiên hiện tại vẫn dùng được, đăng nhập bằng email mới, email cũ không còn đăng nhập.
    assert client.get("/api/v1/auth/me", headers=headers).json()["email"] == "lan.moi@example.com"
    assert (
        client.post(
            "/api/v1/auth/login", json={"email": "lan.moi@example.com", "password": PASSWORD}
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/auth/login", json={"email": "lan.nguyen@example.com", "password": PASSWORD}
        ).status_code
        == 401
    )

    with database_session_factory() as session:
        user = session.scalar(select(User).where(User.email == "lan.moi@example.com"))
        assert user is not None and user.email_verified_at is not None
        notice = session.scalar(
            select(SecurityEmailOutbox).where(SecurityEmailOutbox.event == "email_change")
        )
        assert notice is not None and notice.recipient == "lan.nguyen@example.com"
        identity = session.scalar(
            select(AuthIdentity).where(
                AuthIdentity.user_id == user.id, AuthIdentity.provider == "password"
            )
        )
        assert identity is not None and identity.provider_subject == "lan.moi@example.com"

    # Mã đã dùng không dùng lại được, và email cũ đăng ký lại bình thường.
    reused = client.post(
        "/api/v1/auth/change-email/confirm",
        headers=headers,
        json={"challenge_id": challenge["challenge_id"], "code": challenge["development_code"]},
    )
    assert reused.status_code == 400
    register_and_login(client, "lan.nguyen@example.com")


def test_email_change_rejects_wrong_password_same_or_taken_email(client: TestClient) -> None:
    register_and_login(client, "da.co@example.com")
    headers = register_and_login(client, "lan.nguyen@example.com")

    assert request_code(client, headers, "moi@example.com", "SaiMatKhau1").status_code == 401
    assert request_code(client, headers, "moi@example.com", None).status_code == 401
    assert request_code(client, headers, "LAN.NGUYEN@example.com").status_code == 409
    assert request_code(client, headers, "da.co@example.com").status_code == 409
    assert (
        client.post("/api/v1/auth/change-email", json={"new_email": "moi@example.com"}).status_code
        == 401
    )


def test_email_change_code_is_bound_to_requesting_account(client: TestClient) -> None:
    owner = register_and_login(client, "lan.nguyen@example.com")
    other = register_and_login(client, "khach@example.com")
    challenge = request_code(client, owner, "moi@example.com").json()

    stolen = client.post(
        "/api/v1/auth/change-email/confirm",
        headers=other,
        json={"challenge_id": challenge["challenge_id"], "code": challenge["development_code"]},
    )
    assert stolen.status_code == 400
    assert client.get("/api/v1/auth/me", headers=other).json()["email"] == "khach@example.com"


def test_email_change_fails_if_address_is_taken_before_confirmation(client: TestClient) -> None:
    headers = register_and_login(client, "lan.nguyen@example.com")
    challenge = request_code(client, headers, "moi@example.com").json()
    register_and_login(client, "moi@example.com")

    confirmed = client.post(
        "/api/v1/auth/change-email/confirm",
        headers=headers,
        json={"challenge_id": challenge["challenge_id"], "code": challenge["development_code"]},
    )
    assert confirmed.status_code == 409
    current = client.get("/api/v1/auth/me", headers=headers).json()
    assert current["email"] == "lan.nguyen@example.com"
