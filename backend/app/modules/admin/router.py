from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import DomainError
from app.db.session import get_db_session
from app.modules.admin import insights
from app.modules.admin.schemas import (
    ActivityKind,
    AdminActivityResponse,
    AdminCookedListResponse,
    AdminFavoriteListResponse,
    AdminInsightsResponse,
    AdminOverviewResponse,
    AdminPlanItem,
    AdminPlannerListResponse,
    AdminPlannerRow,
    AdminRecipeEngagementListResponse,
    AdminRecipeEngagementRow,
    AdminRecipeInsightsResponse,
    AdminRecipeRow,
    AdminRecipeUpdate,
    AdminUserDetailResponse,
    AdminUserListResponse,
    AdminUserPlansResponse,
    AdminUserRow,
    AdminUserUpdate,
    OverviewCounts,
    RecentUser,
)
from app.modules.articles.models import Article
from app.modules.articles.schemas import (
    ArticleCategory,
    ArticleDetail,
    ArticleKind,
    ArticleListResponse,
    ArticleModerationRequest,
    ArticleStatus,
)
from app.modules.articles.service import list_articles, moderate_article, to_detail, to_summary
from app.modules.auth.dependencies import require_admin
from app.modules.auth.models import User
from app.modules.auth.service import revoke_all_sessions
from app.modules.favorites.models import UserFavoriteRecipe
from app.modules.planner.models import UserMealPlanEvent, UserMealPlanItem
from app.modules.recipes.models import Recipe
from app.modules.submissions.models import RecipeSubmission
from app.modules.submissions.schemas import (
    AdminSubmissionListResponse,
    AdminSubmissionResponse,
    SubmissionReviewRequest,
    SubmissionStatus,
    SubmissionSubmitter,
)
from app.modules.support.models import SupportTicket
from app.modules.support.schemas import (
    SupportStatus,
    SupportTicketListResponse,
    SupportTicketResponse,
    SupportTicketUpdate,
)

router = APIRouter(prefix="/admin", dependencies=[Depends(require_admin)])

DatabaseSession = Annotated[Session, Depends(get_db_session)]
AdminUser = Annotated[User, Depends(require_admin)]
Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0)]


class AdminResourceNotFoundError(DomainError):
    code = "RESOURCE_NOT_FOUND"
    status_code = status.HTTP_404_NOT_FOUND


class AdminActionForbiddenError(DomainError):
    code = "ADMIN_ACTION_FORBIDDEN"
    status_code = status.HTTP_409_CONFLICT


def _count(session: Session, statement: Any) -> int:
    return int(session.scalar(statement) or 0)


def _counter(model: Any, *conditions: Any) -> Any:
    return select(func.count()).select_from(model).where(*conditions)


def _user_rows(session: Session, users: list[User]) -> list[AdminUserRow]:
    ids = [user.id for user in users]
    if not ids:
        return []

    def grouped(column: Any) -> dict[UUID, int]:
        rows = session.execute(
            select(column, func.count()).where(column.in_(ids)).group_by(column)
        ).all()
        return {key: int(value) for key, value in rows}

    favorites = grouped(UserFavoriteRecipe.user_id)
    plans = grouped(UserMealPlanItem.user_id)
    stories = grouped(Article.author_id)
    return [
        AdminUserRow(
            id=user.id,
            full_name=user.full_name,
            email=user.email,
            role=user.role,
            status=user.status,
            avatar_url=user.avatar_url,
            created_at=user.created_at,
            last_login_at=user.last_login_at,
            favorites=favorites.get(user.id, 0),
            plan_items=plans.get(user.id, 0),
            stories=stories.get(user.id, 0),
        )
        for user in users
    ]


def _get_user(session: Session, user_id: UUID) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise AdminResourceNotFoundError("Không tìm thấy người dùng.")
    return user


