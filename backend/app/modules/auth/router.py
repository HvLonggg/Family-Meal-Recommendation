from typing import Annotated, Literal
from urllib.parse import urlencode

from fastapi import APIRouter, Cookie, Depends, Query, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import DomainError
from app.db.session import get_db_session
from app.modules.auth.dependencies import get_current_user, require_admin
from app.modules.auth.models import User
from app.modules.auth.oauth import (
    OAuthExchangeError,
    exchange_google_code,
    google_authorization_url,
)
from app.modules.auth.schemas import (
    AuthSessionResponse,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    MessageResponse,
    PhoneOtpRequest,
    PhoneOtpResponse,
    PhoneOtpVerifyRequest,
    ProviderAvailabilityResponse,
    RegisterRequest,
    ResetPasswordRequest,
    UserResponse,
)
from app.modules.auth.service import (
    OAuthProviderNotConfiguredError,
    authenticate_email,
    authenticate_oauth_user,
    create_password_reset_token,
    create_phone_challenge,
    create_session_tokens,
    provider_availability,
    register_user,
    reset_password,
    revoke_refresh_token,
    rotate_refresh_token,
    verify_phone_challenge,
)

router = APIRouter(prefix="/auth")
REFRESH_COOKIE_NAME = "bep_viet_refresh"
OAUTH_STATE_COOKIE_NAME = "bep_viet_oauth_state"


def set_refresh_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
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
        url=f"{str(settings.frontend_url).rstrip('/')}/xac-thuc-google?{query}",
        status_code=status.HTTP_303_SEE_OTHER,
    )


def session_response(user: User, access_token: str, expires_in: int) -> AuthSessionResponse:
    return AuthSessionResponse(
        access_token=access_token,
        expires_in=expires_in,
        user=UserResponse.model_validate(user),
    )


@router.post(
    "/register",
    response_model=AuthSessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Đăng ký tài khoản người dùng",
)
def register(
    payload: RegisterRequest,
    response: Response,
    session: Annotated[Session, Depends(get_db_session)],
) -> AuthSessionResponse:
    user = register_user(session, payload)
    tokens = create_session_tokens(session, user)
    set_refresh_cookie(response, tokens.refresh_token)
    return session_response(user, tokens.access_token, tokens.access_expires_in)


@router.post("/login", response_model=AuthSessionResponse, summary="Đăng nhập bằng email")
def login(
    payload: LoginRequest,
    response: Response,
    session: Annotated[Session, Depends(get_db_session)],
) -> AuthSessionResponse:
    user = authenticate_email(session, email=str(payload.email), password=payload.password)
    tokens = create_session_tokens(session, user)
    set_refresh_cookie(response, tokens.refresh_token)
    return session_response(user, tokens.access_token, tokens.access_expires_in)


@router.post("/refresh", response_model=AuthSessionResponse, summary="Làm mới phiên đăng nhập")
def refresh(
    response: Response,
    session: Annotated[Session, Depends(get_db_session)],
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE_NAME)] = None,
) -> AuthSessionResponse:
    if not refresh_token:
        from app.modules.auth.service import InvalidTokenError

        raise InvalidTokenError("Không tìm thấy phiên đăng nhập.")
    user, tokens = rotate_refresh_token(session, refresh_token)
    set_refresh_cookie(response, tokens.refresh_token)
    return session_response(user, tokens.access_token, tokens.access_expires_in)


@router.post("/logout", response_model=MessageResponse, summary="Đăng xuất")
def logout(
    response: Response,
    session: Annotated[Session, Depends(get_db_session)],
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE_NAME)] = None,
) -> MessageResponse:
    revoke_refresh_token(session, refresh_token)
    clear_refresh_cookie(response)
    return MessageResponse(message="Bạn đã đăng xuất an toàn.")


@router.get("/me", response_model=UserResponse, summary="Lấy tài khoản hiện tại")
def me(current_user: Annotated[User, Depends(get_current_user)]) -> UserResponse:
    return UserResponse.model_validate(current_user)


@router.get("/admin-check", response_model=UserResponse, summary="Kiểm tra quyền quản trị")
def admin_check(current_user: Annotated[User, Depends(require_admin)]) -> UserResponse:
    return UserResponse.model_validate(current_user)


@router.post(
    "/forgot-password",
    response_model=ForgotPasswordResponse,
    summary="Yêu cầu đặt lại mật khẩu",
)
def forgot_password(
    payload: ForgotPasswordRequest,
    session: Annotated[Session, Depends(get_db_session)],
) -> ForgotPasswordResponse:
    settings = get_settings()
    token = create_password_reset_token(session, str(payload.email))
    return ForgotPasswordResponse(
        message=("Nếu email tồn tại, hướng dẫn đặt lại mật khẩu sẽ được gửi trong ít phút."),
        development_reset_token=token if settings.app_env == "development" else None,
    )


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Đặt lại mật khẩu",
)
def confirm_password_reset(
    payload: ResetPasswordRequest,
    session: Annotated[Session, Depends(get_db_session)],
) -> MessageResponse:
    reset_password(session, raw_token=payload.token, new_password=payload.new_password)
    return MessageResponse(message="Mật khẩu đã được cập nhật. Bạn có thể đăng nhập lại.")


@router.post("/phone/request", response_model=PhoneOtpResponse, summary="Gửi mã đăng nhập SMS")
def request_phone_otp(
    payload: PhoneOtpRequest,
    session: Annotated[Session, Depends(get_db_session)],
) -> PhoneOtpResponse:
    settings = get_settings()
    if settings.app_env != "development":
        raise OAuthProviderNotConfiguredError("Dịch vụ SMS chưa được cấu hình cho môi trường này.")
    challenge, code = create_phone_challenge(session, payload.phone)
    return PhoneOtpResponse(
        challenge_id=challenge.id,
        expires_in=settings.phone_otp_expire_minutes * 60,
        message="Mã xác thực phát triển đã được tạo.",
        development_code=code,
    )


@router.post("/phone/verify", response_model=AuthSessionResponse, summary="Xác thực mã SMS")
def verify_phone_otp(
    payload: PhoneOtpVerifyRequest,
    response: Response,
    session: Annotated[Session, Depends(get_db_session)],
) -> AuthSessionResponse:
    user, tokens = verify_phone_challenge(
        session, challenge_id=payload.challenge_id, code=payload.code
    )
    set_refresh_cookie(response, tokens.refresh_token)
    return session_response(user, tokens.access_token, tokens.access_expires_in)


@router.get(
    "/providers",
    response_model=ProviderAvailabilityResponse,
    summary="Danh sách phương thức đăng nhập khả dụng",
)
def providers() -> ProviderAvailabilityResponse:
    return ProviderAvailabilityResponse(**provider_availability())


@router.get("/oauth/{provider}/start", summary="Bắt đầu đăng nhập mạng xã hội")
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


@router.get("/oauth/google/callback", summary="Hoàn tất đăng nhập Google")
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
