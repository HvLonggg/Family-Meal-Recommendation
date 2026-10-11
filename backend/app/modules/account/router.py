from datetime import UTC, datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, undefer

from app.core.images import decode_image_data_url
from app.db.session import get_db_session
from app.modules.account.preferences import (
    PreferencesResponse,
    UserPreferences,
    read_preferences,
    scope_preferences_for_role,
    to_response,
)
from app.modules.account.schemas import (
    AccountOverviewResponse,
    AccountStats,
    AvatarUploadRequest,
    ProfileUpdateRequest,
)
from app.modules.articles.models import Article
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import AuthIdentity, User
from app.modules.auth.router import clear_refresh_cookie
from app.modules.auth.schemas import MessageResponse, UserResponse
from app.modules.auth.service import revoke_all_sessions
from app.modules.favorites.models import UserFavoriteRecipe
from app.modules.planner.models import UserMealPlanItem
from app.modules.recipes.models import Recipe
from app.modules.submissions.models import RecipeSubmission

router = APIRouter(prefix="/account")
AVATAR_MAX_BYTES = 400 * 1024

CurrentUser = Annotated[User, Depends(get_current_user)]
DatabaseSession = Annotated[Session, Depends(get_db_session)]


def _count(session: Session, statement: Any) -> int:
    return int(session.scalar(statement) or 0)


@router.get("/overview", response_model=AccountOverviewResponse, summary="Account overview")
def account_overview(
    current_user: CurrentUser, session: DatabaseSession
) -> AccountOverviewResponse:
    user_id = current_user.id
    stats = AccountStats(
        favorites=_count(
            session,
            select(func.count())
            .select_from(UserFavoriteRecipe)
            .where(UserFavoriteRecipe.user_id == user_id),
        ),
        planned_meals=_count(
            session,
            select(func.count())
            .select_from(UserMealPlanItem)
            .where(UserMealPlanItem.user_id == user_id),
        ),
        cooked_meals=_count(
            session,
            select(func.count())
            .select_from(UserMealPlanItem)
            .where(
                UserMealPlanItem.user_id == user_id,
                UserMealPlanItem.completion_status == "completed",
            ),
        ),
        stories=_count(
            session,
            select(func.count()).select_from(Article).where(Article.author_id == user_id),
        ),
        published_stories=_count(
            session,
            select(func.count())
            .select_from(Article)
            .where(Article.author_id == user_id, Article.status == "published"),
        ),
        submissions=_count(
            session,
            select(func.count())
            .select_from(RecipeSubmission)
            .where(RecipeSubmission.user_id == user_id),
        ),
    )
    providers = list(
        session.scalars(select(AuthIdentity.provider).where(AuthIdentity.user_id == user_id))
    )
    return AccountOverviewResponse(
        user=UserResponse.model_validate(current_user),
        stats=stats,
        has_password=bool(current_user.password_hash),
        last_login_at=current_user.last_login_at,
        linked_providers=sorted(set(providers)),
    )


@router.patch("/profile", response_model=UserResponse, summary="Update profile")
def update_profile(
    payload: ProfileUpdateRequest, current_user: CurrentUser, session: DatabaseSession
) -> UserResponse:
    current_user.full_name = payload.full_name
    session.commit()
    session.refresh(current_user)
    return UserResponse.model_validate(current_user)


@router.put("/avatar", response_model=UserResponse, summary="Upload avatar")
def upload_avatar(
    payload: AvatarUploadRequest, current_user: CurrentUser, session: DatabaseSession
) -> UserResponse:
    image = decode_image_data_url(payload.data_url, max_bytes=AVATAR_MAX_BYTES)
    current_user.avatar_data = image.data
    current_user.avatar_content_type = image.content_type
    current_user.avatar_updated_at = datetime.now(UTC)
    session.commit()
    session.refresh(current_user)
    return UserResponse.model_validate(current_user)


@router.delete("/avatar", response_model=UserResponse, summary="Remove avatar")
def remove_avatar(current_user: CurrentUser, session: DatabaseSession) -> UserResponse:
    current_user.avatar_data = None
    current_user.avatar_content_type = None
    current_user.avatar_updated_at = None
    session.commit()
    session.refresh(current_user)
    return UserResponse.model_validate(current_user)


