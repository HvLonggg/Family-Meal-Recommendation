import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import DomainError
from app.modules.auth.models import (
    AuthIdentity,
    EmailOtpChallenge,
    PasswordResetToken,
    RefreshSession,
    SecurityEmailOutbox,
    User,
)
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


class EmailNotRegisteredError(DomainError):
    code = "EMAIL_NOT_REGISTERED"
    status_code = status.HTTP_404_NOT_FOUND


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


class InvalidOtpError(DomainError):
    code = "INVALID_OTP"
    status_code = status.HTTP_400_BAD_REQUEST


class OtpRateLimitError(DomainError):
    code = "OTP_RATE_LIMITED"
    status_code = status.HTTP_429_TOO_MANY_REQUESTS


class OAuthProviderNotConfiguredError(DomainError):
    code = "OAUTH_PROVIDER_NOT_CONFIGURED"
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE


class EmailServiceUnavailableError(DomainError):
    code = "EMAIL_SERVICE_UNAVAILABLE"
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE


class RegistrationRequiredError(DomainError):
    code = "REGISTRATION_REQUIRED"
    status_code = status.HTTP_403_FORBIDDEN


@dataclass(frozen=True)
class SessionTokens:
    access_token: str
    access_expires_in: int
    refresh_token: str
    remembered: bool


def utc_now() -> datetime:
    return datetime.now(UTC)


def is_expired(value: datetime) -> bool:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value <= utc_now()


def authenticate_password(session: Session, *, email: str, password: str) -> User:
    user = session.scalar(select(User).where(User.email == email.strip().casefold()))
    password_hash = user.password_hash if user and user.password_hash else DUMMY_PASSWORD_HASH
    password_is_valid = verify_password(password, password_hash)
    if user is None or not password_is_valid:
        raise InvalidCredentialsError("Thông tin đăng nhập chưa đúng.")
    ensure_active_user(user)
    return user


def ensure_active_user(user: User) -> None:
    if user.status != "active":
        raise AccountForbiddenError("Tài khoản hiện không thể đăng nhập.")


def create_session_tokens(
    session: Session, user: User, *, remember_me: bool = False
) -> SessionTokens:
    settings = get_settings()
    access_token, access_expires_in = create_access_token(
        user_id=user.id, role=user.role, auth_version=user.auth_version
    )
    refresh_token = generate_secret_token()
    user.last_login_at = utc_now()
    refresh_expiration = (
        utc_now() + timedelta(days=settings.refresh_token_expire_days)
        if remember_me
        else utc_now() + timedelta(hours=settings.session_expire_hours)
    )
    session.add(
        RefreshSession(
            user_id=user.id,
            token_hash=token_digest(refresh_token),
            expires_at=refresh_expiration,
            remembered=remember_me,
        )
    )
    session.commit()
    return SessionTokens(access_token, access_expires_in, refresh_token, remember_me)


def register_email_account(session: Session, *, email: str, full_name: str, password: str) -> User:
    normalized_email = email.strip().casefold()
    if session.scalar(select(User.id).where(User.email == normalized_email)) is not None:
        raise EmailAlreadyExistsError(
            "Email này đã được đăng ký. Hãy đăng nhập hoặc khôi phục mật khẩu."
        )

    user = User(
        email=normalized_email,
        full_name=full_name,
        password_hash=hash_password(password),
        role="user",
        status="active",
    )
    try:
        session.add(user)
        session.flush()
        session.add(
            AuthIdentity(
                user_id=user.id,
                provider="password",
                provider_subject=normalized_email,
                provider_email=normalized_email,
            )
        )
        queue_security_email(session, user, event="registration")
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise EmailAlreadyExistsError(
            "Email này đã được đăng ký. Hãy đăng nhập hoặc khôi phục mật khẩu."
        ) from exc

    session.refresh(user)
    return user


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
    return user, create_session_tokens(session, user, remember_me=refresh_session.remembered)


