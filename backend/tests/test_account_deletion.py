from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.modules.articles.models import Article
from app.modules.assistant.models import (
    AssistantConversation,
    AssistantMemory,
    AssistantMessage,
)
from app.modules.auth.models import User
from app.modules.auth.security import create_access_token
from app.modules.cooking.models import UserCookLog, UserCookTimer, UserPushSubscription
from app.modules.support.models import SupportTicket
from tests.helpers import PASSWORD, register_and_login

DELETE_URL = "/api/v1/account/delete"
CODE_URL = "/api/v1/account/delete/request-code"
OWNED_MODELS = (
    AssistantConversation,
    AssistantMemory,
    UserCookLog,
    UserCookTimer,
    UserPushSubscription,
)


def _user_id(factory: sessionmaker[Session], email: str) -> UUID:
    with factory() as session:
        user = session.scalar(select(User).where(User.email == email))
        assert user is not None
        return user.id


def _seed_personal_data(factory: sessionmaker[Session], email: str) -> None:
    user_id = _user_id(factory, email)
    now = datetime.now(UTC)
    with factory() as session:
        conversation = AssistantConversation(user_id=user_id, title="Bữa tối")
        session.add(conversation)
        session.flush()
        session.add(AssistantMessage(conversation_id=conversation.id, role="user", content="Hi"))
        session.add(AssistantMemory(user_id=user_id, content="Dị ứng tôm", kind="allergy"))
        session.add(
            UserCookLog(
                user_id=user_id,
                recipe_slug="pho-bo",
                recipe_name="Phở bò",
                image_path="/x.webp",
                servings=2,
                source="manual",
            )
        )
        session.add(
            UserCookTimer(
                user_id=user_id,
                label="Luộc",
                recipe_slug="pho-bo",
                return_path="/cook/pho-bo",
                started_at=now,
                due_at=now + timedelta(minutes=5),
            )
        )
        session.add(
            UserPushSubscription(
                user_id=user_id, endpoint=f"https://push.example/{email}", p256dh="k", auth="a"
            )
        )
        for state in ("published", "draft"):
            session.add(
                Article(
                    author_id=user_id,
                    slug=f"{state}-{email}",
                    title="Chuyện bếp",
                    excerpt="Ngắn",
                    body="Nội dung",
                    category="story",
                    status=state,
                )
            )
        session.add(
            SupportTicket(
                user_id=user_id, name="Lan", email=email, topic="other", subject="Hỏi", message="?"
            )
        )
        session.commit()


def _count(factory: sessionmaker[Session], model: type, user_id: UUID) -> int:
    with factory() as session:
        statement = select(func.count()).select_from(model).where(model.user_id == user_id)  # type: ignore[attr-defined]
        return int(session.scalar(statement) or 0)


