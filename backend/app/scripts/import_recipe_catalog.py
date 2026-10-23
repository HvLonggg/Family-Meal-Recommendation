"""Import the supplied Bếp Việt catalog without changing existing recipe IDs."""

import argparse
import json
import re
import shutil
import xml.etree.ElementTree as ET
from decimal import Decimal
from pathlib import Path
from typing import Any
from zipfile import ZipFile

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.modules.recipes.models import Recipe, RecipeIngredient, RecipeStep
from app.modules.recipes.schemas import RecipeDetailResponse
from app.modules.recipes.search import normalize_search

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "BEP_VIET_300_recipes.json"
DOCUMENT = ROOT / "BEP_VIET_300_mon_Viet.docx"
IMAGE_DIRECTORY = ROOT / "frontend/public/images/recipes"
GENERATED_IMAGE_DIRECTORY = ROOT / "frontend/public/images/recipes-owned"
GENERATED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
SUPPLEMENTAL_DESSERT_SOURCE = ROOT / "backend/app/data/fruit_dessert_recipes.json"
CURATED_RECIPE_BATCH_DIRECTORY = ROOT / "backend/app/data/curated_recipe_batches"
SERVING_OVERRIDES: dict[str, str] = json.loads(
    (ROOT / "backend/app/data/serving_overrides.json").read_text(encoding="utf-8")
)
SLUG_OVERRIDES = {
    "BV005": "suon-xao-chua-ngot",
    "BV117": "rau-muong-xao-toi",
    "BV210": "bun-cha-ha-noi",
    "BV248": "dau-hu-sot-ca-chua",
}
LEGACY_IMAGES = {
    "ca-chep-kho-rieng": "recipes/ca-chep-kho-rieng.jpg",
    "suon-xao-chua-ngot": "recipes/suon-xao-chua-ngot.jpg",
    "canh-chua-ca": "recipes/canh-chua-ca.jpg",
    "trung-chien-rau-cu": "recipes/trung-chien-rau-cu.jpg",
    "rau-muong-xao-toi": "recipes/rau-muong-xao-toi-cc0.jpg",
    "dau-hu-sot-ca-chua": "recipes/dau-hu-sot-ca-chua-cc-by-sa.jpg",
    "bun-cha-ha-noi": "auth/bun-cha-pho-hoi.webp",
    "pho-ga-gia-dinh": "auth/pho-bep-nha.webp",
}


def recipe_slug(item: dict[str, Any]) -> str:
    if item.get("slug"):
        return str(item["slug"])
    if item["name"] == "Phở gà":
        return "pho-ga-gia-dinh"
    return SLUG_OVERRIDES.get(item["id"], normalize_search(item["name"]).replace(" ", "-"))


def recipe_category(item: dict[str, Any]) -> str:
    category = item["category"]
    if category == "Canh":
        return "Món canh"
    if category == "Rau và nấm":
        return "Món rau"
    if category in {"Bún, phở, mì và miến", "Cháo"}:
        return "Món nước"
    if category == "Bánh, chè và ăn nhẹ":
        return "Món tráng miệng"
    if category in {"Cơm và xôi", "Bánh và ăn sáng", "Bánh mì và ăn sáng"}:
        return "Món ăn sáng"
    if category in {"Nộm, gỏi và dưa muối", "Món cuốn", "Món ăn cùng cơm"}:
        return "Món ăn kèm"
    tags = item.get("tags", {})
    meal_types = tags.get("meal_type", []) if isinstance(tags, dict) else []
    dish_types = tags.get("dish_type", []) if isinstance(tags, dict) else []
    meal_types = meal_types if isinstance(meal_types, list) else [meal_types]
    dish_types = dish_types if isinstance(dish_types, list) else [dish_types]
    if (
        category == "Món tráng miệng"
        or "Bánh, chè và ăn nhẹ" in category
        or any(isinstance(value, str) and "tráng miệng" in value.casefold() for value in meal_types)
        or any(isinstance(value, str) and "món ngọt" in value.casefold() for value in dish_types)
    ):
        return "Món tráng miệng"
    if any("chay" in tag.casefold() for tag in recipe_tag_values(item)):
        return "Món chay"
    if any(token in category.casefold() for token in ("ăn vặt", "ăn nhẹ", "bánh truyền thống", "món chiên", "dân dã")):
        return "Món ăn vặt"
    return "Món mặn"


