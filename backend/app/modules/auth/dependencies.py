from typing import Annotated
from uuid import UUID

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.modules.auth.models import User
from app.modules.auth.security import decode_access_token
from app.modules.auth.service import (
    AccountForbiddenError,
    InvalidTokenError,
    ensure_active_user,
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def get_current_user(
    token: Annotated[str | None, Depends(oauth2_scheme)],
    session: Annotated[Session, Depends(get_db_session)],
) -> User:
    if not token:
        raise InvalidTokenError("Bạn cần đăng nhập để tiếp tục.")
    try:
        payload = decode_access_token(token)
        user_id = UUID(str(payload["sub"]))
    except (ValueError, KeyError) as exc:
        raise InvalidTokenError("Phiên đăng nhập không hợp lệ.") from exc

    user = session.get(User, user_id)
    if user is None:
        raise InvalidTokenError("Không tìm thấy tài khoản đăng nhập.")
    if payload.get("ver", 0) != user.auth_version:
        raise InvalidTokenError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.")
    ensure_active_user(user)
    return user


def get_optional_user(
    token: Annotated[str | None, Depends(oauth2_scheme)],
    session: Annotated[Session, Depends(get_db_session)],
) -> User | None:
    """Dùng cho API công khai có thêm quyền khi người xem đã đăng nhập."""
    if not token:
        return None
    try:
        return get_current_user(token, session)
    except (InvalidTokenError, AccountForbiddenError):
        return None


def require_admin(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    if current_user.role != "admin":
        raise AccountForbiddenError("Bạn không có quyền truy cập khu vực quản trị.")
    return current_user
