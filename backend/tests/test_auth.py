import re
from typing import Any
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

import app.modules.auth.router as auth_router
from app.core.config import get_settings
from app.modules.auth.email import EmailDeliveryError, deliver_security_email
from app.modules.auth.models import AuthIdentity, EmailOtpChallenge, SecurityEmailOutbox, User
from app.modules.auth.oauth import OAuthProfile


def register_user(client: TestClient, email: str = "lan.nguyen@example.com") -> dict[str, Any]:
    created = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Nguyễn Ngọc Lan",
            "email": email,
            "password": "Test-Only-No-Login-2026!",
        },
    )
    assert created.status_code == 201
    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Test-Only-No-Login-2026!"},
    )
    assert login.status_code == 200
    return login.json()


def test_registration_creates_account_without_otp_and_queues_welcome_email(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Nguyễn Ngọc Lan",
            "email": "lan.nguyen@example.com",
            "password": "Test-Only-No-Login-2026!",
        },
    )
    assert response.status_code == 201
    assert "được tạo thành công" in response.json()["message"]
    assert "set-cookie" not in response.headers

    with database_session_factory() as session:
        user = session.scalar(select(User).where(User.email == "lan.nguyen@example.com"))
        assert user is not None
        assert user.email_verified_at is None
        assert user.password_hash is not None
        identity = session.scalar(
            select(AuthIdentity).where(
                AuthIdentity.provider == "password",
                AuthIdentity.provider_subject == "lan.nguyen@example.com",
            )
        )
        assert identity is not None
        event = session.scalar(
            select(SecurityEmailOutbox).where(SecurityEmailOutbox.event == "registration")
        )
        assert event is not None
        assert event.recipient == "lan.nguyen@example.com"
        assert event.sent_at is None

    login = client.post(
        "/api/v1/auth/login",
        json={"email": "lan.nguyen@example.com", "password": "Test-Only-No-Login-2026!"},
    )
    assert login.status_code == 200


def test_registration_otp_routes_are_removed(client: TestClient) -> None:
    payload = {
        "full_name": "Nguyễn Ngọc Lan",
        "email": "lan@example.com",
        "password": "Test-Only-No-Login-2026!",
    }
    assert client.post("/api/v1/auth/register/request-code", json=payload).status_code == 404
    assert client.post("/api/v1/auth/register/verify-code", json=payload).status_code == 404


def test_email_login_and_remember_controls_cookie(client: TestClient) -> None:
    register_user(client)
    email_login = client.post(
        "/api/v1/auth/login",
        json={"email": "lan.nguyen@example.com", "password": "Test-Only-No-Login-2026!"},
    )
    assert email_login.status_code == 200
    assert "max-age" not in email_login.headers["set-cookie"].lower()

    remembered = client.post(
        "/api/v1/auth/login",
        json={
            "email": "lan.nguyen@example.com",
            "password": "Test-Only-No-Login-2026!",
            "remember_me": True,
        },
    )
    assert remembered.status_code == 200
    assert "max-age=2592000" in remembered.headers["set-cookie"].lower()


def test_phone_auth_endpoints_are_removed(client: TestClient) -> None:
    response = client.post("/api/v1/auth/phone/request", json={"phone": "0901234567"})
    assert response.status_code == 404
    assert (
        client.post(
            "/api/v1/auth/login", json={"identifier": "0901234567", "password": "secret"}
        ).status_code
        == 422
    )


def test_invalid_login_uses_generic_message(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "sai-mat-khau"},
    )
    assert response.status_code == 401
    assert response.json()["message"] == "Thông tin đăng nhập chưa đúng."


def test_duplicate_registration_rejected(client: TestClient) -> None:
    register_user(client)
    duplicate = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Người dùng khác",
            "email": "lan.nguyen@example.com",
            "password": "MatKhau2026",
        },
    )
    assert duplicate.status_code == 409


