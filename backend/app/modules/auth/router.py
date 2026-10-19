from typing import Annotated, Literal
from urllib.parse import urlencode
from uuid import UUID

from fastapi import APIRouter, Cookie, Depends, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import DomainError
from app.db.session import get_db_session
from app.modules.auth.dependencies import get_current_user, require_admin
from app.modules.auth.email import (
    EmailDeliveryError,
    send_verification_email,
)
from app.modules.auth.models import EmailOtpChallenge, User
from app.modules.auth.oauth import (
    OAuthExchangeError,
    exchange_google_code,
    google_authorization_url,
)
from app.modules.auth.schemas import (
    AuthSessionResponse,
    ChangeEmailRequest,
    ChangePasswordRequest,
    EmailOtpVerifyRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    MessageResponse,
    ProviderAvailabilityResponse,
    RegisterRequest,
    ResetPasswordRequest,
    ResetTokenResponse,
    UserResponse,
)
from app.modules.auth.service import (
    EmailNotRegisteredError,
    EmailServiceUnavailableError,
    OAuthProviderNotConfiguredError,
    authenticate_oauth_user,
    authenticate_password,
    change_password,
    check_email_change_request,
    complete_email_change,
    complete_password_reset_email_verification,
    create_email_otp_challenge,
    create_session_tokens,
    invalidate_email_otp_challenge,
    provider_availability,
    register_email_account,
    reset_password,
    revoke_refresh_token,
    rotate_refresh_token,
)

router = APIRouter(prefix="/auth")
REFRESH_COOKIE_NAME = "bep_viet_refresh"
OAUTH_STATE_COOKIE_NAME = "bep_viet_oauth_state"


def set_refresh_cookie(response: Response, token: str, *, remember_me: bool = False) -> None:
    settings = get_settings()
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        max_age=(settings.refresh_token_expire_days * 24 * 60 * 60) if remember_me else None,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        path=f"{settings.api_v1_prefix}/auth",
    )


def clear_refresh_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        path=f"{settings.api_v1_prefix}/auth",
    )


def set_oauth_state_cookie(response: Response, state_value: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=OAUTH_STATE_COOKIE_NAME,
        value=state_value,
        max_age=settings.oauth_state_expire_minutes * 60,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        path=f"{settings.api_v1_prefix}/auth/oauth/google",
    )


def clear_oauth_state_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=OAUTH_STATE_COOKIE_NAME,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        path=f"{settings.api_v1_prefix}/auth/oauth/google",
    )


def oauth_frontend_response(*, success: bool) -> RedirectResponse:
    settings = get_settings()
    query = urlencode({"status": "success" if success else "error"})
    return RedirectResponse(
        url=f"{str(settings.frontend_url).rstrip('/')}/oauth-callback?{query}",
        status_code=status.HTTP_303_SEE_OTHER,
    )


def session_response(user: User, access_token: str, expires_in: int) -> AuthSessionResponse:
    return AuthSessionResponse(
        access_token=access_token,
        expires_in=expires_in,
        user=UserResponse.model_validate(user),
    )


def request_email_otp_code(
    *,
    session: Session,
    email: str,
    purpose: str,
    requester_ip: str | None,
    account_exists: bool,
    pending_full_name: str | None = None,
    pending_password: str | None = None,
    remember_me: bool = False,
    user_id: UUID | None = None,
) -> tuple[EmailOtpChallenge, str | None]:
    settings = get_settings()
    if not settings.email_enabled and settings.app_env != "test":
        raise EmailServiceUnavailableError(
            "Dịch vụ email chưa sẵn sàng. Hãy cấu hình Gmail SMTP và thử lại."
        )
    challenge, code = create_email_otp_challenge(
        session,
        email,
        purpose=purpose,
        requester_ip=requester_ip,
        account_exists=account_exists,
        pending_full_name=pending_full_name,
        pending_password=pending_password,
        remembered=remember_me,
        user_id=user_id,
    )
    if settings.app_env != "test" and account_exists and settings.email_enabled:
        try:
            send_verification_email(recipient=challenge.email, code=code, purpose=purpose)
        except Exception as exc:
            invalidate_email_otp_challenge(session, challenge.id)
            message = (
                "Không gửi được email lúc này. Vui lòng thử lại."
                if isinstance(exc, EmailDeliveryError)
                else "Chưa gửi được mã xác thực. Vui lòng thử lại sau."
            )
            raise EmailServiceUnavailableError(message) from exc
    development_code = code if settings.app_env == "test" else None
    return challenge, development_code


