import logging
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from pydantic import EmailStr
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.core.exceptions import DomainError
from app.core.images import decode_image_data_url
from app.db.session import get_db_session
from app.modules.admin import insights
from app.modules.admin.email_schemas import (
    MealSuggestionEmailListResponse,
    MealSuggestionEmailResponse,
    MealSuggestionRecipient,
    MealSuggestionRecipientListResponse,
    MealSuggestionRecipientLookup,
    MealSuggestionSendRequest,
    MealSuggestionSendResponse,
)
from app.modules.admin.meal_emails import expire_stale_sending, queue_meal_suggestions
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
    AdminRecipeCreate,
    AdminRecipeEngagementListResponse,
    AdminRecipeEngagementRow,
    AdminRecipeImageUpdate,
    AdminRecipeInsightsResponse,
    AdminRecipeRow,
    AdminRecipeUpdate,
    AdminUserCreate,
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
from app.modules.articles.service import (
    list_articles,
    moderate_article,
    slugify,
    to_detail,
    to_summary,
)
from app.modules.assistant import documents, knowledge
from app.modules.assistant.models import AssistantKnowledgeDocument
from app.modules.assistant.schemas import (
    KnowledgeDocumentDetail,
    KnowledgeDocumentList,
    KnowledgeDocumentOut,
    KnowledgeDocumentUpdate,
    KnowledgeFileIn,
    KnowledgeNoteIn,
    KnowledgeStatus,
)
from app.modules.auth.dependencies import require_admin
from app.modules.auth.email import describe_delivery_error, send_support_reply_email
from app.modules.auth.models import AuthIdentity, User
from app.modules.auth.security import hash_password
from app.modules.auth.service import EmailAlreadyExistsError, revoke_all_sessions
from app.modules.favorites.models import UserFavoriteRecipe
from app.modules.planner.models import UserMealPlanEvent, UserMealPlanItem
from app.modules.recipes.models import Recipe, RecipeIngredient, RecipeStep
from app.modules.recipes.search import normalize_search
from app.modules.submissions.models import RecipeSubmission
from app.modules.submissions.schemas import (
    AdminSubmissionListResponse,
    AdminSubmissionResponse,
    SubmissionReviewRequest,
    SubmissionStatus,
    SubmissionSubmitter,
)
from app.modules.support.models import AdminMealSuggestionEmail, SupportTicket
from app.modules.support.schemas import (
    AdminSupportTicketListResponse,
    AdminSupportTicketResponse,
    SupportRecipient,
    SupportRecipientListResponse,
    SupportStatus,
    SupportTicketReplyRequest,
    SupportTicketUpdate,
)
from app.modules.support.service import ticket_reference

logger = logging.getLogger("bep_viet.admin")

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


class AdminEmailDeliveryError(DomainError):
    code = "ADMIN_EMAIL_DELIVERY_FAILED"
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE


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


@router.post(
    "/users",
    response_model=AdminUserRow,
    status_code=status.HTTP_201_CREATED,
    summary="Create an account",
)
def create_user(payload: AdminUserCreate, session: DatabaseSession) -> AdminUserRow:
    if session.scalar(select(User.id).where(User.email == payload.email)) is not None:
        raise EmailAlreadyExistsError("Email này đã có tài khoản trong hệ thống.")
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        role=payload.role,
        status="active",
        # Quản trị viên tạo hộ nên email được coi là đã xác minh.
        email_verified_at=datetime.now(UTC),
    )
    session.add(user)
    session.flush()
    session.add(
        AuthIdentity(
            user_id=user.id,
            provider="password",
            provider_subject=payload.email,
            provider_email=payload.email,
        )
    )
    session.commit()
    session.refresh(user)
    return _user_rows(session, [user])[0]


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


RECIPE_IMAGE_MAX_BYTES = 8 * 1024 * 1024


def _apply_recipe_image(recipe: Recipe, data_url: str) -> None:
    from app.modules.recipes.images import prepare_recipe_cutout

    upload = decode_image_data_url(data_url, max_bytes=RECIPE_IMAGE_MAX_BYTES)
    recipe.image_data = prepare_recipe_cutout(upload.data)
    recipe.image_content_type = "image/webp"
    version = int(datetime.now(UTC).timestamp())
    # Cùng origin với giao diện (proxy /api), nên dùng thẳng làm src ảnh ở mọi nơi.
    recipe.image_path = f"{get_settings().api_v1_prefix}/recipes/{recipe.slug}/image?v={version}"