def test_admin_route_enforces_role(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    registered = register_user(client)
    user_token = registered["access_token"]
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
        json={"email": "lan.nguyen@example.com", "password": "Test-Only-No-Login-2026!"},
    )
    admin_token = admin_login.json()["access_token"]
    allowed = client.get(
        "/api/v1/auth/admin-check",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert allowed.status_code == 200
    assert allowed.json()["role"] == "admin"


def test_email_password_reset_uses_otp_and_revokes_sessions(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    original_account = register_user(client)
    other_account = register_user(client, email="other.user@example.com")
    forgot = client.post("/api/v1/auth/forgot-password", json={"email": "LAN.NGUYEN@EXAMPLE.COM"})
    assert forgot.status_code == 200
    challenge = forgot.json()
    assert re.fullmatch(r"\d{5}", challenge["development_code"])

    unknown_email = client.post(
        "/api/v1/auth/forgot-password", json={"email": "unknown@example.com"}
    )
    assert unknown_email.status_code == 404
    assert unknown_email.json()["code"] == "EMAIL_NOT_REGISTERED"
    assert "chưa có tài khoản" in unknown_email.json()["message"]
    assert "development_code" not in unknown_email.json()

    verified = client.post(
        "/api/v1/auth/forgot-password/verify-code",
        json={
            "challenge_id": challenge["challenge_id"],
            "code": challenge["development_code"],
        },
    )
    assert verified.status_code == 200
    reset_token = verified.json()["reset_token"]

    reset = client.post(
        "/api/v1/auth/reset-password",
        json={"token": reset_token, "new_password": "New-Test-Only-No-Login-2026!"},
    )
    assert reset.status_code == 200
    with database_session_factory() as session:
        event = session.scalar(
            select(SecurityEmailOutbox).where(SecurityEmailOutbox.event == "password_reset")
        )
        assert event is not None
        assert event.recipient == "lan.nguyen@example.com"
    reused_token = client.post(
        "/api/v1/auth/reset-password",
        json={"token": reset_token, "new_password": "KhacMoi2026"},
    )
    assert reused_token.status_code == 400

    old_login = client.post(
        "/api/v1/auth/login",
        json={"email": "lan.nguyen@example.com", "password": "Test-Only-No-Login-2026!"},
    )
    new_login = client.post(
        "/api/v1/auth/login",
        json={"email": "LAN.NGUYEN@EXAMPLE.COM", "password": "New-Test-Only-No-Login-2026!"},
    )
    other_old_login = client.post(
        "/api/v1/auth/login",
        json={"email": "other.user@example.com", "password": "Test-Only-No-Login-2026!"},
    )
    other_new_password_login = client.post(
        "/api/v1/auth/login",
        json={"email": "other.user@example.com", "password": "New-Test-Only-No-Login-2026!"},
    )
    assert old_login.status_code == 401
    assert new_login.status_code == 200
    assert new_login.json()["user"]["id"] == original_account["user"]["id"]
    assert new_login.json()["user"]["email"] == "lan.nguyen@example.com"
    assert new_login.json()["user"]["full_name"] == "Nguyễn Ngọc Lan"
    assert other_old_login.status_code == 200
    assert other_old_login.json()["user"]["id"] == other_account["user"]["id"]
    assert other_new_password_login.status_code == 401


def test_password_reset_invalidates_previously_issued_access_tokens(client: TestClient) -> None:
    registered = register_user(client)
    access_token = registered["access_token"]
    forgot = client.post(
        "/api/v1/auth/forgot-password", json={"email": "lan.nguyen@example.com"}
    ).json()
    verified = client.post(
        "/api/v1/auth/forgot-password/verify-code",
        json={"challenge_id": forgot["challenge_id"], "code": forgot["development_code"]},
    ).json()
    reset = client.post(
        "/api/v1/auth/reset-password",
        json={"token": verified["reset_token"], "new_password": "New-Test-Only-No-Login-2026!"},
    )
    assert reset.status_code == 200
    rejected = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert rejected.status_code == 401


def test_change_password_requires_current_password_and_revokes_old_sessions(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    registered = register_user(client)
    access_token = registered["access_token"]
    bad_current = client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"current_password": "WrongPass2026", "new_password": "New-Test-Only-No-Login-2026!"},
    )
    assert bad_current.status_code == 401

    changed = client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"current_password": "Test-Only-No-Login-2026!", "new_password": "New-Test-Only-No-Login-2026!"},
    )
    assert changed.status_code == 200
    assert "đăng nhập lại" in changed.json()["message"]
    assert (
        client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"}
        ).status_code
        == 401
    )
    assert client.post("/api/v1/auth/refresh").status_code == 401
    new_login = client.post(
        "/api/v1/auth/login",
        json={"email": "lan.nguyen@example.com", "password": "New-Test-Only-No-Login-2026!"},
    )
    assert new_login.status_code == 200
    with database_session_factory() as session:
        event = session.scalar(
            select(SecurityEmailOutbox).where(SecurityEmailOutbox.event == "password_change")
        )
        assert event is not None
        assert event.recipient == "lan.nguyen@example.com"