def test_export_contains_only_own_data(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    lan = register_and_login(client, "lan@example.com")
    register_and_login(client, "mai@example.com")
    _seed_personal_data(database_session_factory, "mai@example.com")
    _seed_personal_data(database_session_factory, "lan@example.com")

    exported = client.get("/api/v1/account/export", headers=lan)
    assert exported.status_code == 200, exported.text
    body = exported.json()
    assert body["profile"]["email"] == "lan@example.com"
    assert len(body["assistant_memories"]) == 1
    assert len(body["cook_logs"]) == 1
    assert len(body["assistant_conversations"]) == 1
    assert "mai@example.com" not in str(body)
    assert "password_hash" not in str(body)
    assert PASSWORD not in str(body)
    assert client.get("/api/v1/account/export").status_code == 401


def test_delete_requires_auth_password_and_confirmation(client: TestClient) -> None:
    headers = register_and_login(client, "lan@example.com")
    assert client.post(DELETE_URL, json={"confirmation": "XÓA"}).status_code == 401
    wrong = client.post(
        DELETE_URL, headers=headers, json={"confirmation": "XÓA", "password": "sai-mat-khau"}
    )
    assert wrong.status_code == 401
    no_phrase = client.post(
        DELETE_URL, headers=headers, json={"confirmation": "ok", "password": PASSWORD}
    )
    assert no_phrase.status_code == 422
    # Tài khoản có mật khẩu không được lấy mã OTP để vượt qua bước nhập mật khẩu.
    assert client.post(CODE_URL, headers=headers).status_code == 401
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 200


def test_delete_removes_own_data_and_anonymizes_community_content(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    lan = register_and_login(client, "lan@example.com")
    mai = register_and_login(client, "mai@example.com")
    _seed_personal_data(database_session_factory, "lan@example.com")
    _seed_personal_data(database_session_factory, "mai@example.com")
    lan_id = _user_id(database_session_factory, "lan@example.com")
    mai_id = _user_id(database_session_factory, "mai@example.com")

    deleted = client.post(
        DELETE_URL, headers=lan, json={"confirmation": "XÓA", "password": PASSWORD}
    )
    assert deleted.status_code == 200, deleted.text

    assert client.get("/api/v1/auth/me", headers=lan).status_code == 401
    login = client.post(
        "/api/v1/auth/login", json={"email": "lan@example.com", "password": PASSWORD}
    )
    assert login.status_code in {400, 401}
    for model in OWNED_MODELS:
        assert _count(database_session_factory, model, lan_id) == 0
        assert _count(database_session_factory, model, mai_id) == 1
    with database_session_factory() as session:
        assert session.scalar(select(User).where(User.id == lan_id)) is None
        assert session.scalar(select(func.count()).select_from(AssistantMessage)) == 1
        lan_articles = session.scalars(
            select(Article).where(Article.slug.like("%lan@example.com"))
        ).all()
        assert [(item.status, item.author_id) for item in lan_articles] == [("published", None)]
        ticket = session.scalar(
            select(SupportTicket).where(SupportTicket.email == "lan@example.com")
        )
        assert ticket is not None and ticket.user_id is None
    assert client.get("/api/v1/auth/me", headers=mai).status_code == 200
    # Email đã xóa có thể đăng ký lại như tài khoản mới.
    register_and_login(client, "lan@example.com")


def _passwordless_user(factory: sessionmaker[Session], email: str) -> tuple[UUID, dict]:
    with factory() as session:
        user = User(email=email, full_name="Người Dùng Google")
        session.add(user)
        session.commit()
        token, _ = create_access_token(user_id=user.id, role="user", auth_version=0)
        return user.id, {"Authorization": f"Bearer {token}"}


def test_passwordless_account_deletes_with_own_email_code(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    user_id, headers = _passwordless_user(database_session_factory, "social@example.com")
    other_id, other = _passwordless_user(database_session_factory, "social2@example.com")

    missing = client.post(DELETE_URL, headers=headers, json={"confirmation": "XÓA"})
    assert missing.status_code == 400

    other_challenge = client.post(CODE_URL, headers=other)
    assert other_challenge.status_code == 200, other_challenge.text
    # Mã gửi cho tài khoản khác không dùng được để xóa tài khoản này.
    stolen = client.post(
        DELETE_URL,
        headers=headers,
        json={
            "confirmation": "XÓA",
            "challenge_id": other_challenge.json()["challenge_id"],
            "code": other_challenge.json()["development_code"],
        },
    )
    assert stolen.status_code == 400

    fresh = client.post(CODE_URL, headers=headers).json()
    deleted = client.post(
        DELETE_URL,
        headers=headers,
        json={
            "confirmation": "XÓA",
            "challenge_id": fresh["challenge_id"],
            "code": fresh["development_code"],
        },
    )
    assert deleted.status_code == 200, deleted.text
    with database_session_factory() as session:
        assert session.scalar(select(User).where(User.id == user_id)) is None
        assert session.scalar(select(User).where(User.id == other_id)) is not None
