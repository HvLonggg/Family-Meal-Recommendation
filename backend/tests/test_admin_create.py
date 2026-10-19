import base64
from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw
from sqlalchemy.orm import Session, sessionmaker

from tests.helpers import PASSWORD, PNG_DATA_URL, create_admin, register_and_login


def _data_url(image: Image.Image, fmt: str = "PNG") -> str:
    buffer = BytesIO()
    image.save(buffer, fmt)
    mime = "image/png" if fmt == "PNG" else "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(buffer.getvalue()).decode()}"


def _cutout_data_url() -> str:
    image = Image.new("RGBA", (640, 480), (0, 0, 0, 0))
    ImageDraw.Draw(image).ellipse((140, 120, 500, 380), fill=(196, 92, 52, 255))
    return _data_url(image)


def _recipe_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "name": "Gà kho gừng",
        "excerpt": "Gà kho gừng thơm ấm, đậm đà cho bữa cơm gia đình.",
        "region": "Bắc",
        "category": "Món mặn",
        "difficulty": "Dễ",
        "prep_minutes": 15,
        "cook_minutes": 30,
        "base_servings": 4,
        "status": "published",
        "image": _cutout_data_url(),
        "ingredients": [
            {"name": "Thịt gà", "amount": "500", "unit": "g"},
            {"group_name": "Gia vị", "name": "Gừng", "amount": "30", "unit": "g"},
            {"group_name": "Gia vị", "name": "Nước mắm", "amount": "2", "unit": "muỗng canh"},
        ],
        "preparation_steps": ["Chặt gà miếng vừa ăn, gừng thái sợi."],
        "cooking_steps": ["Ướp gà với gừng và nước mắm.", "Kho lửa nhỏ 25 phút."],
    }
    payload.update(overrides)
    return payload


def test_admin_creates_recipe_that_reaches_catalog_and_shopping_list(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    admin = create_admin(client, database_session_factory, "admin@example.com")
    created = client.post("/api/v1/admin/recipes", headers=admin, json=_recipe_payload())
    assert created.status_code == 201, created.text
    recipe = created.json()
    assert recipe["slug"] == "ga-kho-gung"
    assert recipe["image_path"].startswith("/api/v1/recipes/ga-kho-gung/image?v=")

    image = client.get(recipe["image_path"])
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/webp"
    with Image.open(BytesIO(image.content)) as stored:
        assert stored.size == (1600, 900)
        assert stored.mode == "RGBA"
        assert stored.getpixel((0, 0))[3] == 0

    detail = client.get("/api/v1/recipes/ga-kho-gung").json()
    assert [step["content"] for step in detail["steps"]][0].startswith("Chặt gà")
    assert len(detail["ingredients"]) == 3
    assert client.get("/api/v1/recipes?q=ga kho gung").json()["total"] == 1

    again = client.post("/api/v1/admin/recipes", headers=admin, json=_recipe_payload())
    assert again.json()["slug"] == "ga-kho-gung-2"

    member = register_and_login(client, "lan@example.com")
    planned = client.post(
        "/api/v1/planner/items",
        headers=member,
        json={
            "recipe_slug": "ga-kho-gung",
            "plan_date": "2026-10-20",
            "meal_type": "dinner",
            "servings": 4,
        },
    )
    assert planned.status_code == 201, planned.text
    shopping = client.get(
        "/api/v1/planner/shopping-list?period=day&date=2026-10-20", headers=member
    ).json()
    categories = {item["name"]: item["category"] for item in shopping["items"]}
    assert categories == {"Thịt gà": "ingredient", "Gừng": "ingredient", "Nước mắm": "seasoning"}


def test_recipe_image_must_be_a_cutout(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    admin = create_admin(client, database_session_factory, "admin@example.com")
    opaque = _data_url(Image.new("RGB", (640, 480), (230, 210, 190)), "JPEG")
    rejected = client.post(
        "/api/v1/admin/recipes", headers=admin, json=_recipe_payload(image=opaque)
    )
    assert rejected.status_code == 400
    assert "tách nền" in rejected.json()["message"]
    blank_steps = client.post(
        "/api/v1/admin/recipes", headers=admin, json=_recipe_payload(cooking_steps=["   "])
    )
    assert blank_steps.status_code == 422
    member = register_and_login(client, "lan@example.com")
    assert (
        client.post("/api/v1/admin/recipes", headers=member, json=_recipe_payload()).status_code
        == 403
    )
    assert PNG_DATA_URL  # ảnh 1x1 không trong suốt cũng bị từ chối
    tiny = client.post(
        "/api/v1/admin/recipes", headers=admin, json=_recipe_payload(image=PNG_DATA_URL)
    )
    assert tiny.status_code == 400


def test_admin_creates_user_accounts(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    admin = create_admin(client, database_session_factory, "admin@example.com")
    created = client.post(
        "/api/v1/admin/users",
        headers=admin,
        json={"full_name": "  Trần   Thu  ", "email": "Thu@Example.com", "password": PASSWORD},
    )
    assert created.status_code == 201, created.text
    assert created.json()["email"] == "thu@example.com"
    assert created.json()["full_name"] == "Trần Thu"
    assert created.json()["role"] == "user"
    signed_in = client.post(
        "/api/v1/auth/login", json={"email": "thu@example.com", "password": PASSWORD}
    )
    assert signed_in.status_code == 200

    duplicate = client.post(
        "/api/v1/admin/users",
        headers=admin,
        json={"full_name": "Trùng", "email": "thu@example.com", "password": PASSWORD},
    )
    assert duplicate.status_code == 409
    weak = client.post(
        "/api/v1/admin/users",
        headers=admin,
        json={"full_name": "Yếu", "email": "yeu@example.com", "password": "abcdefgh"},
    )
    assert weak.status_code == 422
    staff = client.post(
        "/api/v1/admin/users",
        headers=admin,
        json={
            "full_name": "Biên tập viên",
            "email": "staff@example.com",
            "password": PASSWORD,
            "role": "admin",
        },
    )
    assert staff.json()["role"] == "admin"