def recipe_tag_values(item: dict[str, Any]) -> list[str]:
    tags = item.get("tags", {})
    if isinstance(tags, list):
        return [tag for tag in tags if isinstance(tag, str)]
    if isinstance(tags, dict):
        return [
            value
            for values in tags.values()
            if isinstance(values, list)
            for value in values
            if isinstance(value, str)
        ]
    return []


def normalized_recipe_tags(item: dict[str, Any]) -> dict[str, Any]:
    tags = item.get("tags", {})
    if isinstance(tags, list):
        return {"keywords": [tag for tag in tags if isinstance(tag, str)]}
    return tags if isinstance(tags, dict) else {}


def read_catalog(source: Path = SOURCE) -> list[dict[str, Any]]:
    payload = json.loads(source.read_text(encoding="utf-8"))
    items: list[dict[str, Any]] = payload["recipes"]
    ids = {item["id"] for item in items}
    if len(items) != 300 or ids != {f"BV{i:03}" for i in range(1, 301)}:
        raise ValueError("Expected exactly 300 unique catalog IDs BV001–BV300.")
    slugs = [recipe_slug(item) for item in items]
    if len(set(slugs)) != len(slugs):
        raise ValueError("Catalog contains duplicate recipe slugs.")
    for item in items:
        for key in (
            "name",
            "description",
            "ingredients",
            "preparation_steps",
            "cooking_steps",
            "finished_dish",
            "serving",
            "tips",
            "media",
            "sources",
        ):
            if not item.get(key):
                raise ValueError(f"{item['id']}: missing {key}.")
        if any(ingredient["quantity"] <= 0 for ingredient in item["ingredients"]):
            raise ValueError(f"{item['id']}: invalid ingredient quantity.")
        if item["total_time"] != item["prep_time"] + item["cook_time"] + item["passive_time"]:
            raise ValueError(f"{item['id']}: inconsistent total time.")
        if any(pair["id"] not in ids for pair in item["suggested_pairings"]):
            raise ValueError(f"{item['id']}: unknown pairing.")
    return items


def read_supplemental_desserts(source: Path = SUPPLEMENTAL_DESSERT_SOURCE) -> list[dict[str, Any]]:
    payload = json.loads(source.read_text(encoding="utf-8"))
    items: list[dict[str, Any]] = payload["recipes"]
    expected = {f"BV{i:03}" for i in range(301, 331)}
    ids = {item["id"] for item in items}
    if len(items) != 30 or ids != expected:
        raise ValueError("Expected 30 unique supplemental dessert IDs BV301–BV330.")
    slugs = [recipe_slug(item) for item in items]
    if len(set(slugs)) != len(slugs):
        raise ValueError("Supplemental dessert catalog contains duplicate slugs.")
    for item in items:
        for key in (
            "name",
            "description",
            "ingredients",
            "preparation_steps",
            "cooking_steps",
            "finished_dish",
            "serving",
            "tips",
            "media",
            "sources",
        ):
            if not item.get(key):
                raise ValueError(f"{item['id']}: missing {key}.")
        if any(ingredient["quantity"] <= 0 for ingredient in item["ingredients"]):
            raise ValueError(f"{item['id']}: invalid ingredient quantity.")
        if item["total_time"] != item["prep_time"] + item["cook_time"] + item["passive_time"]:
            raise ValueError(f"{item['id']}: inconsistent total time.")
        if not item["media"][0]["image_url"].startswith("/images/recipes/edited/"):
            raise ValueError(f"{item['id']}: expected a Bếp Việt-owned image path.")
    return items