@router.get("/overview", response_model=AdminOverviewResponse, summary="Admin dashboard")
def overview(session: DatabaseSession) -> AdminOverviewResponse:
    week_ago = datetime.now(UTC) - timedelta(days=7)
    counts = OverviewCounts(
        users=_count(session, _counter(User)),
        active_users=_count(session, _counter(User, User.status == "active")),
        admins=_count(session, _counter(User, User.role == "admin")),
        new_users_7d=_count(session, _counter(User, User.created_at >= week_ago)),
        recipes_published=_count(session, _counter(Recipe, Recipe.status == "published")),
        recipes_hidden=_count(session, _counter(Recipe, Recipe.status != "published")),
        plan_items=_count(session, _counter(UserMealPlanItem)),
        planners=_count(session, select(func.count(func.distinct(UserMealPlanItem.user_id)))),
        articles_published=_count(session, _counter(Article, Article.status == "published")),
        articles_pending=_count(session, _counter(Article, Article.status == "pending")),
        submissions_pending=_count(
            session, _counter(RecipeSubmission, RecipeSubmission.status == "pending")
        ),
        tickets_open=_count(session, _counter(SupportTicket, SupportTicket.status != "resolved")),
    )
    recent = session.scalars(select(User).order_by(User.created_at.desc()).limit(6)).all()
    return AdminOverviewResponse(
        counts=counts,
        recent_users=[
            RecentUser(
                id=user.id, full_name=user.full_name, email=user.email, created_at=user.created_at
            )
            for user in recent
        ],
    )


@router.get("/insights", response_model=AdminInsightsResponse, summary="Activity trends")
def platform_insights(
    session: DatabaseSession, days: Annotated[int, Query(ge=7, le=90)] = 14
) -> AdminInsightsResponse:
    return AdminInsightsResponse(
        activity=insights.daily_series(
            session,
            [(UserMealPlanEvent.occurred_at, None), (UserFavoriteRecipe.created_at, None)],
            days,
        ),
        signups=insights.daily_series(session, [(User.created_at, None)], days),
        top_recipes=insights.top_recipes(session),
    )


