"""Truy vấn tổng hợp cho bảng điều khiển quản trị: hành vi người dùng và mức độ tương tác món ăn.

Mọi số liệu đều suy ra từ dữ liệu sẵn có (kế hoạch, nhật ký kế hoạch, yêu thích, bài viết,
đề xuất, mâm cơm, hỗ trợ) nên không cần thêm bảng theo dõi riêng.
"""

import heapq
from collections.abc import Iterable, Iterator
from datetime import UTC, date, datetime, timedelta
from itertools import islice
from typing import Any
from uuid import UUID

from sqlalchemy import Select, case, func, select
from sqlalchemy.orm import Session

from app.modules.admin.schemas import (
    AdminActivityEvent,
    AdminCookedRecipe,
    AdminFavoriteRecipe,
    AdminRecipeEngagement,
    AdminRecipeFan,
    AdminUserStats,
    DailyCount,
    RankedRecipe,
    TasteSlice,
)
from app.modules.articles.models import Article
from app.modules.auth.models import AuthIdentity, RefreshSession, User
from app.modules.favorites.models import UserFavoriteRecipe
from app.modules.planner.models import UserMealPlanEvent, UserMealPlanItem
from app.modules.recipes.models import Recipe
from app.modules.saved_meals.models import SavedMeal
from app.modules.saved_meals.schemas import LEGACY_PROFILES
from app.modules.submissions.models import RecipeSubmission
from app.modules.support.models import SupportTicket

COMPLETED = UserMealPlanItem.completion_status == "completed"


def _scalar(session: Session, statement: Any) -> int:
    return int(session.scalar(statement) or 0)


def _day_key(value: Any) -> str:
    # SQLite trả chuỗi 'YYYY-MM-DD', PostgreSQL trả date: chuẩn hóa về chuỗi để gộp.
    return str(value)[:10]


def daily_series(
    session: Session, columns: Iterable[tuple[Any, Any]], days: int
) -> list[DailyCount]:
    """Đếm sự kiện theo ngày (UTC) trong `days` ngày gần nhất, điền 0 cho ngày trống."""
    today = datetime.now(UTC).date()
    start = today - timedelta(days=days - 1)
    since = datetime.combine(start, datetime.min.time(), tzinfo=UTC)
    totals: dict[str, int] = {}
    for column, condition in columns:
        bucket = func.date(column)
        statement = select(bucket, func.count()).where(column >= since).group_by(bucket)
        if condition is not None:
            statement = statement.where(condition)
        for key, count in session.execute(statement).all():
            totals[_day_key(key)] = totals.get(_day_key(key), 0) + int(count)
    return [
        DailyCount(
            day=start + timedelta(days=i), count=totals.get(str(start + timedelta(days=i)), 0)
        )
        for i in range(days)
    ]


# ---------- Món ăn ----------


def engagement_subqueries() -> tuple[Any, Any]:
    favorites = (
        select(UserFavoriteRecipe.recipe_id, func.count().label("favorites"))
        .group_by(UserFavoriteRecipe.recipe_id)
        .subquery()
    )
    plans = (
        select(
            UserMealPlanItem.recipe_id,
            func.count().label("planned"),
            func.sum(case((COMPLETED, 1), else_=0)).label("cooked"),
        )
        .group_by(UserMealPlanItem.recipe_id)
        .subquery()
    )
    return favorites, plans


def recipes_with_engagement() -> tuple[Select[Any], dict[str, Any]]:
    favorites, plans = engagement_subqueries()
    fav_count = func.coalesce(favorites.c.favorites, 0)
    planned = func.coalesce(plans.c.planned, 0)
    cooked = func.coalesce(plans.c.cooked, 0)
    statement = (
        select(Recipe, fav_count, planned, cooked)
        .outerjoin(favorites, favorites.c.recipe_id == Recipe.id)
        .outerjoin(plans, plans.c.recipe_id == Recipe.id)
    )
    return statement, {"favorites": fav_count, "planned": planned, "cooked": cooked}


