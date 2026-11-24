"""Kiểm thử hồi quy cho các lỗi tìm thấy trong đợt rà soát bảo mật 2026-11-19."""

from datetime import timedelta
from typing import Any
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

import app.modules.auth.router as auth_router
from app.core.config import get_settings
from app.core.legal import CURRENT_TERMS_VERSION
from app.core.rate_limit import SlidingWindowLimiter
from app.modules.auth.models import AuthIdentity, RefreshSession, User
from app.modules.auth.oauth import OAuthProfile
from app.modules.auth.security import secure_compare, token_digest
from app.modules.auth.service import (
    InvalidTokenError,
    create_session_tokens,
    revoke_refresh_token,
    rotate_refresh_token,
    utc_now,
)
from tests.helpers import PASSWORD, register_and_login

EMAIL = "bao.mat@example.com"


def _user(session: Session, email: str = EMAIL) -> User:
    user = session.scalar(select(User).where(User.email == email))
    assert user is not None
    return user


def _age_revocation(session: Session, raw_token: str, seconds: int = 120) -> None:
    """Giả lập token đã bị thu hồi/xoay từ `seconds` giây trước (vượt khoảng ân hạn)."""
    record = session.scalar(
        select(RefreshSession).where(RefreshSession.token_hash == token_digest(raw_token))
    )
    assert record is not None and record.revoked_at is not None
    rotated = record.expires_at == record.revoked_at
    record.revoked_at = utc_now() - timedelta(seconds=seconds)
    if rotated:
        record.expires_at = record.revoked_at
    session.commit()


