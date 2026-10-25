import calendar
import re
import unicodedata
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select, tuple_
from sqlalchemy.orm import Session, joinedload

from app.modules.planner.models import UserMealPlanEvent, UserMealPlanItem, UserVegetarianDay
from app.modules.planner.schemas import ShoppingPeriod
from app.modules.planner.seasonings import is_pantry_seasoning
from app.modules.recipes.models import Recipe


@dataclass
class _ShoppingIngredient:
    name: str
    unit: str
    category: str
    amount: Decimal = Decimal("0")
    has_unknown_amount: bool = False
    notes: set[str] = field(default_factory=set)
    recipe_names: set[str] = field(default_factory=set)


def list_plan_items(
    session: Session, *, user_id: UUID, from_date: date, to_date: date
) -> list[UserMealPlanItem]:
    statement = (
        select(UserMealPlanItem)
        .options(joinedload(UserMealPlanItem.recipe).selectinload(Recipe.ingredients))
        .where(
            UserMealPlanItem.user_id == user_id,
            UserMealPlanItem.plan_date >= from_date,
            UserMealPlanItem.plan_date <= to_date,
        )
        .order_by(
            UserMealPlanItem.plan_date,
            UserMealPlanItem.meal_type,
            UserMealPlanItem.created_at,
            UserMealPlanItem.id,
        )
    )
    return list(session.scalars(statement).unique())


def _record_event(
    session: Session,
    *,
    user_id: UUID,
    item: UserMealPlanItem,
    action: str,
) -> None:
    session.add(
        UserMealPlanEvent(
            user_id=user_id,
            item_id=item.id,
            action=action,
            recipe_slug=item.recipe.slug,
            recipe_name=item.recipe.name,
            image_path=item.recipe.image_path,
            plan_date=item.plan_date,
            meal_type=item.meal_type,
            servings=item.servings,
            occurred_at=datetime.now(UTC),
        )
    )


def save_plan_item(
    session: Session,
    *,
    user_id: UUID,
    recipe_slug: str,
    plan_date: date,
    meal_type: str,
    servings: int,
) -> tuple[UserMealPlanItem | None, str]:
    recipe = session.scalar(
        select(Recipe).where(Recipe.slug == recipe_slug, Recipe.status == "published")
    )
    if recipe is None:
        return None, "not_found"

    item = session.scalar(
        select(UserMealPlanItem)
        .options(joinedload(UserMealPlanItem.recipe).selectinload(Recipe.ingredients))
        .where(
            UserMealPlanItem.user_id == user_id,
            UserMealPlanItem.recipe_id == recipe.id,
            UserMealPlanItem.plan_date == plan_date,
            UserMealPlanItem.meal_type == meal_type,
        )
    )
    if item is None:
        item = UserMealPlanItem(
            user_id=user_id,
            recipe_id=recipe.id,
            recipe=recipe,
            plan_date=plan_date,
            meal_type=meal_type,
            servings=servings,
        )
        session.add(item)
        action = "added"
    else:
        if item.servings == servings:
            return item, "unchanged"
        item.servings = servings
        action = "updated"

    session.flush()
    _record_event(session, user_id=user_id, item=item, action=action)
    session.commit()
    session.refresh(item)
    return item, action


def save_plan_meal(
    session: Session,
    *,
    user_id: UUID,
    recipe_slugs: list[str],
    plan_date: date,
    meal_type: str,
    servings: int,
) -> tuple[list[UserMealPlanItem], int, bool]:
    recipes = list(
        session.scalars(
            select(Recipe)
            .options(joinedload(Recipe.ingredients))
            .where(Recipe.slug.in_(recipe_slugs), Recipe.status == "published")
        ).unique()
    )
    by_slug = {recipe.slug: recipe for recipe in recipes}
    if len(by_slug) != len(recipe_slugs):
        return [], 0, False

    existing = list(
        session.scalars(
            select(UserMealPlanItem)
            .options(joinedload(UserMealPlanItem.recipe).selectinload(Recipe.ingredients))
            .where(
                UserMealPlanItem.user_id == user_id,
                UserMealPlanItem.plan_date == plan_date,
                UserMealPlanItem.meal_type == meal_type,
            )
        ).unique()
    )
    existing_by_slug = {item.recipe.slug: item for item in existing}
    added: list[UserMealPlanItem] = []
    already_planned = 0
    for slug in recipe_slugs:
        if slug in existing_by_slug:
            already_planned += 1
            continue
        recipe = by_slug[slug]
        item = UserMealPlanItem(
            user_id=user_id,
            recipe_id=recipe.id,
            recipe=recipe,
            plan_date=plan_date,
            meal_type=meal_type,
            servings=servings,
            completion_status="planned",
        )
        session.add(item)
        added.append(item)

    if added:
        session.flush()
        for item in added:
            _record_event(session, user_id=user_id, item=item, action="added")
        session.commit()
        for item in added:
            session.refresh(item)
    return added, already_planned, True