def revoke_refresh_token(session: Session, raw_token: str | None) -> None:
    if not raw_token:
        return
    refresh_session = session.scalar(
        select(RefreshSession).where(RefreshSession.token_hash == token_digest(raw_token))
    )
    if refresh_session is not None and refresh_session.revoked_at is None:
        refresh_session.revoked_at = utc_now()
        session.commit()


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
    user.auth_version += 1
    reset_token.used_at = utc_now()
    session.execute(
        update(RefreshSession)
        .where(RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None))
        .values(revoked_at=utc_now())
    )
    session.execute(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        )
        .values(used_at=utc_now())
    )
    queue_security_email(session, user, event="password_reset")
    session.commit()


def change_password(
    session: Session,
    *,
    user_id: UUID,
    current_password: str,
    new_password: str,
) -> None:
    user = session.scalar(select(User).where(User.id == user_id).with_for_update())
    if user is None:
        raise InvalidTokenError("Không tìm thấy tài khoản đăng nhập.")
    if not user.password_hash:
        raise InvalidCredentialsError(
            "Tài khoản chưa có mật khẩu. Hãy dùng chức năng quên mật khẩu để tạo mật khẩu email."
        )
    if not verify_password(current_password, user.password_hash):
        raise InvalidCredentialsError("Mật khẩu hiện tại chưa đúng.")
    if verify_password(new_password, user.password_hash):
        raise InvalidCredentialsError("Mật khẩu mới phải khác mật khẩu hiện tại.")

    user.password_hash = hash_password(new_password)
    user.auth_version += 1
    session.execute(
        update(RefreshSession)
        .where(RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None))
        .values(revoked_at=utc_now())
    )
    queue_security_email(session, user, event="password_change")
    session.commit()


def revoke_all_sessions(session: Session, user: User) -> None:
    """Vô hiệu hóa access token hiện hành và mọi refresh token của tài khoản (chưa commit)."""
    user.auth_version += 1
    session.execute(
        update(RefreshSession)
        .where(RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None))
        .values(revoked_at=utc_now())
    )


def queue_security_email(session: Session, user: User, *, event: str) -> SecurityEmailOutbox:
    if not user.email:
        raise InvalidCredentialsError("Tài khoản chưa có email để nhận thông báo bảo mật.")
    outbox = SecurityEmailOutbox(user_id=user.id, recipient=user.email, event=event)
    session.add(outbox)
    session.flush()
    return outbox


def _requester_digest(requester_ip: str | None) -> str | None:
    if not requester_ip:
        return None
    secret = get_settings().jwt_secret.get_secret_value().encode("utf-8")
    return hmac.new(secret, requester_ip.encode("utf-8"), hashlib.sha256).hexdigest()


def _lock_email_otp_limits(
    session: Session, *, email: str, purpose: str, requester_key: str | None
) -> None:
    # Serialize concurrent sends per email and IP on PostgreSQL so parallel requests
    # cannot bypass the resend cooldown and hourly limits.
    if session.get_bind().dialect.name != "postgresql":
        return
    scopes = [f"email:{email}:{purpose}"]
    if requester_key:
        scopes.append(f"ip:{requester_key}")
    lock_ids = sorted(
        int.from_bytes(hashlib.sha256(scope.encode()).digest()[:8], "big", signed=True)
        for scope in scopes
    )
    for lock_id in lock_ids:
        session.execute(select(func.pg_advisory_xact_lock(lock_id)))