def test_reused_rotated_refresh_token_revokes_every_session(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    register_and_login(client, EMAIL)
    with database_session_factory() as session:
        user = _user(session)
        first = create_session_tokens(session, user)
        _, second = rotate_refresh_token(session, first.refresh_token)
        version_before = user.auth_version

        # Trong khoảng ân hạn (hai tab làm mới cùng lúc): chỉ từ chối, phiên mới vẫn dùng được.
        with pytest.raises(InvalidTokenError):
            rotate_refresh_token(session, first.refresh_token)
        _, third = rotate_refresh_token(session, second.refresh_token)
        assert _user(session).auth_version == version_before

        # Quá ân hạn mà token cũ vẫn bị dùng lại: coi là bị đánh cắp, thu hồi toàn bộ.
        _age_revocation(session, first.refresh_token)
        with pytest.raises(InvalidTokenError):
            rotate_refresh_token(session, first.refresh_token)
        with pytest.raises(InvalidTokenError):
            rotate_refresh_token(session, third.refresh_token)
        assert _user(session).auth_version == version_before + 1


def test_logged_out_token_reuse_does_not_sign_out_other_devices(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    register_and_login(client, EMAIL)
    with database_session_factory() as session:
        user = _user(session)
        laptop = create_session_tokens(session, user)
        phone = create_session_tokens(session, user)
        revoke_refresh_token(session, laptop.refresh_token)
        _age_revocation(session, laptop.refresh_token)

        with pytest.raises(InvalidTokenError):
            rotate_refresh_token(session, laptop.refresh_token)
        rotated_user, _ = rotate_refresh_token(session, phone.refresh_token)
        assert rotated_user.id == user.id


def _google_login(client: TestClient, monkeypatch: Any, *, email: str, subject: str) -> Any:
    monkeypatch.setenv("BEP_VIET_GOOGLE_CLIENT_ID", "google-client-id")
    monkeypatch.setenv("BEP_VIET_GOOGLE_CLIENT_SECRET", "google-client-secret")
    get_settings.cache_clear()

    async def fake_exchange_google_code(code: str) -> OAuthProfile:
        return OAuthProfile(provider="google", subject=subject, email=email, full_name="Chủ Thật")

    monkeypatch.setattr(auth_router, "exchange_google_code", fake_exchange_google_code)
    start = client.get("/api/v1/auth/oauth/google/start", follow_redirects=False)
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    return client.get(
        "/api/v1/auth/oauth/google/callback",
        params={"code": "authorization-code", "state": state},
        follow_redirects=False,
    )


def test_google_link_removes_credentials_set_before_email_was_verified(
    client: TestClient, database_session_factory: sessionmaker[Session], monkeypatch: Any
) -> None:
    # Kẻ tấn công đăng ký trước bằng email của nạn nhân (đăng ký không xác minh email).
    attacker_headers = register_and_login(client, EMAIL)

    callback = _google_login(client, monkeypatch, email=EMAIL, subject="victim-google-sub")
    assert callback.headers["location"].endswith("/oauth-callback?status=success")

    # Mật khẩu và access token của người tạo trước không còn dùng được.
    login = client.post("/api/v1/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert login.status_code == 401
    assert client.get("/api/v1/auth/me", headers=attacker_headers).status_code == 401
    # Chủ thật vẫn vào được bằng phiên Google vừa tạo.
    assert client.post("/api/v1/auth/refresh").status_code == 200

    with database_session_factory() as session:
        user = _user(session)
        assert user.password_hash is None
        assert user.email_verified_at is not None
        providers = set(
            session.scalars(select(AuthIdentity.provider).where(AuthIdentity.user_id == user.id))
        )
        assert providers == {"google"}
    get_settings.cache_clear()


def test_google_link_keeps_password_of_an_already_verified_account(
    client: TestClient, database_session_factory: sessionmaker[Session], monkeypatch: Any
) -> None:
    register_and_login(client, EMAIL)
    with database_session_factory() as session:
        _user(session).email_verified_at = utc_now()
        session.commit()

    callback = _google_login(client, monkeypatch, email=EMAIL, subject="owner-google-sub")
    assert callback.headers["location"].endswith("/oauth-callback?status=success")
    login = client.post("/api/v1/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert login.status_code == 200
    get_settings.cache_clear()


def test_oauth_callback_with_non_ascii_state_fails_closed(
    client: TestClient, monkeypatch: Any
) -> None:
    monkeypatch.setenv("BEP_VIET_GOOGLE_CLIENT_ID", "google-client-id")
    monkeypatch.setenv("BEP_VIET_GOOGLE_CLIENT_SECRET", "google-client-secret")
    get_settings.cache_clear()
    client.get("/api/v1/auth/oauth/google/start", follow_redirects=False)

    callback = client.get(
        "/api/v1/auth/oauth/google/callback",
        params={"code": "authorization-code", "state": "trạng-thái-giả"},
        follow_redirects=False,
    )
    assert callback.status_code == 303
    assert callback.headers["location"].endswith("/oauth-callback?status=error")
    assert secure_compare("é", "é") and not secure_compare("é", "e")
    get_settings.cache_clear()


def test_registration_is_rate_limited_per_ip(client: TestClient, monkeypatch: Any) -> None:
    monkeypatch.setattr(
        auth_router, "REGISTRATIONS_PER_IP", SlidingWindowLimiter(limit=2, window_seconds=3600)
    )
    for index in range(2):
        register_and_login(client, f"spam{index}@example.com")
    blocked = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Người Thứ Ba",
            "email": "spam3@example.com",
            "password": PASSWORD,
            "accepted_terms_version": CURRENT_TERMS_VERSION,
        },
    )
    assert blocked.status_code == 429
    assert blocked.json()["code"] == "REGISTRATION_RATE_LIMITED"


def test_sliding_window_limiter_does_not_grow_without_bound() -> None:
    limiter = SlidingWindowLimiter(limit=1, window_seconds=10, max_keys=100)
    for index in range(1000):
        limiter.hit(f"email-{index}@example.com", now=float(index))
    assert limiter.size() <= 100
    # Chỉ hỏi trạng thái không được tạo thêm khóa mới.
    assert limiter.blocked("unknown@example.com", now=1000.0) is False
    assert limiter.size() <= 100
    # Khóa vẫn còn trong cửa sổ thì vẫn bị chặn.
    assert limiter.blocked("email-999@example.com", now=1000.0) is True