def top_recipes(session: Session, limit: int = 6) -> list[RankedRecipe]:
    statement, metrics = recipes_with_engagement()
    score = metrics["favorites"] * 2 + metrics["planned"] + metrics["cooked"]
    rows = session.execute(statement.where(score > 0).order_by(score.desc()).limit(limit)).all()
    return [
        RankedRecipe(
            slug=recipe.slug,
            name=recipe.name,
            image_path=recipe.image_path,
            region=recipe.region,
            category=recipe.category,
            favorites=int(fav),
            planned=int(planned),
            cooked=int(cooked),
        )
        for recipe, fav, planned, cooked in rows
    ]


def recipe_engagement(session: Session, recipe_id: UUID) -> tuple[AdminRecipeEngagement, int, int]:
    today = datetime.now(UTC).date()
    favorites = _scalar(
        session,
        select(func.count())
        .select_from(UserFavoriteRecipe)
        .where(UserFavoriteRecipe.recipe_id == recipe_id),
    )
    planned, cooked, upcoming, skipped = session.execute(
        select(
            func.count(),
            func.sum(case((COMPLETED, 1), else_=0)),
            func.sum(case((UserMealPlanItem.plan_date >= today, 1), else_=0)),
            func.sum(case((UserMealPlanItem.completion_status == "skipped", 1), else_=0)),
        ).where(UserMealPlanItem.recipe_id == recipe_id)
    ).one()
    return (
        AdminRecipeEngagement(
            favorites=favorites, planned=int(planned or 0), cooked=int(cooked or 0)
        ),
        int(upcoming or 0),
        int(skipped or 0),
    )


def recipe_fans(session: Session, recipe_id: UUID, limit: int = 8) -> list[AdminRecipeFan]:
    rows = session.execute(
        select(User, UserFavoriteRecipe.created_at)
        .join(UserFavoriteRecipe, UserFavoriteRecipe.user_id == User.id)
        .where(UserFavoriteRecipe.recipe_id == recipe_id)
        .order_by(UserFavoriteRecipe.created_at.desc())
        .limit(limit)
    ).all()
    return [_fan(user, occurred_at) for user, occurred_at in rows]


def recipe_cooks(session: Session, recipe_id: UUID, limit: int = 8) -> list[AdminRecipeFan]:
    times = func.count().label("times")
    last = func.max(UserMealPlanItem.updated_at).label("last")
    rows = session.execute(
        select(User, times, last)
        .join(UserMealPlanItem, UserMealPlanItem.user_id == User.id)
        .where(UserMealPlanItem.recipe_id == recipe_id, COMPLETED)
        .group_by(User.id)
        .order_by(times.desc(), last.desc())
        .limit(limit)
    ).all()
    return [_fan(user, occurred_at, int(count)) for user, count, occurred_at in rows]


def _fan(user: User, occurred_at: datetime, times: int | None = None) -> AdminRecipeFan:
    return AdminRecipeFan(
        user_id=user.id,
        full_name=user.full_name,
        email=user.email,
        avatar_url=user.avatar_url,
        occurred_at=occurred_at,
        times=times,
    )


# ---------- Người dùng ----------