def read_curated_recipe_batches(
    directory: Path = CURATED_RECIPE_BATCH_DIRECTORY,
) -> list[dict[str, Any]]:
    """Read fact-checked additions in numbered batches without changing the original IDs."""
    items: list[dict[str, Any]] = []
    for source in sorted(directory.glob("batch_*.json")):
        payload = json.loads(source.read_text(encoding="utf-8"))
        batch = payload.get("recipes", [])
        if not batch:
            raise ValueError(f"{source.name}: batch must contain at least one recipe.")
        items.extend(batch)

    if not items:
        return []

    ids = [item.get("id") for item in items]
    expected = [f"BV{i:03}" for i in range(331, 331 + len(items))]
    if ids != expected:
        raise ValueError("Curated recipe batches must use unique sequential IDs starting at BV331.")
    slugs = [recipe_slug(item) for item in items]
    if len(set(slugs)) != len(slugs):
        raise ValueError("Curated recipe batches contain duplicate slugs.")

    for item in items:
        for key in (
            "name",
            "description",
            "ingredients",
            "preparation_steps",
            "cooking_steps",
            "finished_dish",
            "serving",
            "tips",
            "media",
            "sources",
        ):
            if not item.get(key):
                raise ValueError(f"{item['id']}: missing {key}.")
        if not item["media"][0]["image_url"].startswith("/images/recipes/edited/"):
            raise ValueError(f"{item['id']}: expected a Bếp Việt-owned image path.")
        if any(ingredient["quantity"] <= 0 for ingredient in item["ingredients"]):
            raise ValueError(f"{item['id']}: invalid ingredient quantity.")
        if item["total_time"] != item["prep_time"] + item["cook_time"] + item["passive_time"]:
            raise ValueError(f"{item['id']}: inconsistent total time.")
        if not item["sources"][0].get("url"):
            raise ValueError(f"{item['id']}: source URL is required.")
        if item.get("editorial", {}).get("test_cook_status") != "not_tested":
            raise ValueError(f"{item['id']}: mark the recipe test-cook status explicitly.")
    return items