def update_plan_item(
    session: Session, *, user_id: UUID, item_id: UUID, servings: int
) -> UserMealPlanItem | None:
    item = session.scalar(
        select(UserMealPlanItem)
        .options(joinedload(UserMealPlanItem.recipe).selectinload(Recipe.ingredients))
        .where(UserMealPlanItem.id == item_id, UserMealPlanItem.user_id == user_id)
    )
    if item is None:
        return None
    if item.servings == servings:
        return item
    item.servings = servings
    session.flush()
    _record_event(session, user_id=user_id, item=item, action="updated")
    session.commit()
    session.refresh(item)
    return item


def remove_plan_item(session: Session, *, user_id: UUID, item_id: UUID) -> bool:
    item = session.scalar(
        select(UserMealPlanItem)
        .options(joinedload(UserMealPlanItem.recipe).selectinload(Recipe.ingredients))
        .where(UserMealPlanItem.id == item_id, UserMealPlanItem.user_id == user_id)
    )
    if item is None:
        return False
    _record_event(session, user_id=user_id, item=item, action="removed")
    session.delete(item)
    session.commit()
    return True


def list_plan_history(
    session: Session, *, user_id: UUID, limit: int, offset: int
) -> tuple[list[UserMealPlanEvent], int]:
    statement = select(UserMealPlanEvent).where(UserMealPlanEvent.user_id == user_id)
    total = session.scalar(select(func.count()).select_from(statement.subquery())) or 0
    events = list(
        session.scalars(
            statement.order_by(UserMealPlanEvent.occurred_at.desc(), UserMealPlanEvent.id.desc())
            .limit(limit)
            .offset(offset)
        )
    )
    return events, total


def list_past_meals(
    session: Session,
    *,
    user_id: UUID,
    through_date: date,
    limit: int,
    offset: int,
) -> tuple[list[tuple[date, str, list[UserMealPlanItem]]], int]:
    group_statement = (
        select(UserMealPlanItem.plan_date, UserMealPlanItem.meal_type)
        .where(UserMealPlanItem.user_id == user_id, UserMealPlanItem.plan_date <= through_date)
        .distinct()
    )
    total = session.scalar(select(func.count()).select_from(group_statement.subquery())) or 0
    groups = list(
        session.execute(
            group_statement.order_by(UserMealPlanItem.plan_date.desc(), UserMealPlanItem.meal_type)
            .limit(limit)
            .offset(offset)
        )
    )
    if not groups:
        return [], total
    group_keys = [(plan_date, meal_type) for plan_date, meal_type in groups]
    items = list(
        session.scalars(
            select(UserMealPlanItem)
            .options(joinedload(UserMealPlanItem.recipe).selectinload(Recipe.ingredients))
            .where(
                UserMealPlanItem.user_id == user_id,
                tuple_(UserMealPlanItem.plan_date, UserMealPlanItem.meal_type).in_(group_keys),
            )
            .order_by(UserMealPlanItem.created_at, UserMealPlanItem.id)
        ).unique()
    )
    by_group: dict[tuple[date, str], list[UserMealPlanItem]] = {}
    for item in items:
        by_group.setdefault((item.plan_date, item.meal_type), []).append(item)
    return [(*key, by_group.get(key, [])) for key in group_keys], total


def set_item_status(
    session: Session, *, user_id: UUID, item: UserMealPlanItem, completion_status: str
) -> None:
    """Đổi trạng thái một món trong kế hoạch và ghi lịch sử; người gọi tự commit."""
    if item.completion_status == completion_status:
        return
    item.completion_status = completion_status
    session.flush()
    action = "reopened" if completion_status == "planned" else completion_status
    _record_event(session, user_id=user_id, item=item, action=action)


def meal_status(items: list[UserMealPlanItem]) -> str:
    """Trạng thái cả bữa: hoàn thành khi mọi món đã nấu, bỏ qua khi mọi món bị bỏ qua."""
    statuses = {item.completion_status for item in items}
    if statuses == {"completed"}:
        return "completed"
    if statuses == {"skipped"}:
        return "skipped"
    return "planned"


