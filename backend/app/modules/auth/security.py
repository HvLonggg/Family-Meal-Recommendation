import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import jwt
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash

from app.core.config import get_settings

password_hasher = PasswordHash.recommended()
DUMMY_PASSWORD_HASH = password_hasher.hash("Mat-khau-gia-123")


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_hasher.verify(password, password_hash)


def create_access_token(*, user_id: UUID, role: str, auth_version: int) -> tuple[str, int]:
    settings = get_settings()
    expires_in = settings.access_token_expire_minutes * 60
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "role": role,
        "ver": auth_version,
        "type": "access",
        "jti": str(uuid4()),
        "iat": now,
        "exp": now + timedelta(seconds=expires_in),
        "iss": "bep-viet-api",
        "aud": "bep-viet-web",
    }
    token = jwt.encode(
        payload,
        settings.jwt_secret.get_secret_value(),
        algorithm="HS256",
    )
    return token, expires_in


def decode_access_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            algorithms=["HS256"],
            audience="bep-viet-web",
            issuer="bep-viet-api",
        )
    except InvalidTokenError as exc:
        raise ValueError("Token không hợp lệ.") from exc

    if payload.get("type") != "access":
        raise ValueError("Sai loại token.")
    return payload


def generate_secret_token() -> str:
    return secrets.token_urlsafe(48)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def otp_digest(*, challenge_id: UUID, code: str) -> str:
    secret = get_settings().jwt_secret.get_secret_value().encode("utf-8")
    value = f"{challenge_id}:{code}".encode()
    return hmac.new(secret, value, hashlib.sha256).hexdigest()


def secure_compare(left: str, right: str) -> bool:
    return hmac.compare_digest(left, right)
