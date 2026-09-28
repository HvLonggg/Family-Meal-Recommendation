from typing import Any
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

import app.modules.auth.router as auth_router
from app.core.config import get_settings
from app.modules.auth.models import AuthIdentity, User
from app.modules.auth.oauth import OAuthProfile


def register_user(client: TestClient, email: str = "lan.nguyen@example.com") -> dict[str, Any]:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Nguyễn Ngọc Lan",
            "email": email,
            "password": "BepViet2026",
        },
    )
    assert response.status_code == 201
    return response.json()


def test_register_login_and_read_profile(client: TestClient) -> None:
    registered = register_user(client)
    assert registered["user"]["full_name"] == "Nguyễn Ngọc Lan"
    assert registered["user"]["role"] == "user"

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "lan.nguyen@example.com", "password": "BepViet2026"},
    )
    assert login_response.status_code == 200
    access_token = login_response.json()["access_token"]

    profile_response = client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"}
    )
    assert profile_response.status_code == 200
    assert profile_response.json()["email"] == "lan.nguyen@example.com"


def test_duplicate_email_and_invalid_login_use_safe_messages(client: TestClient) -> None:
    register_user(client)
    duplicate = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Người dùng khác",
            "email": "lan.nguyen@example.com",
            "password": "MatKhau2026",
        },
    )
    invalid_login = client.post(
        "/api/v1/auth/login",
        json={"email": "lan.nguyen@example.com", "password": "sai-mat-khau"},
    )

    assert duplicate.status_code == 409
    assert duplicate.json()["message"] == "Email này đã được sử dụng."
    assert invalid_login.status_code == 401
    assert invalid_login.json()["message"] == "Email hoặc mật khẩu chưa đúng."


def test_admin_route_enforces_role(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    user_session = register_user(client)
    user_token = user_session["access_token"]
    forbidden = client.get(
        "/api/v1/auth/admin-check",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert forbidden.status_code == 403

    with database_session_factory() as session:
        user = session.scalar(select(User).where(User.email == "lan.nguyen@example.com"))
        assert user is not None
        user.role = "admin"
        session.commit()

    admin_login = client.post(
        "/api/v1/auth/login",
        json={"email": "lan.nguyen@example.com", "password": "BepViet2026"},
    )
    admin_token = admin_login.json()["access_token"]
    allowed = client.get(
        "/api/v1/auth/admin-check",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert allowed.status_code == 200
    assert allowed.json()["role"] == "admin"


def test_forgot_and_reset_password_flow(client: TestClient) -> None:
    register_user(client)
    forgot = client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "lan.nguyen@example.com"},
    )
    reset_token = forgot.json()["development_reset_token"]
    assert reset_token

    reset = client.post(
        "/api/v1/auth/reset-password",
        json={"token": reset_token, "new_password": "MatKhauMoi2026"},
    )
    assert reset.status_code == 200

    login = client.post(
        "/api/v1/auth/login",
        json={"email": "lan.nguyen@example.com", "password": "MatKhauMoi2026"},
    )
    assert login.status_code == 200


def test_phone_otp_creates_user_and_session(client: TestClient) -> None:
    request_code = client.post(
        "/api/v1/auth/phone/request",
        json={"phone": "090 123 4567"},
    )
    payload = request_code.json()
    assert request_code.status_code == 200
    assert payload["development_code"]

    verify = client.post(
        "/api/v1/auth/phone/verify",
        json={
            "challenge_id": payload["challenge_id"],
            "code": payload["development_code"],
        },
    )
    assert verify.status_code == 200
    assert verify.json()["user"]["phone_e164"] == "+84901234567"
    assert verify.json()["user"]["role"] == "user"


def test_refresh_cookie_rotates_and_logout_revokes_session(client: TestClient) -> None:
    register_user(client)
    refreshed = client.post("/api/v1/auth/refresh")
    assert refreshed.status_code == 200
    assert refreshed.json()["access_token"]

    logout = client.post("/api/v1/auth/logout")
    assert logout.status_code == 200
    assert client.post("/api/v1/auth/refresh").status_code == 401


def test_google_oauth_creates_user_and_session(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    monkeypatch: Any,
) -> None:
    monkeypatch.setenv("BEP_VIET_GOOGLE_CLIENT_ID", "google-client-id")
    monkeypatch.setenv("BEP_VIET_GOOGLE_CLIENT_SECRET", "google-client-secret")
    get_settings.cache_clear()

    async def fake_exchange_google_code(code: str) -> OAuthProfile:
        assert code == "authorization-code"
        return OAuthProfile(
            provider="google",
            subject="google-user-123",
            email="quyen@example.com",
            full_name="Nguyễn Quyên",
        )

    monkeypatch.setattr(auth_router, "exchange_google_code", fake_exchange_google_code)

    start = client.get("/api/v1/auth/oauth/google/start", follow_redirects=False)
    assert start.status_code == 302
    location = start.headers["location"]
    assert location.startswith("https://accounts.google.com/o/oauth2/v2/auth?")
    assert "google-client-secret" not in location
    state = parse_qs(urlparse(location).query)["state"][0]

    callback = client.get(
        "/api/v1/auth/oauth/google/callback",
        params={"code": "authorization-code", "state": state},
        follow_redirects=False,
    )
    assert callback.status_code == 303
    assert callback.headers["location"].endswith("/xac-thuc-google?status=success")

    refreshed = client.post("/api/v1/auth/refresh")
    assert refreshed.status_code == 200
    assert refreshed.json()["user"]["email"] == "quyen@example.com"
    assert refreshed.json()["user"]["role"] == "user"

    with database_session_factory() as session:
        identity = session.scalar(
            select(AuthIdentity).where(
                AuthIdentity.provider == "google",
                AuthIdentity.provider_subject == "google-user-123",
            )
        )
        assert identity is not None

    get_settings.cache_clear()