@router.post(
    "/recipes",
    response_model=AdminRecipeRow,
    status_code=status.HTTP_201_CREATED,
    summary="Create a recipe",
)
def create_recipe(payload: AdminRecipeCreate, session: DatabaseSession) -> AdminRecipeRow:
    base = slugify(payload.name)
    slug = base
    suffix = 2
    while session.scalar(select(Recipe.id).where(Recipe.slug == slug)) is not None:
        slug = f"{base}-{suffix}"
        suffix += 1
    fields = payload.model_dump(
        exclude={"image", "image_alt", "ingredients", "preparation_steps", "cooking_steps"}
    )
    recipe = Recipe(
        slug=slug,
        **fields,
        image_path="",
        image_alt=payload.image_alt or payload.name,
        source_name="Bếp Việt",
        source_url="",
        content={},
    )
    _apply_recipe_image(recipe, payload.image)
    for position, ingredient in enumerate(payload.ingredients, start=1):
        recipe.ingredients.append(
            RecipeIngredient(
                group_name=ingredient.group_name,
                name=ingredient.name,
                amount=ingredient.amount,
                unit=ingredient.unit,
                note=ingredient.note,
                scalable=True,
                position=position,
            )
        )
    steps = [("so_che", step) for step in payload.preparation_steps] + [
        ("thuc_hien", step) for step in payload.cooking_steps
    ]
    for position, (step_type, content) in enumerate(steps, start=1):
        recipe.steps.append(RecipeStep(step_type=step_type, content=content, position=position))
    recipe.search_text = normalize_search(
        " ".join(
            [
                recipe.name,
                recipe.excerpt,
                recipe.region,
                recipe.category,
                *(ingredient.name for ingredient in payload.ingredients),
                f"{recipe.prep_minutes + recipe.cook_minutes} phút",
            ]
        )
    )
    session.add(recipe)
    session.commit()
    session.refresh(recipe)
    return AdminRecipeRow.model_validate(recipe)


@router.put("/recipes/{slug}/image", response_model=AdminRecipeRow, summary="Replace recipe image")
def replace_recipe_image(
    slug: str, payload: AdminRecipeImageUpdate, session: DatabaseSession
) -> AdminRecipeRow:
    recipe = _get_recipe(session, slug)
    _apply_recipe_image(recipe, payload.image)
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