def test_otp_requests_are_rate_limited(client: TestClient) -> None:
    register_user(client)
    first = client.post("/api/v1/auth/forgot-password", json={"email": "lan.nguyen@example.com"})
    second = client.post("/api/v1/auth/forgot-password", json={"email": "lan.nguyen@example.com"})
    assert first.status_code == 200
    assert second.status_code == 429


def test_configured_smtp_sends_recovery_code_without_exposing_it(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    monkeypatch: Any,
) -> None:
    register_user(client)
    monkeypatch.setenv("BEP_VIET_EMAIL_SMTP_HOST", "smtp.example.test")
    monkeypatch.setenv("BEP_VIET_EMAIL_SMTP_USERNAME", "smtp-user")
    monkeypatch.setenv("BEP_VIET_EMAIL_SMTP_PASSWORD", "smtp-password")
    monkeypatch.setenv("BEP_VIET_EMAIL_FROM_ADDRESS", "no-reply@example.test")
    monkeypatch.setenv("BEP_VIET_APP_ENV", "production")
    monkeypatch.setenv("BEP_VIET_JWT_SECRET", "production-test-secret-not-for-real-use")
    get_settings.cache_clear()
    deliveries: list[tuple[str, str, str]] = []
    notifications: list[tuple[str, str]] = []

    def fake_send(*, recipient: str, code: str, purpose: str) -> None:
        deliveries.append((recipient, code, purpose))

    monkeypatch.setattr(auth_router, "send_verification_email", fake_send)
    monkeypatch.setattr(
        "app.modules.auth.email.send_security_notification",
        lambda *, recipient, event: notifications.append((recipient, event)),
    )
    try:
        requested = client.post(
            "/api/v1/auth/forgot-password", json={"email": "lan.nguyen@example.com"}
        )
        assert requested.status_code == 200
        assert requested.json()["development_code"] is None
        assert deliveries[0][0] == "lan.nguyen@example.com"
        assert re.fullmatch(r"\d{5}", deliveries[0][1])
        assert deliveries[0][2] == "password_reset"
        with database_session_factory() as session:
            event = session.scalar(
                select(SecurityEmailOutbox).where(SecurityEmailOutbox.event == "registration")
            )
            assert event is not None
            assert event.recipient == "lan.nguyen@example.com"
            assert event.sent_at is None
            assert deliver_security_email(session, event.id)
            session.refresh(event)
            assert event.sent_at is not None
        assert notifications == [("lan.nguyen@example.com", "registration")]
    finally:
        get_settings.cache_clear()


