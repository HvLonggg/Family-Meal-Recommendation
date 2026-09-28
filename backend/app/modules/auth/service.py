import re
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import DomainError
from app.modules.auth.models import (
    AuthIdentity,
    PasswordResetToken,
    PhoneOtpChallenge,
    RefreshSession,
    User,
)
from app.modules.auth.schemas import RegisterRequest
from app.modules.auth.security import (
    DUMMY_PASSWORD_HASH,
    create_access_token,
    generate_secret_token,
    hash_password,
    otp_digest,
    secure_compare,
    token_digest,
    verify_password,
)


class EmailAlreadyExistsError(DomainError):
    code = "EMAIL_ALREADY_EXISTS"
    status_code = status.HTTP_409_CONFLICT


class InvalidCredentialsError(DomainError):
    code = "INVALID_CREDENTIALS"
    status_code = status.HTTP_401_UNAUTHORIZED


class InvalidTokenError(DomainError):
    code = "INVALID_TOKEN"
    status_code = status.HTTP_401_UNAUTHORIZED


class AccountForbiddenError(DomainError):
    code = "ACCOUNT_FORBIDDEN"
    status_code = status.HTTP_403_FORBIDDEN


class InvalidResetTokenError(DomainError):
    code = "INVALID_RESET_TOKEN"
    status_code = status.HTTP_400_BAD_REQUEST


class InvalidPhoneError(DomainError):
    code = "INVALID_PHONE_NUMBER"
    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT


class InvalidOtpError(DomainError):
    code = "INVALID_OTP"
    status_code = status.HTTP_400_BAD_REQUEST


class OAuthProviderNotConfiguredError(DomainError):
    code = "OAUTH_PROVIDER_NOT_CONFIGURED"
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE


@dataclass(frozen=True)
class SessionTokens:
    access_token: str
    access_expires_in: int
    refresh_token: str


def utc_now() -> datetime:
    return datetime.now(UTC)


def is_expired(value: datetime) -> bool:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value <= utc_now()


def register_user(session: Session, payload: RegisterRequest) -> User:
    existing_user = session.scalar(select(User).where(User.email == payload.email))
    if existing_user is not None:
        raise EmailAlreadyExistsError("Email này đã được sử dụng.")

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        role="user",
        status="active",
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
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise EmailAlreadyExistsError("Email này đã được sử dụng.") from exc
    session.refresh(user)
    return user


def authenticate_email(session: Session, *, email: str, password: str) -> User:
    user = session.scalar(select(User).where(User.email == email))
    password_hash = user.password_hash if user and user.password_hash else DUMMY_PASSWORD_HASH
    password_is_valid = verify_password(password, password_hash)
    if user is None or not password_is_valid:
        raise InvalidCredentialsError("Email hoặc mật khẩu chưa đúng.")
    ensure_active_user(user)
    return user


def ensure_active_user(user: User) -> None:
    if user.status != "active":
        raise AccountForbiddenError("Tài khoản hiện không thể đăng nhập.")


def create_session_tokens(session: Session, user: User) -> SessionTokens:
    settings = get_settings()
    access_token, access_expires_in = create_access_token(user_id=user.id, role=user.role)
    refresh_token = generate_secret_token()
    session.add(
        RefreshSession(
            user_id=user.id,
            token_hash=token_digest(refresh_token),
            expires_at=utc_now() + timedelta(days=settings.refresh_token_expire_days),
        )
    )
    session.commit()
    return SessionTokens(access_token, access_expires_in, refresh_token)


def rotate_refresh_token(session: Session, raw_token: str) -> tuple[User, SessionTokens]:
    refresh_session = session.scalar(
        select(RefreshSession).where(RefreshSession.token_hash == token_digest(raw_token))
    )
    if (
        refresh_session is None
        or refresh_session.revoked_at is not None
        or is_expired(refresh_session.expires_at)
    ):
        raise InvalidTokenError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.")

    user = session.get(User, refresh_session.user_id)
    if user is None:
        raise InvalidTokenError("Không tìm thấy tài khoản của phiên đăng nhập.")
    ensure_active_user(user)
    refresh_session.revoked_at = utc_now()
    session.flush()
    return user, create_session_tokens(session, user)


def revoke_refresh_token(session: Session, raw_token: str | None) -> None:
    if not raw_token:
        return
    refresh_session = session.scalar(
        select(RefreshSession).where(RefreshSession.token_hash == token_digest(raw_token))
    )
    if refresh_session is not None and refresh_session.revoked_at is None:
        refresh_session.revoked_at = utc_now()
        session.commit()


def create_password_reset_token(session: Session, email: str) -> str | None:
    user = session.scalar(select(User).where(User.email == email))
    if user is None:
        return None
    settings = get_settings()
    raw_token = generate_secret_token()
    session.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=token_digest(raw_token),
            expires_at=utc_now() + timedelta(minutes=settings.password_reset_expire_minutes),
        )
    )
    session.commit()
    return raw_token


