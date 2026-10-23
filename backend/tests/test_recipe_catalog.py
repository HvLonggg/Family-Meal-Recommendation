from pathlib import Path

from fastapi.testclient import TestClient
from pytest import MonkeyPatch
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.modules.recipes.models import Recipe, RecipeIngredient, RecipeStep
from app.modules.recipes.search import bilingual_search_text, matches_search
from app.scripts import import_recipe_catalog as importer


def test_catalog_import_is_complete_and_idempotent(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    items = importer.read_catalog()
    with database_session_factory() as session:
        importer.import_legacy_recipes(session)
        original_id = session.scalar(select(Recipe.id).where(Recipe.slug == "suon-xao-chua-ngot"))
        first = importer.import_catalog(session, items)
        session.commit()
        counts = [
            session.scalar(select(func.count()).select_from(model))
            for model in (Recipe, RecipeIngredient, RecipeStep)
        ]
        second = importer.import_catalog(session, items)
        session.commit()
        assert first == {"created": 296, "updated": 4}
        assert second == {"created": 0, "updated": 300}
        assert counts == [
            session.scalar(select(func.count()).select_from(model))
            for model in (Recipe, RecipeIngredient, RecipeStep)
        ]
        assert counts[0] == 304
        tofu = session.scalar(select(Recipe).where(Recipe.slug == "dau-hu-sot-ca-chua"))
        assert tofu is not None
        assert "Đậu hũ sốt cà chua" in tofu.content["aliases"]
        assert (
            session.scalar(select(Recipe.id).where(Recipe.slug == "suon-xao-chua-ngot"))
            == original_id
        )
        assert (
            session.scalar(
                select(func.count()).select_from(Recipe).where(Recipe.catalog_id.is_not(None))
            )
            == 300
        )

    payloads = [
        client.get("/api/v1/recipes/catalog", params={"offset": offset}).json()
        for offset in range(0, 304, 100)
    ]
    recipes = [recipe for payload in payloads for recipe in payload["data"]]
    assert len(recipes) == len({recipe["slug"] for recipe in recipes}) == 304
    for recipe in recipes:
        assert recipe["ingredients"] and recipe["steps"] and recipe["serving"]
    bun_cha = client.get("/api/v1/recipes/bun-cha-ha-noi").json()
    assert bun_cha["catalog_id"] == "BV210"
    assert "chấm" in bun_cha["serving"]
    assert bun_cha["content"]["scaling"]["targets"]
    assert bun_cha["content"]["finished_dish"]

    result = client.get("/api/v1/recipes", params={"q": "RAU muong TOI", "region": "Bắc"})
    assert "rau-muong-xao-toi" in [recipe["slug"] for recipe in result.json()["data"]]
    result = client.get("/api/v1/recipes", params={"q": "la tra xanh"})
    assert "ca-chep-kho-rieng" in [recipe["slug"] for recipe in result.json()["data"]]
    assert client.get("/api/v1/recipes", params={"q": "zzzzkhongcomon"}).json()["total"] == 0
    result = client.get("/api/v1/recipes", params={"q": "bun cha"})
    slugs = [recipe["slug"] for recipe in result.json()["data"]]
    assert "bun-cha-ha-noi" in slugs
    assert "ga-rang-gung" not in slugs


def test_document_images_match_every_catalog_id(tmp_path: Path, monkeypatch: MonkeyPatch) -> None:
    # Use a temporary image directory; importing tests must not modify application assets.
    monkeypatch.setattr(importer, "IMAGE_DIRECTORY", tmp_path)
    images = importer.extract_document_images(importer.DOCUMENT, importer.read_catalog())
    assert len(images) == 300
    assert set(images) == {f"BV{i:03}" for i in range(1, 301)}
    assert all((tmp_path / Path(path).name).stat().st_size > 1000 for path in images.values())


def test_search_requires_matching_words() -> None:
    assert matches_search("CA", "Cá chép kho riềng")
    assert not matches_search("ca", "Canh rau ngót")
    assert matches_search("dau phu", "Đậu phụ sốt cà chua")
    assert not matches_search("rau zzzz", "Rau muống xào tỏi")
    assert not matches_search("!!!", "Rau muống")
    assert matches_search("ca cheep kho rieng", "Cá chép kho riềng")
    assert matches_search(
        "carp braised with galangal",
        bilingual_search_text("ca-chep-kho-rieng", "Cá chép kho riềng"),
    )
    assert matches_search("muop dang sao trung", "Mướp đắng xào trứng")
    assert matches_search("bau sao trung", "Bầu xào trứng")
    assert not matches_search("bau sao trung", "Mướp đắng xào trứng")
    assert not matches_search("muop dang sao trung", "Bầu xào trứng")