def create_email_otp_challenge(
    session: Session,
    email: str,
    *,
    purpose: str,
    requester_ip: str | None = None,
    account_exists: bool = True,
    pending_full_name: str | None = None,
    pending_password: str | None = None,
    remembered: bool = False,
    user_id: UUID | None = None,
) -> tuple[EmailOtpChallenge, str]:
    settings = get_settings()
    normalized_email = email.strip().casefold()
    now = utc_now()
    requester_key = _requester_digest(requester_ip)
    _lock_email_otp_limits(
        session, email=normalized_email, purpose=purpose, requester_key=requester_key
    )

    # Expired or consumed challenges no longer need the pending registration secret.
    session.execute(
        update(EmailOtpChallenge)
        .where(
            (EmailOtpChallenge.expires_at <= now)
            | (EmailOtpChallenge.consumed_at.is_not(None)),
            EmailOtpChallenge.pending_password_hash.is_not(None),
        )
        .values(pending_password_hash=None, pending_full_name=None)
    )
    since = now - timedelta(hours=1)
    recent_for_email = (
        session.scalar(
            select(func.count(EmailOtpChallenge.id)).where(
                EmailOtpChallenge.email == normalized_email,
                EmailOtpChallenge.purpose == purpose,
                EmailOtpChallenge.created_at >= since,
            )
        )
        or 0
    )
    if recent_for_email >= 3:
        raise OtpRateLimitError("Đã gửi quá nhiều mã. Vui lòng thử lại sau.")

    if requester_key:
        recent_for_ip = (
            session.scalar(
                select(func.count(EmailOtpChallenge.id)).where(
                    EmailOtpChallenge.requester_key == requester_key,
                    EmailOtpChallenge.created_at >= since,
                )
            )
            or 0
        )
        if recent_for_ip >= 10:
            raise OtpRateLimitError("Yêu cầu quá thường xuyên. Vui lòng thử lại sau.")

    cooldown = session.scalar(
        select(EmailOtpChallenge.id)
        .where(
            EmailOtpChallenge.email == normalized_email,
            EmailOtpChallenge.purpose == purpose,
            EmailOtpChallenge.created_at >= now - timedelta(seconds=60),
        )
        .limit(1)
    )
    if cooldown is not None:
        raise OtpRateLimitError("Vui lòng chờ 60 giây trước khi yêu cầu mã mới.")

    pending_password_hash = hash_password(pending_password) if pending_password else None
    session.execute(
        update(EmailOtpChallenge)
        .where(
            EmailOtpChallenge.email == normalized_email,
            EmailOtpChallenge.purpose == purpose,
            EmailOtpChallenge.consumed_at.is_(None),
        )
        .values(consumed_at=now, pending_password_hash=None, pending_full_name=None)
    )
    code = f"{secrets.randbelow(100_000):05d}"
    challenge = EmailOtpChallenge(
        email=normalized_email,
        purpose=purpose,
        code_hash="pending",
        expires_at=now + timedelta(minutes=settings.email_otp_expire_minutes),
        pending_full_name=pending_full_name,
        pending_password_hash=pending_password_hash,
        account_exists=account_exists,
        remembered=remembered,
        requester_key=requester_key,
        user_id=user_id,
    )
    session.add(challenge)
    session.flush()
    challenge.code_hash = otp_digest(challenge_id=challenge.id, code=code)
    session.commit()
    session.refresh(challenge)
    return challenge, code


def invalidate_email_otp_challenge(session: Session, challenge_id: UUID) -> None:
    challenge = session.get(EmailOtpChallenge, challenge_id)
    if challenge is not None and challenge.consumed_at is None:
        challenge.consumed_at = utc_now()
        challenge.pending_password_hash = None
        challenge.pending_full_name = None
        session.commit()


def verify_email_otp_challenge(
    session: Session, *, challenge_id: UUID, code: str, purpose: str
) -> EmailOtpChallenge:
    challenge = session.scalar(
        select(EmailOtpChallenge)
        .where(EmailOtpChallenge.id == challenge_id)
        .with_for_update()
    )
    if challenge is None or challenge.purpose != purpose or challenge.consumed_at is not None:
        raise InvalidOtpError("Mã xác thực không hợp lệ hoặc đã hết hạn.")
    if is_expired(challenge.expires_at) or challenge.attempts >= 3:
        challenge.consumed_at = utc_now()
        challenge.pending_password_hash = None
        challenge.pending_full_name = None
        session.commit()
        raise InvalidOtpError("Mã xác thực không hợp lệ hoặc đã hết hạn.")

    challenge.attempts += 1
    expected = otp_digest(challenge_id=challenge.id, code=code)
    if not secure_compare(challenge.code_hash, expected):
        if challenge.attempts >= 3:
            challenge.consumed_at = utc_now()
            challenge.pending_password_hash = None
            challenge.pending_full_name = None
        session.commit()
        raise InvalidOtpError("Mã xác thực chưa đúng.")
    challenge.consumed_at = utc_now()
    return challenge