@router.get("/users", response_model=AdminUserListResponse, summary="List users")
def users(
    session: DatabaseSession,
    q: Annotated[str | None, Query(max_length=100)] = None,
    role: Annotated[str | None, Query(pattern="^(user|admin)$")] = None,
    status_filter: Annotated[str | None, Query(alias="status", max_length=24)] = None,
    limit: Limit = 20,
    offset: Offset = 0,
) -> AdminUserListResponse:
    conditions = []
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        conditions.append(or_(User.full_name.ilike(pattern), User.email.ilike(pattern)))
    if role:
        conditions.append(User.role == role)
    if status_filter:
        conditions.append(User.status == status_filter)
    total = _count(session, _counter(User, *conditions))
    items = list(
        session.scalars(
            select(User)
            .where(*conditions)
            .order_by(User.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    )
    return AdminUserListResponse(data=_user_rows(session, items), total=total)


@router.patch("/users/{user_id}", response_model=AdminUserRow, summary="Change role or status")
def update_user(
    user_id: UUID, payload: AdminUserUpdate, session: DatabaseSession, admin: AdminUser
) -> AdminUserRow:
    user = _get_user(session, user_id)
    if user.id == admin.id:
        raise AdminActionForbiddenError(
            "Bạn không thể tự thay đổi vai trò hoặc khóa chính tài khoản của mình."
        )
    access_changed = False
    if payload.role and payload.role != user.role:
        user.role = payload.role
        access_changed = True
    if payload.status and payload.status != user.status:
        user.status = payload.status
        access_changed = True
    if access_changed:
        # Token cũ mang vai trò cũ, nên buộc đăng nhập lại để quyền mới có hiệu lực ngay.
        revoke_all_sessions(session, user)
    session.commit()
    session.refresh(user)
    return _user_rows(session, [user])[0]


@router.get(
    "/users/{user_id}", response_model=AdminUserDetailResponse, summary="User profile & behaviour"
)
def user_detail(user_id: UUID, session: DatabaseSession) -> AdminUserDetailResponse:
    user = _get_user(session, user_id)
    top_cooked, _ = insights.cooked_recipes(session, user.id, limit=5)
    return AdminUserDetailResponse(
        user=_user_rows(session, [user])[0],
        email_verified=user.email_verified_at is not None,
        providers=insights.user_providers(session, user),
        last_active_at=insights.last_active_at(session, user),
        stats=insights.user_stats(session, user),
        regions=insights.user_taste(session, user.id, Recipe.region),
        categories=insights.user_taste(session, user.id, Recipe.category),
        activity=insights.user_activity_series(session, user.id),
        top_cooked=top_cooked,
    )


@router.get(
    "/users/{user_id}/favorites",
    response_model=AdminFavoriteListResponse,
    summary="A user's favourite recipes",
)
def user_favorites(
    user_id: UUID, session: DatabaseSession, limit: Limit = 24, offset: Offset = 0
) -> AdminFavoriteListResponse:
    user = _get_user(session, user_id)
    data, total = insights.favorite_recipes(session, user.id, limit=limit, offset=offset)
    return AdminFavoriteListResponse(data=data, total=total)


@router.get(
    "/users/{user_id}/cooked",
    response_model=AdminCookedListResponse,
    summary="Recipes a user has cooked",
)
def user_cooked(
    user_id: UUID, session: DatabaseSession, limit: Limit = 24, offset: Offset = 0
) -> AdminCookedListResponse:
    user = _get_user(session, user_id)
    data, total = insights.cooked_recipes(session, user.id, limit=limit, offset=offset)
    return AdminCookedListResponse(data=data, total=total)


@router.get(
    "/users/{user_id}/activity",
    response_model=AdminActivityResponse,
    summary="A user's behaviour timeline",
)
def user_activity(
    user_id: UUID,
    session: DatabaseSession,
    kind: Annotated[list[ActivityKind] | None, Query()] = None,
    before: datetime | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> AdminActivityResponse:
    user = _get_user(session, user_id)
    data, next_before = insights.user_activity(
        session,
        user.id,
        kinds=kind or list(insights.ACTIVITY_SOURCES),
        before=before,
        limit=limit,
    )
    return AdminActivityResponse(data=data, next_before=next_before)


@router.get(
    "/users/{user_id}/plans", response_model=AdminUserPlansResponse, summary="A user's meal plan"
)
def user_plans(
    user_id: UUID,
    session: DatabaseSession,
    from_date: Annotated[date | None, Query(alias="from")] = None,
    to_date: Annotated[date | None, Query(alias="to")] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> AdminUserPlansResponse:
    user = _get_user(session, user_id)
    conditions = [UserMealPlanItem.user_id == user.id]
    if from_date:
        conditions.append(UserMealPlanItem.plan_date >= from_date)
    if to_date:
        conditions.append(UserMealPlanItem.plan_date <= to_date)
    total = _count(session, _counter(UserMealPlanItem, *conditions))
    items = session.scalars(
        select(UserMealPlanItem)
        .where(*conditions)
        .options(selectinload(UserMealPlanItem.recipe))
        .order_by(UserMealPlanItem.plan_date.desc(), UserMealPlanItem.meal_type)
        .limit(limit)
    ).all()
    return AdminUserPlansResponse(
        user=_user_rows(session, [user])[0],
        data=[
            AdminPlanItem(
                id=item.id,
                plan_date=item.plan_date,
                meal_type=item.meal_type,
                servings=item.servings,
                completion_status=item.completion_status,
                recipe_slug=item.recipe.slug,
                recipe_name=item.recipe.name,
                image_path=item.recipe.image_path,
            )
            for item in items
        ],
        total=total,
    )


@router.get("/plans", response_model=AdminPlannerListResponse, summary="Meal plans by user")
def planners(
    session: DatabaseSession,
    q: Annotated[str | None, Query(max_length=100)] = None,
    limit: Limit = 20,
    offset: Offset = 0,
) -> AdminPlannerListResponse:
    today = datetime.now(UTC).date()
    conditions = []
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        conditions.append(or_(User.full_name.ilike(pattern), User.email.ilike(pattern)))
    aggregate = (
        select(
            User,
            func.count(UserMealPlanItem.id).label("total"),
            func.sum(case((UserMealPlanItem.plan_date >= today, 1), else_=0)).label("upcoming"),
            func.sum(case((UserMealPlanItem.completion_status == "completed", 1), else_=0)).label(
                "completed"
            ),
            func.min(UserMealPlanItem.plan_date).label("first_date"),
            func.max(UserMealPlanItem.plan_date).label("last_date"),
        )
        .join(UserMealPlanItem, UserMealPlanItem.user_id == User.id)
        .where(*conditions)
        .group_by(User.id)
    )
    total = _count(session, select(func.count()).select_from(aggregate.subquery()))
    rows = session.execute(
        aggregate.order_by(func.max(UserMealPlanItem.plan_date).desc()).limit(limit).offset(offset)
    ).all()
    return AdminPlannerListResponse(
        data=[
            AdminPlannerRow(
                user_id=user.id,
                full_name=user.full_name,
                email=user.email,
                avatar_url=user.avatar_url,
                total_items=int(total_items or 0),
                upcoming_items=int(upcoming or 0),
                completed_items=int(completed or 0),
                first_date=first_date,
                last_date=last_date,
            )
            for user, total_items, upcoming, completed, first_date, last_date in rows
        ],
        total=total,
    )


RECIPE_SORTS = "catalog|updated|favorites|planned|cooked"


@router.get("/recipes", response_model=AdminRecipeEngagementListResponse, summary="Manage recipes")
def recipes(
    session: DatabaseSession,
    q: Annotated[str | None, Query(max_length=100)] = None,
    status_filter: Annotated[str | None, Query(alias="status", max_length=24)] = None,
    region: Annotated[str | None, Query(max_length=32)] = None,
    category: Annotated[str | None, Query(max_length=48)] = None,
    sort: Annotated[str, Query(pattern=f"^({RECIPE_SORTS})$")] = "catalog",
    limit: Limit = 20,
    offset: Offset = 0,
) -> AdminRecipeEngagementListResponse:
    conditions = []
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        conditions.append(
            or_(
                Recipe.name.ilike(pattern),
                Recipe.slug.ilike(pattern),
                Recipe.catalog_id.ilike(pattern),
            )
        )
    if status_filter:
        conditions.append(Recipe.status == status_filter)
    if region:
        conditions.append(Recipe.region == region)
    if category:
        conditions.append(Recipe.category == category)
    total = _count(session, _counter(Recipe, *conditions))
    statement, metrics = insights.recipes_with_engagement()
    order: tuple[Any, ...]
    if sort == "catalog":
        order = (Recipe.catalog_id.asc(), Recipe.name.asc())
    elif sort == "updated":
        order = (Recipe.updated_at.desc(), Recipe.name.asc())
    else:
        order = (metrics[sort].desc(), Recipe.name.asc())
    rows = session.execute(
        statement.where(*conditions).order_by(*order).limit(limit).offset(offset)
    ).all()
    return AdminRecipeEngagementListResponse(
        data=[_engagement_row(*row) for row in rows],
        total=total,
    )


def _engagement_row(
    recipe: Recipe, favorites: int, planned: int, cooked: int
) -> AdminRecipeEngagementRow:
    return AdminRecipeEngagementRow.model_validate(
        {
            **AdminRecipeRow.model_validate(recipe).model_dump(),
            "favorites": int(favorites or 0),
            "planned": int(planned or 0),
            "cooked": int(cooked or 0),
        }
    )


def _get_recipe(session: Session, slug: str) -> Recipe:
    recipe = session.scalar(select(Recipe).where(Recipe.slug == slug))
    if recipe is None:
        raise AdminResourceNotFoundError("Không tìm thấy món ăn.")
    return recipe


@router.get(
    "/recipes/{slug}/insights",
    response_model=AdminRecipeInsightsResponse,
    summary="Who favourites and cooks a recipe",
)
def recipe_insights(slug: str, session: DatabaseSession) -> AdminRecipeInsightsResponse:
    recipe = _get_recipe(session, slug)
    engagement, upcoming, skipped = insights.recipe_engagement(session, recipe.id)
    return AdminRecipeInsightsResponse(
        recipe=_engagement_row(recipe, engagement.favorites, engagement.planned, engagement.cooked),
        upcoming=upcoming,
        skipped=skipped,
        recent_favorites=insights.recipe_fans(session, recipe.id),
        top_cooks=insights.recipe_cooks(session, recipe.id),
    )


@router.patch("/recipes/{slug}", response_model=AdminRecipeRow, summary="Edit a recipe")
def update_recipe(
    slug: str, payload: AdminRecipeUpdate, session: DatabaseSession
) -> AdminRecipeRow:
    recipe = _get_recipe(session, slug)
    for field, value in payload.model_dump().items():
        setattr(recipe, field, value)
    session.commit()
    session.refresh(recipe)
    return AdminRecipeRow.model_validate(recipe)


@router.get("/articles", response_model=ArticleListResponse, summary="All articles and stories")
def articles(
    session: DatabaseSession,
    status_filter: Annotated[ArticleStatus | None, Query(alias="status")] = None,
    kind: ArticleKind | None = None,
    category: ArticleCategory | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    limit: Limit = 20,
    offset: Offset = 0,
) -> ArticleListResponse:
    items, total = list_articles(
        session,
        statuses=(status_filter,) if status_filter else None,
        kind=kind,
        category=category,
        query=q,
        limit=limit,
        offset=offset,
    )
    return ArticleListResponse(data=[to_summary(item) for item in items], total=total)


@router.patch(
    "/articles/{article_id}/moderation",
    response_model=ArticleDetail,
    summary="Approve, reject or hide an article",
)
def moderate(
    article_id: UUID, payload: ArticleModerationRequest, session: DatabaseSession
) -> ArticleDetail:
    return to_detail(moderate_article(session, article_id, payload.status, payload.note))


def _submission_response(item: RecipeSubmission) -> AdminSubmissionResponse:
    return AdminSubmissionResponse.model_validate(
        {
            **{
                field: getattr(item, field)
                for field in AdminSubmissionResponse.model_fields
                if field != "submitter"
            },
            "submitter": SubmissionSubmitter(
                id=item.user.id, full_name=item.user.full_name, email=item.user.email
            ),
        }
    )


@router.get(
    "/submissions", response_model=AdminSubmissionListResponse, summary="Recipe suggestions"
)
def submissions(
    session: DatabaseSession,
    status_filter: Annotated[SubmissionStatus | None, Query(alias="status")] = None,
    limit: Limit = 20,
    offset: Offset = 0,
) -> AdminSubmissionListResponse:
    conditions = [RecipeSubmission.status != "draft"]
    if status_filter:
        conditions = [RecipeSubmission.status == status_filter]
    total = _count(session, _counter(RecipeSubmission, *conditions))
    items = session.scalars(
        select(RecipeSubmission)
        .where(*conditions)
        .options(selectinload(RecipeSubmission.user))
        .order_by(RecipeSubmission.updated_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return AdminSubmissionListResponse(
        data=[_submission_response(item) for item in items], total=total
    )


@router.patch(
    "/submissions/{submission_id}",
    response_model=AdminSubmissionResponse,
    summary="Review a recipe suggestion",
)
def review_submission(
    submission_id: UUID, payload: SubmissionReviewRequest, session: DatabaseSession
) -> AdminSubmissionResponse:
    item = session.scalar(
        select(RecipeSubmission)
        .where(RecipeSubmission.id == submission_id)
        .options(selectinload(RecipeSubmission.user))
    )
    if item is None:
        raise AdminResourceNotFoundError("Không tìm thấy đề xuất món.")
    item.status = payload.status
    item.admin_note = (payload.admin_note or "").strip() or None
    session.commit()
    session.refresh(item)
    return _submission_response(item)


@router.get("/support", response_model=SupportTicketListResponse, summary="Support requests")
def support_tickets(
    session: DatabaseSession,
    status_filter: Annotated[SupportStatus | None, Query(alias="status")] = None,
    limit: Limit = 20,
    offset: Offset = 0,
) -> SupportTicketListResponse:
    conditions = [SupportTicket.status == status_filter] if status_filter else []
    total = _count(session, _counter(SupportTicket, *conditions))
    items = session.scalars(
        select(SupportTicket)
        .where(*conditions)
        .order_by(SupportTicket.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return SupportTicketListResponse(
        data=[SupportTicketResponse.model_validate(item) for item in items], total=total
    )


@router.patch(
    "/support/{ticket_id}", response_model=SupportTicketResponse, summary="Update support request"
)
def update_support_ticket(
    ticket_id: UUID, payload: SupportTicketUpdate, session: DatabaseSession
) -> SupportTicketResponse:
    ticket = session.get(SupportTicket, ticket_id)
    if ticket is None:
        raise AdminResourceNotFoundError("Không tìm thấy yêu cầu hỗ trợ.")
    ticket.status = payload.status
    ticket.admin_note = (payload.admin_note or "").strip() or None
    session.commit()
    session.refresh(ticket)
    return SupportTicketResponse.model_validate(ticket)
