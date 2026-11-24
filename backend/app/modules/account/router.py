from datetime import UTC, datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, undefer

from app.core.config import get_settings
from app.core.images import decode_image_data_url, reencode_without_metadata
from app.core.net import client_ip
from app.db.session import get_db_session
from app.modules.account.deletion import (
    ACCOUNT_DELETE_PURPOSE,
    delete_user_account,
    verify_deletion_identity,
)
from app.modules.account.preferences import (
    PreferencesResponse,
    UserPreferences,
    read_preferences,
    scope_preferences_for_role,
    to_response,
)
from app.modules.account.schemas import (
    AccountDeleteRequest,
    AccountOverviewResponse,
    AccountStats,
    AvatarUploadRequest,
    ProfileUpdateRequest,
)
from app.modules.articles.models import Article
from app.modules.assistant.models import AssistantConversation, AssistantMemory
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import AuthIdentity, User
from app.modules.auth.router import clear_refresh_cookie, request_email_otp_code
from app.modules.auth.schemas import (
    AcceptTermsRequest,
    ForgotPasswordResponse,
    MessageResponse,
    UserResponse,
)
from app.modules.auth.service import InvalidCredentialsError, revoke_all_sessions
from app.modules.cooking.models import UserCookLog
from app.modules.favorites.models import UserFavoriteRecipe
from app.modules.planner.models import UserMealPlanItem, UserVegetarianDay
from app.modules.recipes.models import Recipe
from app.modules.saved_meals.models import SavedMeal
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
    image = reencode_without_metadata(
        decode_image_data_url(payload.data_url, max_bytes=AVATAR_MAX_BYTES)
    )
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


@router.post("/accept-terms", response_model=UserResponse, summary="Accept current Terms/Privacy")
def accept_terms(
    payload: AcceptTermsRequest, current_user: CurrentUser, session: DatabaseSession
) -> UserResponse:
    # Lưu bằng chứng đồng ý cho tài khoản tạo qua Google/Facebook hoặc khi phiên bản thay đổi.
    current_user.terms_version = payload.version
    current_user.terms_accepted_at = datetime.now(UTC)
    session.commit()
    session.refresh(current_user)
    return UserResponse.model_validate(current_user)


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
    vegetarian_days = session.scalars(
        select(UserVegetarianDay)
        .where(UserVegetarianDay.user_id == current_user.id)
        .order_by(UserVegetarianDay.day.desc())
    ).all()
    articles = session.scalars(
        select(Article).where(Article.author_id == current_user.id).order_by(Article.created_at)
    ).all()
    submissions = session.scalars(
        select(RecipeSubmission)
        .where(RecipeSubmission.user_id == current_user.id)
        .order_by(RecipeSubmission.created_at)
    ).all()
    conversations = session.scalars(
        select(AssistantConversation)
        .where(AssistantConversation.user_id == current_user.id)
        .order_by(AssistantConversation.created_at)
    ).all()
    memories = session.scalars(
        select(AssistantMemory)
        .where(AssistantMemory.user_id == current_user.id)
        .order_by(AssistantMemory.created_at)
    ).all()
    cook_logs = session.scalars(
        select(UserCookLog)
        .where(UserCookLog.user_id == current_user.id)
        .order_by(UserCookLog.cooked_at.desc())
    ).all()
    saved_meals = session.scalars(
        select(SavedMeal)
        .where(SavedMeal.user_id == current_user.id)
        .order_by(SavedMeal.created_at.desc())
    ).all()
    return {
        "exported_at": datetime.now(UTC).isoformat(),
        "profile": {
            "full_name": current_user.full_name,
            "email": current_user.email,
            "role": current_user.role,
            "created_at": current_user.created_at.isoformat(),
            "last_login_at": (
                current_user.last_login_at.isoformat() if current_user.last_login_at else None
            ),
            "linked_providers": sorted(
                set(
                    session.scalars(
                        select(AuthIdentity.provider).where(AuthIdentity.user_id == current_user.id)
                    )
                )
            ),
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
        "vegetarian_days": [
            {"date": record.day.isoformat(), "is_vegetarian": record.is_vegetarian}
            for record in vegetarian_days
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
        "assistant_conversations": [
            {
                "title": conversation.title,
                "created_at": conversation.created_at.isoformat(),
                "messages": [
                    {
                        "role": message.role,
                        "content": message.content,
                        "created_at": message.created_at.isoformat(),
                    }
                    for message in conversation.messages
                ],
            }
            for conversation in conversations
        ],
        "assistant_memories": [
            {"kind": item.kind, "content": item.content, "created_at": item.created_at.isoformat()}
            for item in memories
        ],
        "cook_logs": [
            {
                "recipe_slug": item.recipe_slug,
                "recipe_name": item.recipe_name,
                "servings": item.servings,
                "source": item.source,
                "cooked_at": item.cooked_at.isoformat(),
                "duration_seconds": item.duration_seconds,
                "note": item.note,
            }
            for item in cook_logs
        ],
        "saved_meals": [
            {
                "profile": item.profile,
                "dish_ids": item.dish_ids,
                "created_at": item.created_at.isoformat(),
            }
            for item in saved_meals
        ],
    }


@router.post(
    "/delete/request-code",
    response_model=ForgotPasswordResponse,
    summary="Email a code to confirm account deletion (accounts without a password)",
)
def request_account_deletion_code(
    request: Request, current_user: CurrentUser, session: DatabaseSession
) -> ForgotPasswordResponse:
    if current_user.password_hash:
        raise InvalidCredentialsError("Tài khoản có mật khẩu: hãy xác nhận bằng mật khẩu.")
    if not current_user.email:
        raise InvalidCredentialsError("Tài khoản chưa có email để nhận mã xác nhận.")
    challenge, development_code = request_email_otp_code(
        session=session,
        email=current_user.email,
        purpose=ACCOUNT_DELETE_PURPOSE,
        requester_ip=client_ip(request),
        account_exists=True,
        user_id=current_user.id,
    )
    settings = get_settings()
    return ForgotPasswordResponse(
        challenge_id=challenge.id,
        expires_in=settings.email_otp_expire_minutes * 60,
        message="Mã xác nhận xóa tài khoản đã được gửi đến email của bạn.",
        development_code=development_code,
    )


@router.post("/delete", response_model=MessageResponse, summary="Permanently delete my account")
def delete_my_account(
    payload: AccountDeleteRequest,
    response: Response,
    current_user: CurrentUser,
    session: DatabaseSession,
) -> MessageResponse:
    verify_deletion_identity(
        session,
        user=current_user,
        password=payload.password,
        challenge_id=payload.challenge_id,
        code=payload.code,
    )
    delete_user_account(session, user_id=current_user.id)
    clear_refresh_cookie(response)
    return MessageResponse(message="Tài khoản và dữ liệu cá nhân của bạn đã được xóa.")