@router.post(
    "/register",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an account with email and password",
)
def register(
    payload: RegisterRequest,
    session: Annotated[Session, Depends(get_db_session)],
) -> MessageResponse:
    register_email_account(
        session,
        email=str(payload.email),
        full_name=payload.full_name,
        password=payload.password,
    )
    return MessageResponse(
        message=(
            "Tài khoản đã được tạo thành công. Bạn có thể đăng nhập ngay. "
            "Email chào mừng sẽ được gửi tới địa chỉ đăng ký."
        )
    )


@router.post("/login", response_model=AuthSessionResponse, summary="Sign in with email")
def login(
    payload: LoginRequest,
    response: Response,
    session: Annotated[Session, Depends(get_db_session)],
) -> AuthSessionResponse:
    user = authenticate_password(session, email=str(payload.email), password=payload.password)
    tokens = create_session_tokens(session, user, remember_me=payload.remember_me)
    set_refresh_cookie(response, tokens.refresh_token, remember_me=tokens.remembered)
    return session_response(user, tokens.access_token, tokens.access_expires_in)


@router.post(
    "/refresh", response_model=AuthSessionResponse, summary="Refresh the authentication session"
)
def refresh(
    response: Response,
    session: Annotated[Session, Depends(get_db_session)],
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE_NAME)] = None,
) -> AuthSessionResponse:
    if not refresh_token:
        from app.modules.auth.service import InvalidTokenError

        raise InvalidTokenError("Không tìm thấy phiên đăng nhập.")
    user, tokens = rotate_refresh_token(session, refresh_token)
    set_refresh_cookie(response, tokens.refresh_token, remember_me=tokens.remembered)
    return session_response(user, tokens.access_token, tokens.access_expires_in)


@router.post("/logout", response_model=MessageResponse, summary="Sign out")
def logout(
    response: Response,
    session: Annotated[Session, Depends(get_db_session)],
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE_NAME)] = None,
) -> MessageResponse:
    revoke_refresh_token(session, refresh_token)
    clear_refresh_cookie(response)
    return MessageResponse(message="Bạn đã đăng xuất an toàn.")


@router.get("/me", response_model=UserResponse, summary="Get the current user")
def me(current_user: Annotated[User, Depends(get_current_user)]) -> UserResponse:
    return UserResponse.model_validate(current_user)


@router.get("/admin-check", response_model=UserResponse, summary="Check administrator access")
def admin_check(current_user: Annotated[User, Depends(require_admin)]) -> UserResponse:
    return UserResponse.model_validate(current_user)


@router.post(
    "/forgot-password",
    response_model=ForgotPasswordResponse,
    summary="Request an email password reset code",
)
def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    session: Annotated[Session, Depends(get_db_session)],
) -> ForgotPasswordResponse:
    email = str(payload.email).strip().casefold()
    user = session.scalar(select(User).where(User.email == email))
    if user is None:
        challenge, _ = create_email_otp_challenge(
            session,
            email,
            purpose="password_reset",
            requester_ip=request.client.host if request.client else None,
            account_exists=False,
        )
        invalidate_email_otp_challenge(session, challenge.id)
        raise EmailNotRegisteredError(
            "Email này chưa có tài khoản Bếp Việt. Vui lòng kiểm tra email "
            "hoặc tạo tài khoản mới."
        )

    challenge, development_code = request_email_otp_code(
        session=session,
        email=email,
        purpose="password_reset",
        requester_ip=request.client.host if request.client else None,
        account_exists=True,
    )
    settings = get_settings()
    return ForgotPasswordResponse(
        challenge_id=challenge.id,
        expires_in=settings.email_otp_expire_minutes * 60,
        message=(
            "Mã khôi phục thử nghiệm đã sẵn sàng."
            if settings.app_env == "test"
            else "Mã khôi phục đã được gửi đến email đăng ký."
        ),
        development_code=development_code,
    )


@router.post(
    "/forgot-password/verify-code",
    response_model=ResetTokenResponse,
    summary="Verify an email password reset code",
)
def verify_password_reset_code(
    payload: EmailOtpVerifyRequest,
    session: Annotated[Session, Depends(get_db_session)],
) -> ResetTokenResponse:
    reset_token, expires_in = complete_password_reset_email_verification(
        session, challenge_id=payload.challenge_id, code=payload.code
    )
    return ResetTokenResponse(
        reset_token=reset_token,
        expires_in=expires_in,
        message="Email đã được xác minh. Hãy tạo mật khẩu mới.",
    )


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Reset a password",
)
def confirm_password_reset(
    payload: ResetPasswordRequest,
    response: Response,
    session: Annotated[Session, Depends(get_db_session)],
) -> MessageResponse:
    reset_password(session, raw_token=payload.token, new_password=payload.new_password)
    clear_refresh_cookie(response)
    return MessageResponse(
        message=(
            "Mật khẩu đã được cập nhật. Bạn có thể đăng nhập lại. "
            "Email bảo mật đã được xếp hàng gửi."
        )
    )


