from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.modules.auth.models import User

PASSWORD = "Test-Only-No-Login-2026!"
# PNG 1x1 hợp lệ, đủ để kiểm tra luồng tải ảnh mà không cần thư viện xử lý ảnh.
PNG_DATA_URL = (
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8"
    "z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def register_and_login(client: TestClient, email: str, full_name: str = "Nguyễn Ngọc Lan") -> dict:
    created = client.post(
        "/api/v1/auth/register",
        json={"full_name": full_name, "email": email, "password": PASSWORD},
    )
    assert created.status_code == 201, created.text
    return login(client, email)


def login(client: TestClient, email: str) -> dict:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def promote_to_admin(factory: sessionmaker[Session], email: str) -> None:
    with factory() as session:
        user = session.scalar(select(User).where(User.email == email))
        assert user is not None
        user.role = "admin"
        user.auth_version += 1
        session.commit()


def create_admin(client: TestClient, factory: sessionmaker[Session], email: str) -> dict:
    register_and_login(client, email, "Quản Trị Viên")
    promote_to_admin(factory, email)
    return login(client, email)