def reset_password(session: Session, *, raw_token: str, new_password: str) -> None:
    reset_token = session.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == token_digest(raw_token))
    )
    if reset_token is None or reset_token.used_at is not None or is_expired(reset_token.expires_at):
        raise InvalidResetTokenError("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.")
    user = session.get(User, reset_token.user_id)
    if user is None:
        raise InvalidResetTokenError("Không tìm thấy tài khoản cần đặt lại mật khẩu.")

    user.password_hash = hash_password(new_password)
    reset_token.used_at = utc_now()
    session.execute(
        update(RefreshSession)
        .where(RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None))
        .values(revoked_at=utc_now())
    )
    session.commit()


def normalize_vietnamese_phone(value: str) -> str:
    compact = re.sub(r"[^\d+]", "", value)
    if re.fullmatch(r"0\d{9}", compact):
        return f"+84{compact[1:]}"
    if re.fullmatch(r"\+84\d{9}", compact):
        return compact
    raise InvalidPhoneError("Số điện thoại Việt Nam chưa đúng định dạng.")


def create_phone_challenge(session: Session, raw_phone: str) -> tuple[PhoneOtpChallenge, str]:
    settings = get_settings()
    phone = normalize_vietnamese_phone(raw_phone)
    code = f"{secrets.randbelow(1_000_000):06d}"
    challenge = PhoneOtpChallenge(
        phone_e164=phone,
        code_hash="pending",
        expires_at=utc_now() + timedelta(minutes=settings.phone_otp_expire_minutes),
    )
    session.add(challenge)
    session.flush()
    challenge.code_hash = otp_digest(challenge_id=challenge.id, code=code)
    session.commit()
    session.refresh(challenge)
    return challenge, code


def verify_phone_challenge(
    session: Session, *, challenge_id: UUID, code: str
) -> tuple[User, SessionTokens]:
    challenge = session.get(PhoneOtpChallenge, challenge_id)
    if (
        challenge is None
        or challenge.consumed_at is not None
        or challenge.attempts >= 5
        or is_expired(challenge.expires_at)
    ):
        raise InvalidOtpError("Mã xác thực không hợp lệ hoặc đã hết hạn.")

    challenge.attempts += 1
    if not secure_compare(
        challenge.code_hash,
        otp_digest(challenge_id=challenge.id, code=code),
    ):
        session.commit()
        raise InvalidOtpError("Mã xác thực chưa đúng.")

    challenge.consumed_at = utc_now()
    user = session.scalar(select(User).where(User.phone_e164 == challenge.phone_e164))
    if user is None:
        user = User(
            phone_e164=challenge.phone_e164,
            full_name="Người dùng Bếp Việt",
            role="user",
            status="active",
        )
        session.add(user)
        session.flush()
        session.add(
            AuthIdentity(
                user_id=user.id,
                provider="phone",
                provider_subject=challenge.phone_e164,
            )
        )
    ensure_active_user(user)
    session.flush()
    tokens = create_session_tokens(session, user)
    session.refresh(user)
    return user, tokens


def authenticate_oauth_user(
    session: Session,
    *,
    provider: str,
    subject: str,
    email: str,
    full_name: str,
) -> User:
    identity = session.scalar(
        select(AuthIdentity).where(
            AuthIdentity.provider == provider,
            AuthIdentity.provider_subject == subject,
        )
    )
    if identity is not None:
        user = session.get(User, identity.user_id)
        if user is None:
            raise InvalidCredentialsError("Không tìm thấy tài khoản đã liên kết.")
        ensure_active_user(user)
        identity.provider_email = email
        session.commit()
        return user

    user = session.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(
            email=email,
            full_name=full_name,
            role="user",
            status="active",
            email_verified_at=utc_now(),
        )
        session.add(user)
        session.flush()
    else:
        ensure_active_user(user)
        if user.email_verified_at is None:
            user.email_verified_at = utc_now()

    session.add(
        AuthIdentity(
            user_id=user.id,
            provider=provider,
            provider_subject=subject,
            provider_email=email,
        )
    )
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        existing_identity = session.scalar(
            select(AuthIdentity).where(
                AuthIdentity.provider == provider,
                AuthIdentity.provider_subject == subject,
            )
        )
        if existing_identity is None:
            raise InvalidCredentialsError("Không thể liên kết tài khoản Google.") from exc
        existing_user = session.get(User, existing_identity.user_id)
        if existing_user is None:
            raise InvalidCredentialsError("Không tìm thấy tài khoản đã liên kết.") from exc
        ensure_active_user(existing_user)
        return existing_user
    session.refresh(user)
    return user


def provider_availability() -> dict[str, bool]:
    settings = get_settings()
    return {
        "google": bool(settings.google_client_id and settings.google_client_secret),
        "facebook": bool(settings.facebook_client_id and settings.facebook_client_secret),
        "phone": settings.app_env == "development",
    }