@router.get("/support", response_model=AdminSupportTicketListResponse, summary="Support requests")
def support_tickets(
    session: DatabaseSession,
    status_filter: Annotated[SupportStatus | None, Query(alias="status")] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    limit: Limit = 20,
    offset: Offset = 0,
) -> AdminSupportTicketListResponse:
    conditions: list[Any] = [SupportTicket.status == status_filter] if status_filter else []
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        conditions.append(
            or_(
                SupportTicket.email.ilike(pattern),
                SupportTicket.name.ilike(pattern),
                SupportTicket.subject.ilike(pattern),
                SupportTicket.message.ilike(pattern),
            )
        )
    total = _count(session, _counter(SupportTicket, *conditions))
    items = session.scalars(
        select(SupportTicket)
        .where(*conditions)
        .order_by(SupportTicket.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return AdminSupportTicketListResponse(
        data=[AdminSupportTicketResponse.model_validate(item) for item in items], total=total
    )


@router.patch(
    "/support/{ticket_id}",
    response_model=AdminSupportTicketResponse,
    summary="Update support request",
)
def update_support_ticket(
    ticket_id: UUID, payload: SupportTicketUpdate, session: DatabaseSession
) -> AdminSupportTicketResponse:
    ticket = session.get(SupportTicket, ticket_id)
    if ticket is None:
        raise AdminResourceNotFoundError("Không tìm thấy yêu cầu hỗ trợ.")
    ticket.status = payload.status
    ticket.admin_note = (payload.admin_note or "").strip() or None
    session.commit()
    session.refresh(ticket)
    return AdminSupportTicketResponse.model_validate(ticket)


@router.post(
    "/support/{ticket_id}/viewed",
    response_model=AdminSupportTicketResponse,
    summary="Mark a support request as viewed",
)
def mark_support_ticket_viewed(
    ticket_id: UUID, session: DatabaseSession
) -> AdminSupportTicketResponse:
    ticket = session.get(SupportTicket, ticket_id)
    if ticket is None:
        raise AdminResourceNotFoundError("Không tìm thấy yêu cầu hỗ trợ.")
    if ticket.viewed_at is None:
        ticket.viewed_at = datetime.now(UTC)
        session.commit()
        session.refresh(ticket)
    return AdminSupportTicketResponse.model_validate(ticket)


@router.post(
    "/support/{ticket_id}/reply",
    response_model=AdminSupportTicketResponse,
    summary="Reply to a support request by email",
)
def reply_to_support_ticket(
    ticket_id: UUID,
    payload: SupportTicketReplyRequest,
    session: DatabaseSession,
) -> AdminSupportTicketResponse:
    ticket = session.get(SupportTicket, ticket_id)
    if ticket is None:
        raise AdminResourceNotFoundError("Không tìm thấy yêu cầu hỗ trợ.")
    now = datetime.now(UTC)
    ticket.reply_status = "sending"
    ticket.reply_attempts += 1
    ticket.reply_last_attempt_at = now
    ticket.reply_last_error = None
    ticket.reply_subject = payload.subject
    ticket.reply_message = payload.message
    session.commit()
    try:
        send_support_reply_email(
            recipient=ticket.email,
            recipient_name=ticket.name,
            subject=payload.subject,
            body=payload.message,
            reference=ticket_reference(ticket.id),
        )
    except Exception as exc:
        logger.warning("Support reply email failed: %s", describe_delivery_error(exc))
        ticket = session.get(SupportTicket, ticket_id)
        if ticket is not None:
            ticket.reply_status = "failed"
            ticket.reply_last_error = describe_delivery_error(exc)
            session.commit()
        raise AdminEmailDeliveryError(
            "Email phản hồi chưa gửi được. Vui lòng thử lại sau."
        ) from exc

    ticket = session.get(SupportTicket, ticket_id)
    if ticket is None:
        raise AdminResourceNotFoundError("Không tìm thấy yêu cầu hỗ trợ.")
    ticket.reply_status = "sent"
    ticket.reply_sent_at = datetime.now(UTC)
    if ticket.status == "open":
        ticket.status = "in_progress"
    session.commit()
    session.refresh(ticket)
    return AdminSupportTicketResponse.model_validate(ticket)


@router.get(
    "/support/recipients",
    response_model=SupportRecipientListResponse,
    summary="List unique support request senders",
)
def support_recipients(
    session: DatabaseSession,
    q: Annotated[str | None, Query(max_length=100)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> SupportRecipientListResponse:
    conditions = []
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        conditions.append(
            or_(SupportTicket.email.ilike(pattern), SupportTicket.name.ilike(pattern))
        )
    latest_by_email = session.execute(
        select(SupportTicket.email, func.max(SupportTicket.created_at).label("latest_at"))
        .where(*conditions)
        .group_by(SupportTicket.email)
        .order_by(func.max(SupportTicket.created_at).desc())
        .limit(limit)
    ).all()
    data = []
    for email, latest_at in latest_by_email:
        ticket = session.scalar(
            select(SupportTicket)
            .where(SupportTicket.email == email)
            .order_by(SupportTicket.created_at.desc())
            .limit(1)
        )
        user = session.scalar(select(User).where(User.email == email))
        data.append(
            SupportRecipient(
                email=email,
                name=user.full_name if user else ticket.name if ticket else email,
                latest_at=latest_at,
            )
        )
    return SupportRecipientListResponse(data=data)


@router.post(
    "/meal-suggestions/send",
    response_model=MealSuggestionSendResponse,
    summary="Email a meal suggestion to selected recipients",
)
def send_meal_suggestions(
    payload: MealSuggestionSendRequest,
    session: DatabaseSession,
    admin: AdminUser,
) -> MealSuggestionSendResponse:
    recipes_by_slug = {
        recipe.slug: recipe
        for recipe in session.scalars(
            select(Recipe).where(
                Recipe.slug.in_(payload.recipe_slugs), Recipe.status == "published"
            )
        )
    }
    if len(recipes_by_slug) != len(payload.recipe_slugs):
        raise AdminResourceNotFoundError("Một hoặc nhiều món đã chọn không còn được hiển thị.")
    recipes = [recipes_by_slug[slug] for slug in payload.recipe_slugs]
    recipe_data = [
        {
            "slug": recipe.slug,
            "name": recipe.name,
            "excerpt": recipe.excerpt[:400],
            "image_path": recipe.image_path,
        }
        for recipe in recipes
    ]
    users = list(session.scalars(select(User).where(User.email.in_(payload.recipient_emails))))
    users_by_email = {user.email: user for user in users if user.email}
    results: list[AdminMealSuggestionEmail] = []
    for email in payload.recipient_emails:
        user = users_by_email.get(email)
        recent_ticket = None
        if user is None:
            recent_ticket = session.scalar(
                select(SupportTicket)
                .where(SupportTicket.email == email)
                .order_by(SupportTicket.created_at.desc())
                .limit(1)
            )
        # Tài khoản có sẵn dùng tên trong hệ thống; email mới dùng tên quản trị viên nhập,
        # rồi đến tên trong yêu cầu hỗ trợ gần nhất; không có gì thì chào “bạn”.
        recipient_name = (
            user.full_name
            if user
            else payload.recipient_names.get(email)
            or (recent_ticket.name if recent_ticket else None)
            or "bạn"
        )
        delivery = AdminMealSuggestionEmail(
            admin_user_id=admin.id,
            recipient_user_id=user.id if user else None,
            recipient_email=email,
            recipient_name=recipient_name,
            meal_type=payload.meal_type,
            subject=payload.subject,
            intro_message=payload.intro_message,
            closing_message=payload.closing_message,
            recipe_data=recipe_data,
            status="sending",
            attempts=1,
        )
        session.add(delivery)
        results.append(delivery)
    session.commit()
    response = MealSuggestionSendResponse(
        data=[MealSuggestionEmailResponse.model_validate(item) for item in results],
        sent=0,
        failed=0,
        queued=len(results),
    )
    # Trả kết quả ngay; email được gửi song song ở nền, lịch sử tự cập nhật trạng thái.
    queue_meal_suggestions(session.get_bind(), [delivery.id for delivery in results])
    return response


@router.get(
    "/meal-suggestions/recipient",
    response_model=MealSuggestionRecipientLookup,
    summary="Look up the greeting name for a meal suggestion recipient",
)
def meal_suggestion_recipient(
    session: DatabaseSession, email: Annotated[EmailStr, Query()]
) -> MealSuggestionRecipientLookup:
    normalized = str(email).strip().casefold()
    user = session.scalar(select(User).where(func.lower(User.email) == normalized))
    if user is not None:
        return MealSuggestionRecipientLookup(email=normalized, name=user.full_name, source="user")
    ticket = session.scalar(
        select(SupportTicket)
        .where(func.lower(SupportTicket.email) == normalized)
        .order_by(SupportTicket.created_at.desc())
        .limit(1)
    )
    if ticket is not None:
        return MealSuggestionRecipientLookup(email=normalized, name=ticket.name, source="support")
    return MealSuggestionRecipientLookup(email=normalized, name=None, source="new")


@router.get(
    "/meal-suggestions/recipients",
    response_model=MealSuggestionRecipientListResponse,
    summary="List people who already received meal suggestion emails",
)
def meal_suggestion_recipients(
    session: DatabaseSession,
    q: Annotated[str | None, Query(max_length=100)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 5,
    offset: Offset = 0,
) -> MealSuggestionRecipientListResponse:
    conditions = [AdminMealSuggestionEmail.status == "sent"]
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        conditions.append(
            or_(
                AdminMealSuggestionEmail.recipient_email.ilike(pattern),
                AdminMealSuggestionEmail.recipient_name.ilike(pattern),
            )
        )
    grouped = (
        select(
            AdminMealSuggestionEmail.recipient_email.label("email"),
            func.max(AdminMealSuggestionEmail.sent_at).label("last_sent_at"),
            func.count(AdminMealSuggestionEmail.id).label("sent_count"),
        )
        .where(*conditions)
        .group_by(AdminMealSuggestionEmail.recipient_email)
    )
    total = session.scalar(select(func.count()).select_from(grouped.subquery())) or 0
    rows = session.execute(
        grouped.order_by(func.max(AdminMealSuggestionEmail.sent_at).desc())
        .limit(limit)
        .offset(offset)
    ).all()
    data = []
    for row in rows:
        latest_name = session.scalar(
            select(AdminMealSuggestionEmail.recipient_name)
            .where(AdminMealSuggestionEmail.recipient_email == row.email)
            .order_by(AdminMealSuggestionEmail.created_at.desc())
            .limit(1)
        )
        data.append(
            MealSuggestionRecipient(
                email=row.email,
                name=latest_name or row.email,
                last_sent_at=row.last_sent_at,
                sent_count=row.sent_count,
            )
        )
    return MealSuggestionRecipientListResponse(data=data, total=total)


@router.get(
    "/meal-suggestions/history",
    response_model=MealSuggestionEmailListResponse,
    summary="List meal suggestion email history",
)
def meal_suggestion_email_history(
    session: DatabaseSession,
    limit: Limit = 20,
    offset: Offset = 0,
) -> MealSuggestionEmailListResponse:
    expire_stale_sending(session)
    total = _count(session, _counter(AdminMealSuggestionEmail))
    items = session.scalars(
        select(AdminMealSuggestionEmail)
        .order_by(AdminMealSuggestionEmail.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return MealSuggestionEmailListResponse(
        data=[MealSuggestionEmailResponse.model_validate(item) for item in items], total=total
    )


@router.get(
    "/assistant/knowledge",
    response_model=KnowledgeStatus,
    summary="Assistant RAG knowledge base status",
)
def assistant_knowledge_status(session: DatabaseSession) -> KnowledgeStatus:
    return KnowledgeStatus.model_validate(knowledge.knowledge_status(session))


@router.post(
    "/assistant/knowledge/reindex",
    response_model=KnowledgeStatus,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Rebuild the assistant RAG knowledge base in the background",
)
def assistant_knowledge_reindex(session: DatabaseSession) -> KnowledgeStatus:
    knowledge.ensure_fresh(session.get_bind(), force=True)
    return KnowledgeStatus.model_validate(knowledge.knowledge_status(session))


def _document_out(item: AssistantKnowledgeDocument) -> KnowledgeDocumentOut:
    out = KnowledgeDocumentOut.model_validate(item)
    out.characters = len(item.text)
    out.preview = " ".join(item.text.split())[:240]
    return out


def _document_detail(item: AssistantKnowledgeDocument) -> KnowledgeDocumentDetail:
    return KnowledgeDocumentDetail(**_document_out(item).model_dump(), text=item.text)


@router.get(
    "/assistant/documents",
    response_model=KnowledgeDocumentList,
    summary="Knowledge taught to the assistant by admins",
)
def assistant_documents(session: DatabaseSession) -> KnowledgeDocumentList:
    return KnowledgeDocumentList(
        data=[_document_out(item) for item in documents.list_documents(session)],
        status=KnowledgeStatus.model_validate(knowledge.knowledge_status(session)),
    )


@router.post(
    "/assistant/documents",
    response_model=KnowledgeDocumentDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Teach the assistant a written note",
)
def teach_assistant_note(
    payload: KnowledgeNoteIn, session: DatabaseSession, admin: AdminUser
) -> KnowledgeDocumentDetail:
    item = documents.create_note(session, admin, title=payload.title, text=payload.text)
    return _document_detail(item)


@router.post(
    "/assistant/documents/upload",
    response_model=KnowledgeDocumentDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Teach the assistant from a .docx, .pptx, .txt, .md or .csv file",
)
def teach_assistant_file(
    payload: KnowledgeFileIn, session: DatabaseSession, admin: AdminUser
) -> KnowledgeDocumentDetail:
    item = documents.create_from_file(
        session,
        admin,
        file_name=payload.file_name,
        content_type=payload.content_type,
        data_url=payload.data,
        title=payload.title,
    )
    return _document_detail(item)


@router.get(
    "/assistant/documents/{document_id}",
    response_model=KnowledgeDocumentDetail,
    summary="Read a taught document",
)
def assistant_document(document_id: UUID, session: DatabaseSession) -> KnowledgeDocumentDetail:
    return _document_detail(documents.get_document(session, document_id))


@router.patch(
    "/assistant/documents/{document_id}",
    response_model=KnowledgeDocumentDetail,
    summary="Edit, enable or disable a taught document",
)
def update_assistant_document(
    document_id: UUID, payload: KnowledgeDocumentUpdate, session: DatabaseSession
) -> KnowledgeDocumentDetail:
    item = documents.update_document(
        session, document_id, title=payload.title, text=payload.text, active=payload.active
    )
    return _document_detail(item)


@router.delete(
    "/assistant/documents/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a taught document from the assistant",
)
def delete_assistant_document(document_id: UUID, session: DatabaseSession) -> None:
    documents.delete_document(session, document_id)
