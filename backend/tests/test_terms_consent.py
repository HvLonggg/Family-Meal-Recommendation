import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.core.legal import CURRENT_TERMS_VERSION
from app.modules.auth.models import User
from app.modules.auth.security import create_access_token
from tests.helpers import PASSWORD, register_and_login

FRONTEND_LEGAL = (
    Path(__file__).resolve().parents[2] / "frontend" / "src" / "pages" / "legal" / "legalTypes.ts"
)


def _register(client: TestClient, **extra: object):
    return client.post(
        "/api/v1/auth/register",
        json={"full_name": "Nguyễn Lan", "email": "lan@example.com", "password": PASSWORD, **extra},
    )


def test_registration_requires_current_terms_version(client: TestClient) -> None:
    assert _register(client).status_code == 422
    assert _register(client, accepted_terms_version="0.1").status_code == 422


def test_registration_records_consent_and_exposes_it(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    headers = register_and_login(client, "lan@example.com")
    me = client.get("/api/v1/auth/me", headers=headers).json()
    assert me["terms_version"] == CURRENT_TERMS_VERSION
    assert me["terms_accepted_at"] is not None
    with database_session_factory() as session:
        user = session.scalar(select(User).where(User.email == "lan@example.com"))
        assert user is not None and user.terms_accepted_at is not None


def test_social_account_accepts_terms_explicitly(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    with database_session_factory() as session:
        user = User(email="social@example.com", full_name="Người Dùng Google")
        session.add(user)
        session.commit()
        token, _ = create_access_token(user_id=user.id, role="user", auth_version=0)
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/v1/auth/me", headers=headers).json()["terms_version"] is None

    url = "/api/v1/account/accept-terms"
    assert client.post(url, json={"version": CURRENT_TERMS_VERSION}).status_code == 401
    assert client.post(url, headers=headers, json={"version": "0.1"}).status_code == 422
    accepted = client.post(url, headers=headers, json={"version": CURRENT_TERMS_VERSION})
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["terms_version"] == CURRENT_TERMS_VERSION
    assert accepted.json()["terms_accepted_at"] is not None


def test_frontend_legal_version_matches_backend() -> None:
    if not FRONTEND_LEGAL.exists():
        pytest.skip("frontend sources not available")
    match = re.search(r"LEGAL_VERSION = '([^']+)'", FRONTEND_LEGAL.read_text(encoding="utf-8"))
    assert match is not None
    assert match.group(1) == CURRENT_TERMS_VERSION
