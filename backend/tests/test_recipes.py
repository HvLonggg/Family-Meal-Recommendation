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
