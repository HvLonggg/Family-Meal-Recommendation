"""Gửi Web Push (RFC 8030) có mã hóa aes128gcm (RFC 8291) và xác thực VAPID (RFC 8292).

Tự cài đặt trên `cryptography` thay vì thêm thư viện webpush (kéo theo requests/aiohttp).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import struct
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

import httpx
import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import get_settings

logger = logging.getLogger("bep_viet.cooking.push")

RECORD_SIZE = 4096
# Chỉ gửi tới dịch vụ đẩy của trình duyệt: endpoint do người dùng gửi lên, chặn SSRF.
PUSH_HOST_SUFFIXES = (
    "fcm.googleapis.com",
    "android.googleapis.com",
    "push.services.mozilla.com",
    "push.apple.com",
    "notify.windows.com",
)


class PushGoneError(Exception):
    """Đăng ký không còn hiệu lực (404/410): cần xóa khỏi CSDL."""


@dataclass(frozen=True, slots=True)
class PushTarget:
    endpoint: str
    p256dh: str
    auth: str


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def allowed_endpoint(endpoint: str) -> bool:
    try:
        parts = urlsplit(endpoint)
        port = parts.port
    except ValueError:
        return False
    host = (parts.hostname or "").lower()
    return (
        parts.scheme == "https"
        and port in (None, 443)
        and not parts.username
        and any(host == suffix or host.endswith(f".{suffix}") for suffix in PUSH_HOST_SUFFIXES)
    )


def generate_private_key() -> str:
    key = ec.generate_private_key(ec.SECP256R1())
    return b64url_encode(key.private_numbers().private_value.to_bytes(32, "big"))


def _private_key() -> ec.EllipticCurvePrivateKey | None:
    secret = get_settings().web_push_vapid_private_key
    value = secret.get_secret_value().strip() if secret is not None else ""
    if not value:
        return None
    try:
        raw = b64url_decode(value)
        if len(raw) != 32:
            raise ValueError("invalid length")
        return ec.derive_private_key(int.from_bytes(raw, "big"), ec.SECP256R1())
    except ValueError:
        logger.error("Khóa VAPID không hợp lệ; tắt thông báo đẩy.")
        return None


def _raw_public(key: ec.EllipticCurvePublicKey) -> bytes:
    return key.public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )


def public_key() -> str | None:
    key = _private_key()
    return b64url_encode(_raw_public(key.public_key())) if key is not None else None


def push_enabled() -> bool:
    return _private_key() is not None


def _hmac(key: bytes, data: bytes) -> bytes:
    return hmac.new(key, data, hashlib.sha256).digest()


def encrypt(payload: bytes, p256dh: str, auth: str, *, salt: bytes | None = None) -> bytes:
    """Mã hóa một bản ghi aes128gcm cho trình duyệt nhận (RFC 8291 §3.4)."""
    ua_public = b64url_decode(p256dh)
    auth_secret = b64url_decode(auth)
    receiver = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_public)
    sender = ec.generate_private_key(ec.SECP256R1())
    as_public = _raw_public(sender.public_key())
    shared = sender.exchange(ec.ECDH(), receiver)

    prk_key = _hmac(auth_secret, shared)
    ikm = _hmac(prk_key, b"WebPush: info\x00" + ua_public + as_public + b"\x01")
    salt = salt or os.urandom(16)
    prk = _hmac(salt, ikm)
    cek = _hmac(prk, b"Content-Encoding: aes128gcm\x00\x01")[:16]
    nonce = _hmac(prk, b"Content-Encoding: nonce\x00\x01")[:12]
    # 0x02: dấu kết thúc bản ghi cuối cùng, không thêm đệm.
    ciphertext = AESGCM(cek).encrypt(nonce, payload + b"\x02", None)
    header = salt + struct.pack("!IB", RECORD_SIZE, len(as_public)) + as_public
    return header + ciphertext


def _vapid_header(endpoint: str, key: ec.EllipticCurvePrivateKey) -> str:
    settings = get_settings()
    parts = urlsplit(endpoint)
    subject = settings.web_push_subject or (
        f"mailto:{settings.email_from_address}"
        if settings.email_from_address
        else str(settings.frontend_url)
    )
    token = jwt.encode(
        {
            "aud": f"{parts.scheme}://{parts.netloc}",
            "exp": int(time.time()) + 12 * 3600,
            "sub": subject,
        },
        key,
        algorithm="ES256",
    )
    return f"vapid t={token}, k={b64url_encode(_raw_public(key.public_key()))}"


def send(target: PushTarget, message: dict[str, Any], *, ttl: int = 900) -> bool:
    """Gửi một thông báo; trả về False khi lỗi tạm thời, ném PushGoneError khi hết hạn."""
    key = _private_key()
    if key is None or not allowed_endpoint(target.endpoint):
        return False
    body = encrypt(json.dumps(message, ensure_ascii=False).encode(), target.p256dh, target.auth)
    try:
        response = httpx.post(
            target.endpoint,
            content=body,
            headers={
                "Authorization": _vapid_header(target.endpoint, key),
                "Content-Encoding": "aes128gcm",
                "Content-Type": "application/octet-stream",
                "TTL": str(ttl),
                "Urgency": "high",
            },
            timeout=10,
        )
    except httpx.HTTPError:
        logger.warning("Không gửi được thông báo đẩy (mạng).")
        return False
    if response.status_code in (404, 410):
        raise PushGoneError
    if response.status_code >= 300:
        logger.warning("Dịch vụ đẩy trả lỗi %s.", response.status_code)
        return False
    return True