def user_stats(session: Session, user: User) -> AdminUserStats:
    today = datetime.now(UTC).date()
    total, upcoming, completed, skipped = session.execute(
        select(
            func.count(),
            func.sum(case((UserMealPlanItem.plan_date >= today, 1), else_=0)),
            func.sum(case((COMPLETED, 1), else_=0)),
            func.sum(case((UserMealPlanItem.completion_status == "skipped", 1), else_=0)),
        ).where(UserMealPlanItem.user_id == user.id)
    ).one()

    def count(model: Any, *conditions: Any) -> int:
        return _scalar(session, select(func.count()).select_from(model).where(*conditions))

    return AdminUserStats(
        plan_total=int(total or 0),
        plan_upcoming=int(upcoming or 0),
        plan_completed=int(completed or 0),
        plan_skipped=int(skipped or 0),
        cooked_recipes=_scalar(
            session,
            select(func.count(func.distinct(UserMealPlanItem.recipe_id))).where(
                UserMealPlanItem.user_id == user.id, COMPLETED
            ),
        ),
        favorites=count(UserFavoriteRecipe, UserFavoriteRecipe.user_id == user.id),
        stories=count(Article, Article.author_id == user.id),
        submissions=count(
            RecipeSubmission,
            RecipeSubmission.user_id == user.id,
            RecipeSubmission.status != "draft",
        ),
        saved_meals=count(SavedMeal, SavedMeal.user_id == user.id),
        tickets=count(SupportTicket, SupportTicket.user_id == user.id),
        active_sessions=count(
            RefreshSession,
            RefreshSession.user_id == user.id,
            RefreshSession.revoked_at.is_(None),
            RefreshSession.expires_at > datetime.now(UTC),
        ),
    )


def user_providers(session: Session, user: User) -> list[str]:
    providers = set(
        session.scalars(select(AuthIdentity.provider).where(AuthIdentity.user_id == user.id))
    )
    if user.password_hash:
        providers.add("password")
    return sorted(providers)


def user_taste(session: Session, user_id: UUID, column: Any, limit: int = 6) -> list[TasteSlice]:
    """Khẩu vị = món yêu thích + món đã nấu, gộp theo vùng miền hoặc loại món."""
    counts: dict[str, int] = {}
    sources = (
        select(column, func.count())
        .join(UserFavoriteRecipe, UserFavoriteRecipe.recipe_id == Recipe.id)
        .where(UserFavoriteRecipe.user_id == user_id)
        .group_by(column),
        select(column, func.count())
        .join(UserMealPlanItem, UserMealPlanItem.recipe_id == Recipe.id)
        .where(UserMealPlanItem.user_id == user_id, COMPLETED)
        .group_by(column),
    )
    for statement in sources:
        for label, count in session.execute(statement).all():
            counts[label] = counts.get(label, 0) + int(count)
    ranked = sorted(counts.items(), key=lambda pair: (-pair[1], pair[0]))[:limit]
    return [TasteSlice(label=label, count=count) for label, count in ranked]


def user_activity_series(session: Session, user_id: UUID, days: int = 30) -> list[DailyCount]:
    return daily_series(
        session,
        [
            (UserMealPlanEvent.occurred_at, UserMealPlanEvent.user_id == user_id),
            (UserFavoriteRecipe.created_at, UserFavoriteRecipe.user_id == user_id),
            (SavedMeal.created_at, SavedMeal.user_id == user_id),
        ],
        days,
    )


def last_active_at(session: Session, user: User) -> datetime | None:
    candidates = [
        user.last_login_at,
        session.scalar(
            select(func.max(UserMealPlanEvent.occurred_at)).where(
                UserMealPlanEvent.user_id == user.id
            )
        ),
        session.scalar(
            select(func.max(UserFavoriteRecipe.created_at)).where(
                UserFavoriteRecipe.user_id == user.id
            )
        ),
    ]
    values = [value for value in candidates if value is not None]
    if not values:
        return None
    # SQLite trả datetime không múi giờ; quy về UTC để so sánh an toàn.
    return max(value if value.tzinfo else value.replace(tzinfo=UTC) for value in values)


def cooked_statement(user_id: UUID) -> Select[Recipe, int, int, date]:
    times = func.count().label("times")
    return (
        select(
            Recipe,
            times,
            func.sum(UserMealPlanItem.servings).label("servings"),
            func.max(UserMealPlanItem.plan_date).label("last_cooked"),
        )
        .join(UserMealPlanItem, UserMealPlanItem.recipe_id == Recipe.id)
        .where(UserMealPlanItem.user_id == user_id, COMPLETED)
        .group_by(Recipe.id)
    )


