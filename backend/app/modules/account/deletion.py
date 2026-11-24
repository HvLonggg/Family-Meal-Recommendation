"""Người dùng tự xóa tài khoản: xác nhận lại danh tính rồi xóa/ẩn danh dữ liệu theo ownership.

Không dựa vào ON DELETE CASCADE của CSDL (SQLite trong test không bật khóa ngoại),
nên mọi bảng thuộc sở hữu người dùng được xóa tường minh trong cùng một transaction.
"""

from uuid import UUID

from sqlalchemy import delete, or_, select, update
from sqlalchemy.orm import Session

from app.modules.articles.models import Article
from app.modules.assistant.models import (
    AssistantConversation,
    AssistantKnowledgeDocument,
    AssistantMemory,
    AssistantMessage,
)
from app.modules.auth.models import (
    AuthIdentity,
    EmailOtpChallenge,
    PasswordResetToken,
    RefreshSession,
    SecurityEmailOutbox,
    User,
)
from app.modules.auth.security import verify_password
from app.modules.auth.service import (
    InvalidCredentialsError,
    InvalidOtpError,
    InvalidTokenError,
    verify_email_otp_challenge,
)
from app.modules.cooking.models import UserCookLog, UserCookTimer, UserPushSubscription
from app.modules.favorites.models import UserFavoriteRecipe
from app.modules.planner.models import (
    MealPlanEmailReminder,
    UserMealPlanEvent,
    UserMealPlanItem,
    UserVegetarianDay,
)
from app.modules.saved_meals.models import SavedMeal
from app.modules.submissions.models import RecipeSubmission
from app.modules.support.models import AdminMealSuggestionEmail, SupportTicket

ACCOUNT_DELETE_PURPOSE = "account_delete"


def verify_deletion_identity(
    session: Session,
    *,
    user: User,
    password: str | None,
    challenge_id: UUID | None,
    code: str | None,
) -> None:
    """Tài khoản có mật khẩu phải nhập lại mật khẩu; đăng nhập mạng xã hội dùng OTP."""
    if user.password_hash:
        if not password or not verify_password(password, user.password_hash):
            raise InvalidCredentialsError("Mật khẩu hiện tại chưa đúng.")
        return
    if challenge_id is None or not code:
        raise InvalidOtpError("Cần mã xác nhận gửi qua email để xóa tài khoản.")
    challenge = verify_email_otp_challenge(
        session, challenge_id=challenge_id, code=code, purpose=ACCOUNT_DELETE_PURPOSE
    )
    if challenge.user_id != user.id:
        session.commit()
        raise InvalidOtpError("Mã xác thực không hợp lệ hoặc đã hết hạn.")


def delete_user_account(session: Session, *, user_id: UUID) -> None:
    """Xóa tài khoản và dữ liệu cá nhân; nội dung cộng đồng đã đăng được giữ lại ở dạng ẩn danh."""
    user = session.scalar(select(User).where(User.id == user_id).with_for_update())
    if user is None:
        raise InvalidTokenError("Không tìm thấy tài khoản đăng nhập.")
    email = user.email

    conversation_ids = select(AssistantConversation.id).where(
        AssistantConversation.user_id == user_id
    )
    session.execute(
        delete(AssistantMessage).where(AssistantMessage.conversation_id.in_(conversation_ids))
    )
    for model in (
        AssistantConversation,
        AssistantMemory,
        UserCookLog,
        UserCookTimer,
        UserPushSubscription,
        UserFavoriteRecipe,
        UserMealPlanEvent,
        MealPlanEmailReminder,
        UserVegetarianDay,
        SavedMeal,
        RecipeSubmission,
        RefreshSession,
        PasswordResetToken,
        SecurityEmailOutbox,
        AuthIdentity,
    ):
        session.execute(delete(model).where(model.user_id == user_id))
    # Nhật ký nấu đã xóa trước nên xóa kế hoạch không vướng tham chiếu plan_item_id.
    session.execute(delete(UserMealPlanItem).where(UserMealPlanItem.user_id == user_id))

    otp_filter = EmailOtpChallenge.user_id == user_id
    if email:
        otp_filter = or_(otp_filter, EmailOtpChallenge.email == email)
    session.execute(delete(EmailOtpChallenge).where(otp_filter))

    # Bài đã xuất bản giữ lại cho cộng đồng nhưng gỡ liên kết tác giả; bản nháp/chờ duyệt xóa hẳn.
    session.execute(
        delete(Article).where(Article.author_id == user_id, Article.status != "published")
    )
    session.execute(update(Article).where(Article.author_id == user_id).values(author_id=None))
    session.execute(
        update(AssistantKnowledgeDocument)
        .where(AssistantKnowledgeDocument.created_by == user_id)
        .values(created_by=None)
    )
    # Yêu cầu hỗ trợ cần cho xử lý khiếu nại: gỡ liên kết tài khoản, giữ theo thời hạn công bố.
    session.execute(
        update(SupportTicket).where(SupportTicket.user_id == user_id).values(user_id=None)
    )
    session.execute(
        delete(AdminMealSuggestionEmail).where(
            AdminMealSuggestionEmail.recipient_user_id == user_id
        )
    )
    session.execute(
        update(AdminMealSuggestionEmail)
        .where(AdminMealSuggestionEmail.admin_user_id == user_id)
        .values(admin_user_id=None)
    )
    session.delete(user)
    session.commit()