def update_meal_status(
    session: Session,
    *,
    user_id: UUID,
    plan_date: date,
    meal_type: str,
    completion_status: str,
) -> list[UserMealPlanItem]:
    items = list(
        session.scalars(
            select(UserMealPlanItem)
            .options(joinedload(UserMealPlanItem.recipe).selectinload(Recipe.ingredients))
            .where(
                UserMealPlanItem.user_id == user_id,
                UserMealPlanItem.plan_date == plan_date,
                UserMealPlanItem.meal_type == meal_type,
            )
            .order_by(UserMealPlanItem.created_at, UserMealPlanItem.id)
        ).unique()
    )
    action = "reopened" if completion_status == "planned" else completion_status
    for item in items:
        if item.completion_status == completion_status:
            continue
        item.completion_status = completion_status
        session.flush()
        _record_event(session, user_id=user_id, item=item, action=action)
    if items:
        session.commit()
    return items


def shopping_period_range(period: ShoppingPeriod, anchor_date: date) -> tuple[date, date]:
    if period == "day":
        return anchor_date, anchor_date
    if period == "week":
        start = anchor_date - timedelta(days=anchor_date.weekday())
        return start, start + timedelta(days=6)
    last_day = calendar.monthrange(anchor_date.year, anchor_date.month)[1]
    return anchor_date.replace(day=1), anchor_date.replace(day=last_day)


def create_shopping_list(
    session: Session,
    *,
    user_id: UUID,
    period: ShoppingPeriod,
    anchor_date: date,
) -> dict[str, object]:
    from_date, to_date = shopping_period_range(period, anchor_date)
    plan_items = list_plan_items(session, user_id=user_id, from_date=from_date, to_date=to_date)
    aggregated: OrderedDict[tuple[str, str, str], _ShoppingIngredient] = OrderedDict()

    def normalized(value: str) -> str:
        decomposed = unicodedata.normalize("NFD", value.casefold().replace("đ", "d"))
        return re.sub(
            r"[^a-z0-9]+", " ", "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
        ).strip()

    for plan_item in plan_items:
        recipe = plan_item.recipe
        base_servings = max(recipe.base_servings, 1)
        factor = Decimal(plan_item.servings) / Decimal(base_servings)
        for ingredient in recipe.ingredients:
            # Chỉ đồ nêm nếm (mắm, muối, mì chính…) vào cột gia vị; hành, tỏi, rau thơm là
            # nguyên liệu tươi dù công thức xếp chúng trong nhóm "Gia vị".
            category = "seasoning" if is_pantry_seasoning(ingredient.name) else "ingredient"
            key = (category, normalized(ingredient.name), normalized(ingredient.unit))
            entry = aggregated.setdefault(
                key, _ShoppingIngredient(ingredient.name, ingredient.unit, category)
            )
            amount = ingredient.amount
            if amount is None:
                entry.has_unknown_amount = True
            elif not entry.has_unknown_amount:
                entry.amount += amount * factor if ingredient.scalable else amount
            if ingredient.note:
                entry.notes.add(ingredient.note)
            entry.recipe_names.add(recipe.name)

    rows = []
    for entry in aggregated.values():
        amount = None if entry.has_unknown_amount else entry.amount.quantize(Decimal("0.01"))
        rows.append(
            {
                "name": entry.name,
                "category": entry.category,
                "amount": amount,
                "unit": entry.unit,
                "notes": sorted(entry.notes),
                "recipe_names": sorted(entry.recipe_names),
            }
        )
    rows.sort(key=lambda row: (str(row["category"]), normalized(str(row["name"]))))
    dishes = [
        {
            "slug": item.recipe.slug,
            "name": item.recipe.name,
            "image_path": item.recipe.image_path,
            "image_alt": item.recipe.image_alt,
            "plan_date": item.plan_date,
            "meal_type": item.meal_type,
            "servings": item.servings,
        }
        for item in plan_items
    ]
    return {
        "period": period,
        "from_date": from_date,
        "to_date": to_date,
        "recipe_count": len(plan_items),
        "dishes": dishes,
        "items": rows,
    }


def list_vegetarian_days(
    session: Session, *, user_id: UUID, from_date: date, to_date: date
) -> list[UserVegetarianDay]:
    statement = (
        select(UserVegetarianDay)
        .where(
            UserVegetarianDay.user_id == user_id,
            UserVegetarianDay.day >= from_date,
            UserVegetarianDay.day <= to_date,
        )
        .order_by(UserVegetarianDay.day)
    )
    return list(session.scalars(statement))


def set_vegetarian_day(
    session: Session, *, user_id: UUID, day: date, is_vegetarian: bool
) -> UserVegetarianDay:
    record = session.scalar(
        select(UserVegetarianDay).where(
            UserVegetarianDay.user_id == user_id, UserVegetarianDay.day == day
        )
    )
    if record is None:
        record = UserVegetarianDay(user_id=user_id, day=day, is_vegetarian=is_vegetarian)
        session.add(record)
    else:
        record.is_vegetarian = is_vegetarian
    session.commit()
    session.refresh(record)
    return record
