from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.modules.recipes.models import Recipe, RecipeIngredient, RecipeStep


def seed_recipe(database_session_factory: sessionmaker[Session]) -> None:
    with database_session_factory() as session:
        recipe = Recipe(
            slug="ca-chep-kho-rieng",
            name="Cá chép kho riềng",
            excerpt="Món cá kho quen thuộc trong bữa cơm miền Bắc.",
            region="Bắc",
            category="Món mặn",
            difficulty="Dễ",
            prep_minutes=20,
            cook_minutes=40,
            base_servings=4,
            image_path="/assets/recipes/ca-chep-kho-rieng.jpg",
            image_alt="Nồi cá chép kho riềng",
            serving="Dùng nóng cùng cơm trắng.",
            tip="Kho lửa nhỏ để cá không vỡ.",
            source_name="Món Ngon Mỗi Ngày",
            source_url="https://monngonmoingay.com/ca-chep-kho-rieng/",
            status="published",
        )
        recipe.ingredients.append(
            RecipeIngredient(
                group_name="Nguyên liệu chính",
                name="Cá chép",
                amount=Decimal("700"),
                unit="g",
                scalable=True,
                position=1,
            )
        )
        recipe.steps.append(
            RecipeStep(step_type="so_che", content="Làm sạch cá và để ráo.", position=1)
        )
        session.add(recipe)
        session.commit()


def test_recipe_list_supports_vietnamese_filter(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed_recipe(database_session_factory)

    response = client.get("/api/v1/recipes", params={"q": "cá", "region": "Bắc"})

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["data"][0]["slug"] == "ca-chep-kho-rieng"


def test_recipe_detail_returns_normalized_ingredients_and_steps(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed_recipe(database_session_factory)

    response = client.get("/api/v1/recipes/ca-chep-kho-rieng")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ingredients"][0]["name"] == "Cá chép"
    assert payload["ingredients"][0]["amount"] == "700.00"
    assert payload["steps"][0]["step_type"] == "so_che"


def test_recipe_tables_use_vietnamese_database_names() -> None:
    assert Recipe.__tablename__ == "mon_an"
    assert RecipeIngredient.__tablename__ == "nguyen_lieu_mon_an"
    assert RecipeStep.__tablename__ == "buoc_nau_mon_an"


def test_recipe_catalog_paginates_in_sql_with_stable_order_and_total(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    with database_session_factory() as session:
        for index in range(5):
            session.add(
                Recipe(
                    slug=f"mon-{index}",
                    name=f"Món {index}",
                    excerpt="Món thử phân trang.",
                    region="Bắc",
                    category="Món mặn",
                    difficulty="Dễ",
                    prep_minutes=5,
                    cook_minutes=5,
                    base_servings=2,
                    image_path="/images/x.webp",
                    image_alt="Ảnh",
                    serving="Dùng nóng.",
                    tip="Mẹo.",
                    source_name="Bếp Việt",
                    source_url="https://example.com/",
                    status="published" if index < 4 else "draft",
                )
            )
        session.commit()

    pages = [
        client.get("/api/v1/recipes/catalog", params={"limit": 3, "offset": offset}).json()
        for offset in (0, 3)
    ]

    assert [page["total"] for page in pages] == [4, 4]
    slugs = [item["slug"] for page in pages for item in page["data"]]
    assert slugs == ["mon-0", "mon-1", "mon-2", "mon-3"]
    listed = client.get("/api/v1/recipes", params={"limit": 2, "offset": 1}).json()
    assert listed["total"] == 4
    assert [item["slug"] for item in listed["data"]] == ["mon-1", "mon-2"]


def test_recipe_catalog_compact_keeps_only_fields_the_web_app_reads(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed_recipe(database_session_factory)
    with database_session_factory() as session:
        recipe = session.query(Recipe).one()
        recipe.content = {
            "aliases": ["Cá kho"],
            "tags": {"cooking_method": ["kho"]},
            "description": "Mô tả dài không dùng trong app.",
            "preparation_steps": [{"step": 1, "instruction": "Trùng với bảng bước làm."}],
            "ingredients": [
                {"name": "Cá chép", "quantity": 700, "scaling_rule": "linear", "notes": "x"}
            ],
            "media": [
                {
                    "source": "Nguồn",
                    "page_url": "https://e.x/",
                    "rights_status": "project",
                    "alt_text": "bỏ",
                    "width": 1,
                },
                {"source": "Ảnh 2"},
            ],
            "scaling": {
                "targets": [{"servings": 2, "seasoning_start_factor": 0.5, "instruction": "bỏ"}]
            },
            "suggested_pairings": [{"id": "BV2", "name": "Canh"}],
        }
        session.commit()

    full = client.get("/api/v1/recipes/catalog").json()["data"][0]
    compact_response = client.get("/api/v1/recipes/catalog", params={"compact": "true"})
    compact = compact_response.json()["data"][0]

    assert "description" in full["content"]
    assert compact_response.headers["etag"] != client.get("/api/v1/recipes/catalog").headers["etag"]
    assert compact["content"] == {
        "aliases": ["Cá kho"],
        "tags": {"cooking_method": ["kho"]},
        "ingredients": [{"name": "Cá chép", "scaling_rule": "linear"}],
        "media": [{"source": "Nguồn", "page_url": "https://e.x/", "rights_status": "project"}],
        "scaling": {"targets": [{"servings": 2, "seasoning_start_factor": 0.5}]},
        "suggested_pairings": [{"id": "BV2"}],
    }
    assert {key: value for key, value in compact.items() if key != "content"} == {
        key: value for key, value in full.items() if key != "content"
    }