def extract_document_images(document: Path, items: list[dict[str, Any]]) -> dict[str, str]:
    namespaces = {
        "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
        "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    }
    image_paths: dict[str, str] = {}
    with ZipFile(document) as archive:
        relationships = {
            node.attrib["Id"]: node.attrib["Target"]
            for node in ET.fromstring(archive.read("word/_rels/document.xml.rels"))
        }
        root = ET.fromstring(archive.read("word/document.xml"))
        text = " ".join(node.text or "" for node in root.findall(".//w:t", namespaces))
        images: dict[str, str] = {}
        current_id = ""
        for paragraph in root.findall(".//w:p", namespaces):
            line = "".join(node.text or "" for node in paragraph.findall(".//w:t", namespaces))
            match = re.match(r"^(BV\d{3})\s", line)
            if match:
                current_id = match[1]
            for image in paragraph.findall(".//a:blip", namespaces):
                rel_id = image.get(
                    "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed"
                )
                if rel_id and current_id:
                    images[current_id] = relationships[rel_id]
        if set(images) != {item["id"] for item in items}:
            raise ValueError("Word images do not match all 300 catalog IDs.")
        if any(item["name"] not in text for item in items):
            raise ValueError("Word and JSON recipe names do not match.")
        IMAGE_DIRECTORY.mkdir(parents=True, exist_ok=True)
        for recipe_id, target in images.items():
            filename = f"{recipe_id}{Path(target).suffix.lower()}"
            (IMAGE_DIRECTORY / filename).write_bytes(archive.read(f"word/{target}"))
            image_paths[recipe_id] = f"/images/recipes/{filename}"
    return image_paths


def read_generated_image_paths(items: list[dict[str, Any]]) -> dict[str, str] | None:
    """Use a complete set of Bếp Việt-created images, never a mixed partial catalog."""
    if not GENERATED_IMAGE_DIRECTORY.exists():
        return None

    paths: dict[str, Path] = {}
    missing: list[str] = []
    for item in items:
        matches = [
            path
            for path in GENERATED_IMAGE_DIRECTORY.iterdir()
            if path.is_file()
            and path.stem == item["id"]
            and path.suffix.lower() in GENERATED_IMAGE_EXTENSIONS
        ]
        if len(matches) > 1:
            raise ValueError(f"{item['id']}: keep one generated image file, not multiple formats.")
        if matches:
            paths[item["id"]] = matches[0]
        else:
            missing.append(item["id"])

    if not paths:
        return None
    if missing:
        sample = ", ".join(missing[:10])
        raise ValueError(
            f"Generated images are incomplete ({len(paths)}/300). Add the remaining IDs "
            f"before import, starting with: {sample}."
        )

    for recipe_id, path in paths.items():
        data = path.read_bytes()
        valid = {
            ".png": data.startswith(b"\x89PNG\r\n\x1a\n"),
            ".jpg": data.startswith(b"\xff\xd8\xff"),
            ".jpeg": data.startswith(b"\xff\xd8\xff"),
            ".webp": data.startswith(b"RIFF") and data[8:12] == b"WEBP",
        }[path.suffix.lower()]
        if len(data) < 128 or not valid:
            raise ValueError(f"{recipe_id}: generated image is empty or does not match its format.")

    return {recipe_id: f"/images/recipes-owned/{path.name}" for recipe_id, path in paths.items()}


def import_catalog(
    session: Session,
    items: list[dict[str, Any]],
    image_paths: dict[str, str] | None = None,
) -> dict[str, int]:
    existing = list(session.scalars(select(Recipe).options()))
    by_id = {recipe.catalog_id: recipe for recipe in existing if recipe.catalog_id}
    by_slug = {recipe.slug: recipe for recipe in existing}
    result = {"created": 0, "updated": 0}
    for item in items:
        slug = recipe_slug(item)
        recipe = by_id.get(item["id"]) or by_slug.get(slug)
        if recipe is None:
            recipe = Recipe(slug=slug)
            session.add(recipe)
            result["created"] += 1
        else:
            result["updated"] += 1
        previous_name = recipe.name
        aliases = list(
            dict.fromkeys(
                [
                    *item["aliases"],
                    *(recipe.content or {}).get("aliases", []),
                    *(["Đậu hũ sốt cà chua"] if slug == "dau-hu-sot-ca-chua" else []),
                    *([previous_name] if previous_name and previous_name != item["name"] else []),
                ]
            )
        )
        recipe.catalog_id = item["id"]
        recipe.name = item["name"]
        recipe.excerpt = item["finished_dish"]
        recipe.region = item["region"][0] if len(item["region"]) == 1 else "Ba miền"
        recipe.category = recipe_category(item)
        recipe.difficulty = item["difficulty"]
        recipe.prep_minutes = item["prep_time"]
        recipe.cook_minutes = item["cook_time"]
        recipe.base_servings = item["servings"]
        recipe.image_path = (image_paths or {}).get(item["id"], item["media"][0]["image_url"])
        recipe.image_alt = item["media"][0]["alt_text"]
        recipe.serving = SERVING_OVERRIDES.get(slug, item["serving"])
        recipe.tip = "\n".join(item["tips"])
        recipe.source_name = "Bếp Việt"
        recipe.source_url = item["sources"][0]["url"]
        recipe.status = "published"
        tags = normalized_recipe_tags(item)
        content = {**item, "tags": tags, "serving": recipe.serving, "aliases": aliases}
        if recipe.image_path.startswith("/images/recipes-owned/"):
            image_alt_text = f"{item['name']}, món Việt đã nấu xong được tạo hình cho Bếp Việt."
            generated_media: dict[str, str | None] = {
                "image_url": recipe.image_path,
                "source": "Bếp Việt",
                "author": "Bếp Việt",
                "license": None,
                "rights_status": "project",
                "rights_note": "Ảnh được tạo mới bằng AI dành riêng cho danh mục Bếp Việt.",
                "alt_text": image_alt_text,
            }
            recipe.image_alt = image_alt_text
            content["media"] = [generated_media]
            content["display_image"] = {
                "source": "Bếp Việt",
                "rights_status": "project",
                "rights_note": generated_media["rights_note"],
            }
        recipe.content = content
        recipe.search_text = normalize_search(
            " ".join(
                [
                    item["name"],
                    recipe.excerpt,
                    recipe.category,
                    item["category"],
                    *aliases,
                    *item["region"],
                    *item["province"],
                    *tags.get("dish_type", []),
                    *tags.get("cooking_method", []),
                    *tags.get("keywords", []),
                    *[ingredient["name"] for ingredient in item["ingredients"]],
                    f"{item['total_time']} phút",
                ]
            )
        )
        recipe.ingredients.clear()
        recipe.steps.clear()
        groups = {
            "main": "Nguyên liệu chính",
            "vegetable": "Rau củ",
            "seasoning": "Gia vị",
            "liquid": "Nước và chất lỏng",
            "process_aid": "Hỗ trợ chế biến",
            "aromatic": "Gia vị",
            "garnish": "Rau thơm và phần ăn kèm",
            "herb": "Rau thơm và phần ăn kèm",
            "accompaniment": "Món ăn kèm",
            "side": "Món ăn kèm",
            "topping": "Rau thơm và phần ăn kèm",
            "fat": "Gia vị",
            "grain": "Nguyên liệu chính",
            "other": "Hỗ trợ chế biến",
            "wrapping": "Lá gói",
        }
        for ingredient_position, ingredient in enumerate(item["ingredients"], start=1):
            recipe.ingredients.append(
                RecipeIngredient(
                    group_name=groups[ingredient["role"]],
                    name=ingredient["name"],
                    amount=Decimal(str(ingredient["quantity"])),
                    unit=ingredient["unit"],
                    note=ingredient["notes"],
                    scalable=ingredient["scaling_rule"] != "vessel_dependent",
                    position=ingredient.get("sequence", ingredient_position),
                )
            )
        for step_type, key in (("so_che", "preparation_steps"), ("thuc_hien", "cooking_steps")):
            for step in item[key]:
                recipe.steps.append(
                    RecipeStep(
                        step_type=step_type,
                        content=step["instruction"],
                        position=step["step"],
                    )
                )
    session.flush()
    return result


def install_legacy_images(session: Session) -> None:
    for recipe in session.scalars(select(Recipe)):
        if recipe.image_path.startswith("/images/recipes-owned/"):
            continue
        relative = LEGACY_IMAGES.get(recipe.slug)
        if not relative:
            continue
        source = ROOT / "frontend/src/assets" / relative
        filename = f"{recipe.slug}{source.suffix}"
        shutil.copyfile(source, IMAGE_DIRECTORY / filename)
        recipe.image_path = f"/images/recipes/{filename}"
        if recipe.slug in SERVING_OVERRIDES:
            recipe.serving = SERVING_OVERRIDES[recipe.slug]
        if not recipe.search_text:
            recipe.search_text = normalize_search(
                " ".join(
                    [
                        recipe.name,
                        recipe.excerpt,
                        recipe.region,
                        recipe.category,
                        *[ingredient.name for ingredient in recipe.ingredients],
                        f"{recipe.prep_minutes + recipe.cook_minutes} phút",
                    ]
                )
            )
        credit: dict[str, Any] = {"source": "Bếp Việt", "rights_status": "project"}
        if recipe.slug == "rau-muong-xao-toi":
            credit = {
                "source": "Andy Li / Wikimedia Commons",
                "rights_status": "licensed",
                "license": "CC0 1.0",
                "page_url": "https://commons.wikimedia.org/wiki/File:Pad_Pak_Bung_(Morning_glory)_-_Thai_Street_Food,_Worthing_2026-08-21.jpg",
            }
        elif recipe.slug == "dau-hu-sot-ca-chua":
            credit = {
                "source": "Mickey Đại Phát / Wikimedia Commons",
                "rights_status": "licensed",
                "license": "CC BY-SA 4.0",
                "page_url": "https://commons.wikimedia.org/wiki/File:Tomato-sauced_tofu.jpg",
            }
        recipe.content = {**recipe.content, "display_image": credit}


def import_legacy_recipes(session: Session) -> None:
    """Retain the original catalog and bookmarks when installing into an empty database."""
    source = ROOT / "backend/app/data/legacy_recipes.json"
    for item in json.loads(source.read_text(encoding="utf-8")):
        if session.scalar(select(Recipe).where(Recipe.slug == item["slug"])):
            continue
        recipe = Recipe(
            slug=item["slug"],
            name=item["name"],
            excerpt=item["excerpt"],
            region=item["region"],
            category=item["category"],
            difficulty=item["difficulty"],
            prep_minutes=item["prepMinutes"],
            cook_minutes=item["cookMinutes"],
            base_servings=item["servings"],
            image_path=item["image"],
            image_alt=item["imageAlt"],
            serving=SERVING_OVERRIDES.get(item["slug"], item["serving"]),
            tip=item["tip"],
            source_name="Bếp Việt",
            source_url=item["sourceUrl"],
            status="published",
            content={"tags": {"keywords": item["tags"]}},
            search_text=normalize_search(
                " ".join(
                    [
                        item["name"],
                        item["excerpt"],
                        item["region"],
                        item["category"],
                        *item["tags"],
                        *[
                            ingredient["name"]
                            for group in item["ingredients"]
                            for ingredient in group["items"]
                        ],
                        f"{item['prepMinutes'] + item['cookMinutes']} phút",
                    ]
                )
            ),
        )
        position = 0
        for group in item["ingredients"]:
            for ingredient in group["items"]:
                position += 1
                recipe.ingredients.append(
                    RecipeIngredient(
                        group_name=group["group"],
                        name=ingredient["name"],
                        amount=Decimal(str(ingredient["amount"]))
                        if ingredient["amount"] is not None
                        else None,
                        unit=ingredient["unit"],
                        note=ingredient.get("note"),
                        scalable=ingredient.get("scalable", True),
                        position=position,
                    )
                )
        for step_type, key in (("so_che", "preparation"), ("thuc_hien", "cooking")):
            for position, content in enumerate(item[key], start=1):
                recipe.steps.append(
                    RecipeStep(step_type=step_type, content=content, position=position)
                )
        session.add(recipe)
    session.flush()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--document", type=Path, default=DOCUMENT)
    parser.add_argument(
        "--only-missing",
        action="store_true",
        help="Add missing catalog dishes without replacing existing recipe edits.",
    )
    args = parser.parse_args()
    items = read_catalog(args.source)
    desserts = read_supplemental_desserts()
    curated = read_curated_recipe_batches()
    all_ids = [item["id"] for item in (*items, *desserts, *curated)]
    all_slugs = [recipe_slug(item) for item in (*items, *desserts, *curated)]
    if len(all_ids) != len(set(all_ids)):
        raise ValueError("Catalog batches contain duplicate recipe IDs.")
    if len(all_slugs) != len(set(all_slugs)):
        raise ValueError("Catalog batches contain duplicate recipe slugs.")
    generated_images = read_generated_image_paths(items)
    images = generated_images or extract_document_images(args.document, items)
    for item in desserts:
        image_path = item["media"][0]["image_url"]
        local_path = ROOT / "frontend/public" / image_path.lstrip("/")
        if not local_path.is_file():
            raise ValueError(f"{item['id']}: missing generated image {local_path}.")
        images[item["id"]] = image_path
    items.extend(desserts)
    for item in curated:
        image_path = item["media"][0]["image_url"]
        local_path = ROOT / "frontend/public" / image_path.lstrip("/")
        if not local_path.is_file():
            raise ValueError(f"{item['id']}: missing generated image {local_path}.")
        images[item["id"]] = image_path
    items.extend(curated)
    with SessionLocal() as session:
        if args.only_missing:
            existing = list(session.execute(select(Recipe.catalog_id, Recipe.slug)))
            existing_ids = {catalog_id for catalog_id, _ in existing if catalog_id}
            existing_slugs = {slug for _, slug in existing}
            items = [
                item
                for item in items
                if item["id"] not in existing_ids and recipe_slug(item) not in existing_slugs
            ]
        else:
            import_legacy_recipes(session)
        result = import_catalog(session, items, images)
        if not args.only_missing:
            install_legacy_images(session)
        qa_recipe = session.scalar(select(Recipe).where(Recipe.slug == "thit-kho-trung-qa"))
        if qa_recipe is not None:
            qa_recipe.status = "hidden"
        session.commit()
        export_catalog_snapshot(session)
    print(
        json.dumps(
            {
                "catalog_recipes": len(items),
                "images": len(images),
                "generated_images": len(generated_images or {}),
                "curated_additions": len(curated),
                **result,
            }
        )
    )


def export_catalog_snapshot(session: Session) -> None:
    """Keep the complete catalog available when the local API is temporarily offline."""
    items = list(
        session.scalars(
            select(Recipe)
            .where(Recipe.status == "published")
            .order_by(Recipe.catalog_id, Recipe.name)
        )
    )
    snapshot = {
        "total": len(items),
        "data": [
            RecipeDetailResponse.model_validate(item).model_dump(mode="json") for item in items
        ],
    }
    target = ROOT / "frontend/public/data/recipe-catalog.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