def cooked_recipes(
    session: Session, user_id: UUID, *, limit: int, offset: int = 0
) -> tuple[list[AdminCookedRecipe], int]:
    statement = cooked_statement(user_id)
    total = _scalar(session, select(func.count()).select_from(statement.subquery()))
    rows = session.execute(
        statement.order_by(func.count().desc(), func.max(UserMealPlanItem.plan_date).desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return [
        AdminCookedRecipe(
            slug=recipe.slug,
            name=recipe.name,
            image_path=recipe.image_path,
            region=recipe.region,
            category=recipe.category,
            times=int(times),
            servings=int(servings or 0),
            last_cooked=date.fromisoformat(_day_key(last_cooked)),
        )
        for recipe, times, servings, last_cooked in rows
    ], total


def favorite_recipes(
    session: Session, user_id: UUID, *, limit: int, offset: int = 0
) -> tuple[list[AdminFavoriteRecipe], int]:
    total = _scalar(
        session,
        select(func.count())
        .select_from(UserFavoriteRecipe)
        .where(UserFavoriteRecipe.user_id == user_id),
    )
    cooked = (
        select(UserMealPlanItem.recipe_id, func.count().label("times"))
        .where(UserMealPlanItem.user_id == user_id, COMPLETED)
        .group_by(UserMealPlanItem.recipe_id)
        .subquery()
    )
    rows = session.execute(
        select(Recipe, UserFavoriteRecipe.created_at, func.coalesce(cooked.c.times, 0))
        .join(UserFavoriteRecipe, UserFavoriteRecipe.recipe_id == Recipe.id)
        .outerjoin(cooked, cooked.c.recipe_id == Recipe.id)
        .where(UserFavoriteRecipe.user_id == user_id)
        .order_by(UserFavoriteRecipe.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return [
        AdminFavoriteRecipe(
            slug=recipe.slug,
            name=recipe.name,
            image_path=recipe.image_path,
            region=recipe.region,
            category=recipe.category,
            status=recipe.status,
            favorited_at=favorited_at,
            cooked_times=int(times),
        )
        for recipe, favorited_at, times in rows
    ], total


# ---------- Dòng hoạt động ----------


def _window(column: Any, before: datetime | None) -> list[Any]:
    return [column < before] if before else []


def _plan_events(
    session: Session, user_id: UUID, before: datetime | None, limit: int
) -> Iterator[AdminActivityEvent]:
    rows = session.scalars(
        select(UserMealPlanEvent)
        .where(
            UserMealPlanEvent.user_id == user_id, *_window(UserMealPlanEvent.occurred_at, before)
        )
        .order_by(UserMealPlanEvent.occurred_at.desc())
        .limit(limit)
    )
    for event in rows:
        yield AdminActivityEvent(
            id=f"plan:{event.id}",
            kind="plan",
            action=event.action,
            title=event.recipe_name,
            occurred_at=event.occurred_at,
            recipe_slug=event.recipe_slug,
            image_path=event.image_path,
            plan_date=event.plan_date,
            meal_type=event.meal_type,
            servings=event.servings,
        )


def _favorite_events(
    session: Session, user_id: UUID, before: datetime | None, limit: int
) -> Iterator[AdminActivityEvent]:
    rows = session.execute(
        select(UserFavoriteRecipe, Recipe)
        .join(Recipe, Recipe.id == UserFavoriteRecipe.recipe_id)
        .where(
            UserFavoriteRecipe.user_id == user_id,
            *_window(UserFavoriteRecipe.created_at, before),
        )
        .order_by(UserFavoriteRecipe.created_at.desc())
        .limit(limit)
    )
    for favorite, recipe in rows:
        yield AdminActivityEvent(
            id=f"favorite:{favorite.id}",
            kind="favorite",
            action="favorited",
            title=recipe.name,
            occurred_at=favorite.created_at,
            recipe_slug=recipe.slug,
            image_path=recipe.image_path,
        )


def _story_events(
    session: Session, user_id: UUID, before: datetime | None, limit: int
) -> Iterator[AdminActivityEvent]:
    rows = session.scalars(
        select(Article)
        .where(Article.author_id == user_id, *_window(Article.created_at, before))
        .order_by(Article.created_at.desc())
        .limit(limit)
    )
    for article in rows:
        yield AdminActivityEvent(
            id=f"story:{article.id}",
            kind="story",
            action="created",
            title=article.title,
            occurred_at=article.created_at,
            status=article.status,
        )


def _submission_events(
    session: Session, user_id: UUID, before: datetime | None, limit: int
) -> Iterator[AdminActivityEvent]:
    rows = session.scalars(
        select(RecipeSubmission)
        .where(
            RecipeSubmission.user_id == user_id,
            RecipeSubmission.status != "draft",
            *_window(RecipeSubmission.created_at, before),
        )
        .order_by(RecipeSubmission.created_at.desc())
        .limit(limit)
    )
    for item in rows:
        yield AdminActivityEvent(
            id=f"submission:{item.id}",
            kind="submission",
            action="submitted",
            title=item.name,
            occurred_at=item.created_at,
            status=item.status,
        )


def _saved_meal_events(
    session: Session, user_id: UUID, before: datetime | None, limit: int
) -> Iterator[AdminActivityEvent]:
    rows = session.scalars(
        select(SavedMeal)
        .where(SavedMeal.user_id == user_id, *_window(SavedMeal.created_at, before))
        .order_by(SavedMeal.created_at.desc())
        .limit(limit)
    )
    for meal in rows:
        yield AdminActivityEvent(
            id=f"saved_meal:{meal.id}",
            kind="saved_meal",
            action="saved",
            title=LEGACY_PROFILES.get(meal.profile, meal.profile),
            occurred_at=meal.created_at,
            count=len(meal.dish_ids or []),
        )


def _support_events(
    session: Session, user_id: UUID, before: datetime | None, limit: int
) -> Iterator[AdminActivityEvent]:
    rows = session.scalars(
        select(SupportTicket)
        .where(SupportTicket.user_id == user_id, *_window(SupportTicket.created_at, before))
        .order_by(SupportTicket.created_at.desc())
        .limit(limit)
    )
    for ticket in rows:
        yield AdminActivityEvent(
            id=f"support:{ticket.id}",
            kind="support",
            action="opened",
            title=ticket.subject,
            occurred_at=ticket.created_at,
            status=ticket.status,
        )


ACTIVITY_SOURCES = {
    "plan": _plan_events,
    "favorite": _favorite_events,
    "story": _story_events,
    "submission": _submission_events,
    "saved_meal": _saved_meal_events,
    "support": _support_events,
}


def _sort_key(event: AdminActivityEvent) -> datetime:
    value = event.occurred_at
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def user_activity(
    session: Session,
    user_id: UUID,
    *,
    kinds: Iterable[str],
    before: datetime | None,
    limit: int,
) -> tuple[list[AdminActivityEvent], datetime | None]:
    """Gộp nhiều nguồn theo thời gian giảm dần; phân trang bằng con trỏ `before`.

    Mỗi nguồn chỉ lấy tối đa `limit + 1` bản ghi nên chi phí không tăng theo độ sâu trang.
    """
    streams = [list(ACTIVITY_SOURCES[kind](session, user_id, before, limit + 1)) for kind in kinds]
    merged = heapq.merge(*streams, key=_sort_key, reverse=True)
    events = list(islice(merged, limit + 1))
    has_more = len(events) > limit
    events = events[:limit]
    return events, (events[-1].occurred_at if has_more and events else None)
