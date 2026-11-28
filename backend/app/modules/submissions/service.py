"""Đưa đề xuất món đã duyệt vào kho món công khai.

Đề xuất chỉ bắt buộc tên món nên món sinh ra có thể thiếu nguyên liệu, các bước hoặc thời gian;
giao diện tự ẩn các phần không có dữ liệu. Liên kết đề xuất ↔ món được lưu trong
``Recipe.content["submission_id"]`` để không cần đổi lược đồ CSDL.
"""

from collections.abc import Iterable

from sqlalchemy import ColumnElement, select
from sqlalchemy.orm import Session

from app.modules.articles.service import slugify
from app.modules.recipes.models import Recipe, RecipeIngredient, RecipeStep
from app.modules.recipes.search import normalize_search
from app.modules.submissions.models import RecipeSubmission

# Ảnh minh họa chung (frontend/public) cho món chưa có ảnh; quản trị viên thay ảnh sau.
PLACEHOLDER_IMAGE_PATH = "/images/brand/dish-placeholder.png"
COMMUNITY_SOURCE = "Cộng đồng Bếp Việt"
DEFAULT_EXCERPT = "Món ăn do thành viên cộng đồng Bếp Việt đề xuất."
MAX_INGREDIENTS = 60
MAX_STEPS = 30


def _lines(text: str, limit: int, max_length: int) -> list[str]:
    lines = [" ".join(line.split()) for line in (text or "").splitlines()]
    return [line[:max_length] for line in lines if line][:limit]


def _content_submission_id() -> ColumnElement[str]:
    column: ColumnElement[str] = Recipe.content["submission_id"].as_string()
    return column


def linked_recipe(session: Session, submission_id: str) -> Recipe | None:
    return session.scalar(select(Recipe).where(_content_submission_id() == submission_id))


def linked_recipe_slugs(
    session: Session, submissions: Iterable[RecipeSubmission]
) -> dict[str, str]:
    """Đường dẫn món đang xuất bản của các đề xuất đã duyệt (theo id đề xuất)."""
    ids = [str(item.id) for item in submissions if item.status == "approved"]
    if not ids:
        return {}
    rows = session.execute(
        select(_content_submission_id(), Recipe.slug).where(
            _content_submission_id().in_(ids), Recipe.status == "published"
        )
    ).all()
    return {str(submission_id): slug for submission_id, slug in rows}


def _unique_slug(session: Session, name: str) -> str:
    base = slugify(name)[:170].strip("-") or "mon-cong-dong"
    slug, suffix = base, 2
    while session.scalar(select(Recipe.id).where(Recipe.slug == slug)) is not None:
        slug = f"{base}-{suffix}"
        suffix += 1
    return slug


def publish_submission(session: Session, submission: RecipeSubmission) -> Recipe:
    """Tạo (hoặc xuất bản lại) món trong kho từ đề xuất; gọi trước khi commit."""
    existing = linked_recipe(session, str(submission.id))
    if existing is not None:
        existing.status = "published"
        return existing

    excerpt = submission.story.strip() or DEFAULT_EXCERPT
    recipe = Recipe(
        slug=_unique_slug(session, submission.name),
        name=submission.name,
        excerpt=excerpt,
        region=submission.region,
        category=submission.category,
        difficulty="Dễ",
        prep_minutes=0,
        cook_minutes=max(0, submission.total_minutes or 0),
        base_servings=submission.servings or 4,
        image_path=PLACEHOLDER_IMAGE_PATH,
        image_alt=submission.name,
        serving="",
        tip="",
        source_name=COMMUNITY_SOURCE,
        source_url="",
        status="published",
        content={"submission_id": str(submission.id), "origin": "community_submission"},
    )
    ingredient_names = _lines(submission.ingredients, MAX_INGREDIENTS, 180)
    for position, name in enumerate(ingredient_names, start=1):
        recipe.ingredients.append(
            RecipeIngredient(
                group_name="Nguyên liệu chính",
                name=name,
                amount=None,
                unit="",
                note=None,
                # Dòng tự do (định lượng nằm trong chữ) nên không tự nhân theo khẩu phần.
                scalable=False,
                position=position,
            )
        )
    for position, content in enumerate(_lines(submission.steps, MAX_STEPS, 2000), start=1):
        recipe.steps.append(RecipeStep(step_type="thuc_hien", content=content, position=position))
    recipe.search_text = normalize_search(
        " ".join([recipe.name, excerpt, recipe.region, recipe.category, *ingredient_names])
    )
    session.add(recipe)
    return recipe


def unpublish_submission(session: Session, submission: RecipeSubmission) -> None:
    """Đề xuất bị chuyển khỏi trạng thái đã duyệt: ẩn món tương ứng khỏi kho công khai."""
    recipe = linked_recipe(session, str(submission.id))
    if recipe is not None and recipe.status == "published":
        recipe.status = "hidden"