@router.post(
    "/change-password",
    response_model=MessageResponse,
    summary="Change the current user's password",
)
def change_current_password(
    payload: ChangePasswordRequest,
    response: Response,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_db_session)],
) -> MessageResponse:
    change_password(
        session,
        user_id=current_user.id,
        current_password=payload.current_password,
        new_password=payload.new_password,
    )
    clear_refresh_cookie(response)
    return MessageResponse(
        message=(
            "Mật khẩu đã được đổi. Các phiên cũ đã đăng xuất; hãy đăng nhập lại. "
            "Email bảo mật đã được xếp hàng gửi."
        )
    )


@router.post(
    "/change-email",
    response_model=ForgotPasswordResponse,
    summary="Send a confirmation code to the new email address",
)
def request_email_change(
    payload: ChangeEmailRequest,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_db_session)],
) -> ForgotPasswordResponse:
    new_email = check_email_change_request(
        session,
        user=current_user,
        new_email=str(payload.new_email),
        current_password=payload.current_password,
    )
    challenge, development_code = request_email_otp_code(
        session=session,
        email=new_email,
        purpose="email_change",
        requester_ip=request.client.host if request.client else None,
        account_exists=True,
        user_id=current_user.id,
    )
    settings = get_settings()
    return ForgotPasswordResponse(
        challenge_id=challenge.id,
        expires_in=settings.email_otp_expire_minutes * 60,
        message=(
            "Mã xác nhận thử nghiệm đã sẵn sàng."
            if settings.app_env == "test"
            else "Mã xác nhận đã được gửi đến email mới."
        ),
        development_code=development_code,
    )


@router.post(
    "/change-email/confirm",
    response_model=UserResponse,
    summary="Confirm the new email address with the emailed code",
)
def confirm_email_change(
    payload: EmailOtpVerifyRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_db_session)],
) -> UserResponse:
    user = complete_email_change(
        session, user_id=current_user.id, challenge_id=payload.challenge_id, code=payload.code
    )
    return UserResponse.model_validate(user)


@router.get(
    "/providers",
    response_model=ProviderAvailabilityResponse,
    summary="List available authentication providers",
)
def providers() -> ProviderAvailabilityResponse:
    return ProviderAvailabilityResponse(**provider_availability())


@router.get("/oauth/{provider}/start", summary="Start social sign-in")
def start_oauth(provider: Literal["google", "facebook"]) -> Response:
    availability = provider_availability()
    if not availability[provider]:
        provider_name = "Google" if provider == "google" else "Facebook"
        raise OAuthProviderNotConfiguredError(
            f"Đăng nhập {provider_name} cần Client ID và Client Secret của ứng dụng."
        )
    if provider == "facebook":
        raise OAuthProviderNotConfiguredError("Callback Facebook chưa được kích hoạt.")

    from app.modules.auth.security import generate_secret_token

    state_value = generate_secret_token()
    try:
        authorization_url = google_authorization_url(state_value)
    except OAuthExchangeError as exc:
        raise OAuthProviderNotConfiguredError(str(exc)) from exc
    response = RedirectResponse(authorization_url, status_code=status.HTTP_302_FOUND)
    set_oauth_state_cookie(response, state_value)
    return response


@router.get("/oauth/google/callback", summary="Complete Google sign-in")
async def google_oauth_callback(
    session: Annotated[Session, Depends(get_db_session)],
    code: str | None = None,
    state_value: Annotated[str | None, Query(alias="state")] = None,
    error: str | None = None,
    oauth_state_cookie: Annotated[str | None, Cookie(alias=OAUTH_STATE_COOKIE_NAME)] = None,
) -> Response:
    from app.modules.auth.security import secure_compare

    if (
        error
        or not code
        or not state_value
        or not oauth_state_cookie
        or not secure_compare(state_value, oauth_state_cookie)
    ):
        response = oauth_frontend_response(success=False)
        clear_oauth_state_cookie(response)
        return response

    try:
        profile = await exchange_google_code(code)
        user = authenticate_oauth_user(
            session,
            provider=profile.provider,
            subject=profile.subject,
            email=profile.email,
            full_name=profile.full_name,
        )
        tokens = create_session_tokens(session, user)
    except (OAuthExchangeError, DomainError):
        response = oauth_frontend_response(success=False)
        clear_oauth_state_cookie(response)
        return response

    response = oauth_frontend_response(success=True)
    clear_oauth_state_cookie(response)
    set_refresh_cookie(response, tokens.refresh_token)
    return response