def complete_password_reset_email_verification(
    session: Session, *, challenge_id: UUID, code: str
) -> tuple[str, int]:
    challenge = verify_email_otp_challenge(
        session, challenge_id=challenge_id, code=code, purpose="password_reset"
    )
    user = session.scalar(select(User).where(User.email == challenge.email))
    if not challenge.account_exists or user is None:
        session.commit()
        raise InvalidOtpError("Mã xác thực không hợp lệ hoặc đã hết hạn.")
    if user.email_verified_at is None:
        user.email_verified_at = utc_now()
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
    return raw_token, settings.password_reset_expire_minutes * 60


def check_email_change_request(
    session: Session, *, user: User, new_email: str, current_password: str | None
) -> str:
    """Kiểm tra yêu cầu đổi email trước khi gửi mã; trả về email mới đã chuẩn hóa."""
    normalized = new_email.strip().casefold()
    if user.email and normalized == user.email.casefold():
        raise EmailAlreadyExistsError("Email mới phải khác email hiện tại.")
    # Xác minh lại mật khẩu để phiên bị lộ không thể chiếm tài khoản bằng cách đổi email.
    if user.password_hash and not (
        current_password and verify_password(current_password, user.password_hash)
    ):
        raise InvalidCredentialsError("Mật khẩu hiện tại chưa đúng.")
    if session.scalar(select(User.id).where(User.email == normalized)) is not None:
        raise EmailAlreadyExistsError("Email này đã được dùng cho một tài khoản Bếp Việt khác.")
    return normalized


def complete_email_change(
    session: Session, *, user_id: UUID, challenge_id: UUID, code: str
) -> User:
    challenge = verify_email_otp_challenge(
        session, challenge_id=challenge_id, code=code, purpose="email_change"
    )
    if challenge.user_id != user_id:
        session.commit()
        raise InvalidOtpError("Mã xác thực không hợp lệ hoặc đã hết hạn.")
    user = session.scalar(select(User).where(User.id == user_id).with_for_update())
    if user is None:
        session.commit()
        raise InvalidTokenError("Không tìm thấy tài khoản đăng nhập.")
    taken = session.scalar(select(User.id).where(User.email == challenge.email, User.id != user.id))
    if taken is not None:
        session.commit()
        raise EmailAlreadyExistsError("Email này đã được dùng cho một tài khoản Bếp Việt khác.")

    # Báo về email cũ trước khi đổi để chủ tài khoản biết nếu không phải họ thao tác.
    if user.email:
        queue_security_email(session, user, event="email_change")
    user.email = challenge.email
    user.email_verified_at = utc_now()
    # Định danh mật khẩu dùng email làm khóa; đổi theo để email cũ có thể đăng ký lại.
    session.execute(
        update(AuthIdentity)
        .where(AuthIdentity.user_id == user.id, AuthIdentity.provider == "password")
        .values(provider_subject=challenge.email, provider_email=challenge.email)
    )
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise EmailAlreadyExistsError(
            "Email này đã được dùng cho một tài khoản Bếp Việt khác."
        ) from exc
    session.refresh(user)
    return user


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
        raise RegistrationRequiredError(
            "Hãy tạo tài khoản và xác minh email trước khi liên kết Google."
        )
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
        "email": settings.email_enabled or settings.app_env == "test",
    }
