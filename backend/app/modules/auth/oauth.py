from dataclasses import dataclass
from urllib.parse import urlencode

import httpx

from app.core.config import get_settings

GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo"


class OAuthExchangeError(Exception):
    """Lỗi trao đổi dữ liệu với nhà cung cấp OAuth, không chứa thông tin nhạy cảm."""


@dataclass(frozen=True)
class OAuthProfile:
    provider: str
    subject: str
    email: str
    full_name: str


def google_authorization_url(state: str) -> str:
    settings = get_settings()
    if not settings.google_client_id or not settings.google_client_secret:
        raise OAuthExchangeError("Google chưa được cấu hình.")
    query = urlencode(
        {
            "client_id": settings.google_client_id,
            "redirect_uri": str(settings.google_redirect_uri),
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "include_granted_scopes": "true",
            "prompt": "select_account",
        }
    )
    return f"{GOOGLE_AUTHORIZATION_ENDPOINT}?{query}"


async def exchange_google_code(code: str) -> OAuthProfile:
    settings = get_settings()
    if not settings.google_client_id or not settings.google_client_secret:
        raise OAuthExchangeError("Google chưa được cấu hình.")

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            token_response = await client.post(
                GOOGLE_TOKEN_ENDPOINT,
                data={
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret.get_secret_value(),
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": str(settings.google_redirect_uri),
                },
                headers={"Accept": "application/json"},
            )
            token_response.raise_for_status()
            token_payload = token_response.json()
            access_token = token_payload.get("access_token")
            if not isinstance(access_token, str) or not access_token:
                raise OAuthExchangeError("Google không trả về access token hợp lệ.")

            profile_response = await client.get(
                GOOGLE_USERINFO_ENDPOINT,
                headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
            )
            profile_response.raise_for_status()
            profile_payload = profile_response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise OAuthExchangeError("Không thể xác minh tài khoản với Google.") from exc

    subject = profile_payload.get("sub")
    email = profile_payload.get("email")
    email_verified = profile_payload.get("email_verified")
    full_name = profile_payload.get("name")
    if not isinstance(subject, str) or not subject:
        raise OAuthExchangeError("Tài khoản Google thiếu định danh.")
    if not isinstance(email, str) or not email or email_verified is not True:
        raise OAuthExchangeError("Google chưa xác minh địa chỉ email của tài khoản.")
    if not isinstance(full_name, str) or not full_name.strip():
        full_name = email.split("@", maxsplit=1)[0]

    return OAuthProfile(
        provider="google",
        subject=subject,
        email=email.strip().casefold(),
        full_name=" ".join(full_name.strip().split())[:120],
    )
