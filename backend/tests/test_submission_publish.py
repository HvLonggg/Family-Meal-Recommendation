from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.modules.submissions.service import PLACEHOLDER_IMAGE_PATH
from tests.helpers import create_admin, register_and_login


def _catalog_slugs(client: TestClient) -> list[str]:
    response = client.get("/api/v1/recipes/catalog?compact=1")
    assert response.status_code == 200, response.text
    return [item["slug"] for item in response.json()["data"]]


def test_name_only_submission_is_accepted(client: TestClient) -> None:
    member = register_and_login(client, "lan@example.com")
    created = client.post("/api/v1/submissions", headers=member, json={"name": "  Bánh đúc nóng "})
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["name"] == "Bánh đúc nóng"
    assert body["status"] == "pending"
    assert (body["story"], body["ingredients"], body["steps"]) == ("", "", "")
    assert body["recipe_slug"] is None


def test_submission_still_rejects_bad_input(client: TestClient) -> None:
    member = register_and_login(client, "lan@example.com")
    for payload in (
        {"name": " a "},
        {"name": "Bánh đúc", "story": "x" * 3001},
        {"name": "Bánh đúc", "steps": "x" * 8001},
        {"name": "Bánh đúc", "image": "data:image/png;base64,AAAA"},
    ):
        response = client.post("/api/v1/submissions", headers=member, json=payload)
        assert response.status_code == 422, payload


def test_submission_writes_are_rate_limited(client: TestClient) -> None:
    member = register_and_login(client, "lan@example.com")
    for index in range(20):
        response = client.post(
            "/api/v1/submissions", headers=member, json={"name": f"Món số {index}"}
        )
        assert response.status_code == 201
    blocked = client.post("/api/v1/submissions", headers=member, json={"name": "Món thừa"})
    assert blocked.status_code == 429


def test_approving_minimal_submission_publishes_recipe(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    member = register_and_login(client, "lan@example.com")
    submission = client.post(
        "/api/v1/submissions", headers=member, json={"name": "Bánh đúc nóng"}
    ).json()
    admin = create_admin(client, database_session_factory, "admin@example.com")
    before = _catalog_slugs(client)

    reviewed = client.patch(
        f"/api/v1/admin/submissions/{submission['id']}",
        headers=admin,
        json={"status": "approved"},
    )
    assert reviewed.status_code == 200, reviewed.text
    slug = reviewed.json()["recipe_slug"]
    assert slug == "banh-duc-nong"

    detail = client.get(f"/api/v1/recipes/{slug}").json()
    assert detail["image_path"] == PLACEHOLDER_IMAGE_PATH
    assert detail["ingredients"] == []
    assert detail["steps"] == []
    assert detail["prep_minutes"] == 0 and detail["cook_minutes"] == 0
    assert detail["excerpt"]

    # Phiên bản kho đổi nên bộ đệm catalog trả danh sách mới có món vừa duyệt.
    after = _catalog_slugs(client)
    assert slug not in before and slug in after
    assert len(after) == len(before) + 1

    mine = client.get("/api/v1/submissions/mine", headers=member).json()
    assert mine["data"][0]["recipe_slug"] == slug

    # Duyệt lại không tạo món trùng; rút duyệt thì ẩn món khỏi kho.
    client.patch(
        f"/api/v1/admin/submissions/{submission['id']}", headers=admin, json={"status": "approved"}
    )
    assert _catalog_slugs(client).count(slug) == 1
    client.patch(
        f"/api/v1/admin/submissions/{submission['id']}", headers=admin, json={"status": "rejected"}
    )
    assert slug not in _catalog_slugs(client)
    assert client.get(f"/api/v1/recipes/{slug}").status_code == 404


def test_approval_maps_available_fields_and_keeps_slug_unique(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    member = register_and_login(client, "lan@example.com")
    admin = create_admin(client, database_session_factory, "admin@example.com")
    payload = {
        "name": "Canh cua rau đay",
        "region": "Bắc",
        "category": "Món canh",
        "servings": 3,
        "total_minutes": 40,
        "story": "Món canh mát lành của mẹ.",
        "ingredients": "300 g cua đồng\n1 bó rau đay",
        "steps": "Giã cua, lọc lấy nước.\nĐun nhỏ lửa cho riêu nổi.",
    }
    slugs = []
    for _ in range(2):
        item = client.post("/api/v1/submissions", headers=member, json=payload).json()
        reviewed = client.patch(
            f"/api/v1/admin/submissions/{item['id']}", headers=admin, json={"status": "approved"}
        ).json()
        slugs.append(reviewed["recipe_slug"])
    assert slugs == ["canh-cua-rau-day", "canh-cua-rau-day-2"]

    detail = client.get("/api/v1/recipes/canh-cua-rau-day").json()
    assert detail["region"] == "Bắc" and detail["category"] == "Món canh"
    assert detail["base_servings"] == 3 and detail["cook_minutes"] == 40
    assert detail["excerpt"] == "Món canh mát lành của mẹ."
    assert [item["name"] for item in detail["ingredients"]] == ["300 g cua đồng", "1 bó rau đay"]
    assert [step["content"] for step in detail["steps"]] == [
        "Giã cua, lọc lấy nước.",
        "Đun nhỏ lửa cho riêu nổi.",
    ]
    assert all(step["step_type"] == "thuc_hien" for step in detail["steps"])