@router.get("/avatar/{user_id}", summary="Get a user's avatar image")
def avatar_image(user_id: UUID, session: DatabaseSession) -> Response:
    user = session.scalar(select(User).where(User.id == user_id).options(undefer(User.avatar_data)))
    if user is None or not user.avatar_data or not user.avatar_content_type:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return Response(
        content=user.avatar_data,
        media_type=user.avatar_content_type,
        headers={
            "Cache-Control": "public, max-age=86400",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/preferences", response_model=PreferencesResponse, summary="Get preferences")
def get_preferences(current_user: CurrentUser) -> PreferencesResponse:
    return to_response(read_preferences(current_user.preferences))


@router.put("/preferences", response_model=PreferencesResponse, summary="Save preferences")
def save_preferences(
    payload: UserPreferences, current_user: CurrentUser, session: DatabaseSession
) -> PreferencesResponse:
    current = read_preferences(current_user.preferences)
    scoped = scope_preferences_for_role(payload, current, current_user.role)
    current_user.preferences = scoped.model_dump(mode="json")
    session.commit()
    return to_response(scoped)


@router.post(
    "/sessions/revoke-all",
    response_model=MessageResponse,
    summary="Sign out from every device",
)
def revoke_every_session(
    response: Response, current_user: CurrentUser, session: DatabaseSession
) -> MessageResponse:
    revoke_all_sessions(session, current_user)
    session.commit()
    clear_refresh_cookie(response)
    return MessageResponse(message="Đã đăng xuất khỏi tất cả thiết bị. Hãy đăng nhập lại.")


@router.get("/export", summary="Export personal data")
def export_account_data(current_user: CurrentUser, session: DatabaseSession) -> dict[str, Any]:
    favorites = session.execute(
        select(Recipe.slug, Recipe.name, UserFavoriteRecipe.created_at)
        .join(UserFavoriteRecipe, UserFavoriteRecipe.recipe_id == Recipe.id)
        .where(UserFavoriteRecipe.user_id == current_user.id)
        .order_by(UserFavoriteRecipe.created_at.desc())
    ).all()
    plans = session.execute(
        select(
            UserMealPlanItem.plan_date,
            UserMealPlanItem.meal_type,
            UserMealPlanItem.servings,
            UserMealPlanItem.completion_status,
            Recipe.slug,
            Recipe.name,
        )
        .join(Recipe, Recipe.id == UserMealPlanItem.recipe_id)
        .where(UserMealPlanItem.user_id == current_user.id)
        .order_by(UserMealPlanItem.plan_date.desc())
    ).all()
    articles = session.scalars(
        select(Article).where(Article.author_id == current_user.id).order_by(Article.created_at)
    ).all()
    submissions = session.scalars(
        select(RecipeSubmission)
        .where(RecipeSubmission.user_id == current_user.id)
        .order_by(RecipeSubmission.created_at)
    ).all()
    return {
        "exported_at": datetime.now(UTC).isoformat(),
        "profile": {
            "full_name": current_user.full_name,
            "email": current_user.email,
            "role": current_user.role,
            "created_at": current_user.created_at.isoformat(),
        },
        "preferences": read_preferences(current_user.preferences).model_dump(mode="json"),
        "favorites": [
            {"slug": slug, "name": name, "saved_at": saved_at.isoformat()}
            for slug, name, saved_at in favorites
        ],
        "meal_plans": [
            {
                "date": plan_date.isoformat(),
                "meal_type": meal_type,
                "servings": servings,
                "status": completion_status,
                "recipe_slug": slug,
                "recipe_name": name,
            }
            for plan_date, meal_type, servings, completion_status, slug, name in plans
        ],
        "stories": [
            {
                "title": article.title,
                "status": article.status,
                "category": article.category,
                "body": article.body,
                "created_at": article.created_at.isoformat(),
            }
            for article in articles
        ],
        "recipe_submissions": [
            {
                "name": item.name,
                "status": item.status,
                "story": item.story,
                "ingredients": item.ingredients,
                "steps": item.steps,
                "created_at": item.created_at.isoformat(),
            }
            for item in submissions
        ],
    }
