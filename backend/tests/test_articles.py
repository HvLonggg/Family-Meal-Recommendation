from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from tests.helpers import PNG_DATA_URL, create_admin, register_and_login

STORY = {
    "title": "Nồi thịt kho Tết của bà ngoại",
    "excerpt": "Câu chuyện về nồi thịt kho trứng mỗi dịp Tết đến.",
    "body": (
        "Mỗi năm, bà ngoại luôn bắt đầu nồi thịt kho từ chiều hai mươi tám Tết. "
        "Thịt ba chỉ được chần sơ, kho cùng nước dừa tươi cho đến khi mềm và trong."
    ),
    "category": "kitchen_story",
    "recipe_slug": "thit-kho-trung",
}


def test_story_requires_moderation_before_publishing(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    author = register_and_login(client, "lan@example.com")
    created = client.post(
        "/api/v1/articles", headers=author, json={**STORY, "kind": "editorial", "submit": True}
    )
    assert created.status_code == 201, created.text
    story = created.json()
    assert story["status"] == "pending"
    assert story["kind"] == "story"
    assert story["slug"].startswith("noi-thit-kho-tet-cua-ba-ngoai")

    assert client.get("/api/v1/articles").json()["total"] == 0
    assert client.get(f"/api/v1/articles/{story['slug']}").status_code == 404
    assert client.get(f"/api/v1/articles/{story['slug']}", headers=author).status_code == 200

    admin = create_admin(client, database_session_factory, "admin@example.com")
    pending = client.get("/api/v1/admin/articles?status=pending", headers=admin).json()
    assert pending["total"] == 1

    approved = client.patch(
        f"/api/v1/admin/articles/{story['id']}/moderation",
        headers=admin,
        json={"status": "published"},
    )
    assert approved.json()["status"] == "published"
    assert approved.json()["published_at"] is not None

    public = client.get("/api/v1/articles?kind=story").json()
    assert public["total"] == 1
    assert public["data"][0]["author"]["full_name"] == "Nguyễn Ngọc Lan"


def test_author_can_edit_and_delete_own_story_only(client: TestClient) -> None:
    author = register_and_login(client, "lan@example.com")
    other = register_and_login(client, "ha@example.com", "Trần Thu Hà")
    story = client.post(
        "/api/v1/articles",
        headers=author,
        # Biểu mẫu giao diện gửi kèm cờ ảnh bìa và ảnh null cả khi tạo mới.
        json={**STORY, "submit": False, "remove_cover": False, "cover_image": None},
    ).json()
    assert story["status"] == "draft"

    forbidden = client.patch(f"/api/v1/articles/{story['id']}", headers=other, json=STORY)
    assert forbidden.status_code == 403
    assert client.get(f"/api/v1/articles/by-id/{story['id']}", headers=other).status_code == 404

    updated = client.patch(
        f"/api/v1/articles/{story['id']}",
        headers=author,
        json={**STORY, "title": "Nồi thịt kho của bà", "cover_image": PNG_DATA_URL},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["status"] == "pending"
    assert updated.json()["cover_url"]
    assert client.get(f"/api/v1{updated.json()['cover_url']}").status_code == 200

    mine = client.get("/api/v1/articles/mine", headers=author).json()
    assert [item["title"] for item in mine["data"]] == ["Nồi thịt kho của bà"]

    assert client.delete(f"/api/v1/articles/{story['id']}", headers=other).status_code == 403
    assert client.delete(f"/api/v1/articles/{story['id']}", headers=author).status_code == 204


def test_admin_articles_publish_directly_and_respect_privacy_setting(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    admin = create_admin(client, database_session_factory, "admin@example.com")
    editorial = client.post(
        "/api/v1/articles",
        headers=admin,
        json={**STORY, "kind": "editorial", "category": "tips"},
    ).json()
    assert editorial["status"] == "published"
    assert editorial["author"]["display"] == "editorial"

    author = register_and_login(client, "lan@example.com")
    client.put("/api/v1/account/preferences", headers=author, json={"show_name_on_stories": False})
    story = client.post("/api/v1/articles", headers=author, json=STORY).json()
    client.patch(
        f"/api/v1/admin/articles/{story['id']}/moderation",
        headers=admin,
        json={"status": "published"},
    )
    detail = client.get(f"/api/v1/articles/{story['slug']}").json()
    assert detail["author"]["display"] == "anonymous"
    assert detail["author"]["full_name"] == ""


def test_regular_user_cannot_moderate(client: TestClient) -> None:
    author = register_and_login(client, "lan@example.com")
    story = client.post("/api/v1/articles", headers=author, json=STORY).json()
    response = client.patch(
        f"/api/v1/admin/articles/{story['id']}/moderation",
        headers=author,
        json={"status": "published"},
    )
    assert response.status_code == 403