def test_development_never_returns_a_fake_otp_when_smtp_is_missing(
    client: TestClient, monkeypatch: Any
) -> None:
    register_user(client)
    monkeypatch.setenv("BEP_VIET_APP_ENV", "development")
    for key in (
        "BEP_VIET_EMAIL_SMTP_HOST",
        "BEP_VIET_EMAIL_SMTP_USERNAME",
        "BEP_VIET_EMAIL_SMTP_PASSWORD",
        "BEP_VIET_EMAIL_FROM_ADDRESS",
    ):
        monkeypatch.setenv(key, "")
    get_settings.cache_clear()
    try:
        response = client.post(
            "/api/v1/auth/forgot-password", json={"email": "lan.nguyen@example.com"}
        )
        assert response.status_code == 503
        assert "development_code" not in response.json()
    finally:
        get_settings.cache_clear()


def test_test_environment_never_sends_real_email_even_with_smtp_credentials(
    client: TestClient, monkeypatch: Any
) -> None:
    register_user(client)
    monkeypatch.setenv("BEP_VIET_EMAIL_SMTP_HOST", "smtp.gmail.com")
    monkeypatch.setenv("BEP_VIET_EMAIL_SMTP_USERNAME", "hvlongg@gmail.com")
    monkeypatch.setenv("BEP_VIET_EMAIL_SMTP_PASSWORD", "dummy-test-app-password")
    monkeypatch.setenv("BEP_VIET_EMAIL_FROM_ADDRESS", "hvlongg@gmail.com")
    get_settings.cache_clear()
    deliveries: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        auth_router,
        "send_verification_email",
        lambda *, recipient, code, purpose: deliveries.append((recipient, code, purpose)),
    )
    try:
        response = client.post(
            "/api/v1/auth/forgot-password", json={"email": "lan.nguyen@example.com"}
        )
        assert response.status_code == 200
        assert re.fullmatch(r"\d{5}", response.json()["development_code"])
        assert deliveries == []
    finally:
        get_settings.cache_clear()


def test_smtp_rejection_invalidates_challenge_and_never_returns_the_code(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    monkeypatch: Any,
) -> None:
    register_user(client)
    monkeypatch.setenv("BEP_VIET_EMAIL_SMTP_HOST", "smtp.example.test")
    monkeypatch.setenv("BEP_VIET_EMAIL_SMTP_USERNAME", "smtp-user")
    monkeypatch.setenv("BEP_VIET_EMAIL_SMTP_PASSWORD", "smtp-password")
    monkeypatch.setenv("BEP_VIET_EMAIL_FROM_ADDRESS", "no-reply@example.test")
    monkeypatch.setenv("BEP_VIET_APP_ENV", "production")
    monkeypatch.setenv("BEP_VIET_JWT_SECRET", "production-test-secret-not-for-real-use")
    get_settings.cache_clear()

    def reject_send(*, recipient: str, code: str, purpose: str) -> None:
        raise EmailDeliveryError("provider rejection")

    monkeypatch.setattr(auth_router, "send_verification_email", reject_send)
    try:
        response = client.post(
            "/api/v1/auth/forgot-password", json={"email": "lan.nguyen@example.com"}
        )
        assert response.status_code == 503
        assert "development_code" not in response.json()
        with database_session_factory() as session:
            challenge = session.scalar(
                select(EmailOtpChallenge).where(EmailOtpChallenge.email == "lan.nguyen@example.com")
            )
            assert challenge is not None
            assert challenge.consumed_at is not None
            assert challenge.pending_password_hash is None
    finally:
        get_settings.cache_clear()


def test_refresh_cookie_rotates_and_logout_revokes_session(client: TestClient) -> None:
    register_user(client)
    refreshed = client.post("/api/v1/auth/refresh")
    assert refreshed.status_code == 200
    assert refreshed.json()["access_token"]
    assert refreshed.headers["cache-control"].startswith("no-store")

    logout = client.post("/api/v1/auth/logout")
    assert logout.status_code == 200
    assert client.post("/api/v1/auth/refresh").status_code == 401


def test_google_oauth_links_a_verified_user_and_creates_session(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    monkeypatch: Any,
) -> None:
    register_user(client, email="quyen@example.com")
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
    assert callback.headers["location"].endswith("/oauth-callback?status=success")

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
