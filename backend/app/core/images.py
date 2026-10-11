"""Kiểm tra ảnh người dùng tải lên dưới dạng data URL (avatar, ảnh bìa bài viết)."""

import base64
import binascii
import re
from dataclasses import dataclass

from app.core.exceptions import DomainError

_DATA_URL_PATTERN = re.compile(r"^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$")
_SIGNATURES: dict[str, tuple[bytes, ...]] = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),
}


class InvalidImageError(DomainError):
    code = "INVALID_IMAGE"


@dataclass(frozen=True, slots=True)
class DecodedImage:
    content_type: str
    data: bytes


def decode_image_data_url(value: str, *, max_bytes: int) -> DecodedImage:
    """Giải mã data URL và xác minh chữ ký tệp để chặn nội dung giả mạo định dạng ảnh."""
    match = _DATA_URL_PATTERN.match(value.strip())
    if match is None:
        raise InvalidImageError("Ảnh phải ở định dạng JPG, PNG hoặc WebP.")
    content_type, encoded = match.groups()
    try:
        data = base64.b64decode(encoded, validate=False)
    except (binascii.Error, ValueError) as exc:
        raise InvalidImageError("Không đọc được dữ liệu ảnh.") from exc
    if not data:
        raise InvalidImageError("Ảnh tải lên đang trống.")
    if len(data) > max_bytes:
        raise InvalidImageError(f"Ảnh vượt quá dung lượng cho phép ({max_bytes // 1024} KB).")
    signatures = _SIGNATURES[content_type]
    if not any(data.startswith(signature) for signature in signatures):
        raise InvalidImageError("Nội dung tệp không khớp với định dạng ảnh.")
    if content_type == "image/webp" and data[8:12] != b"WEBP":
        raise InvalidImageError("Nội dung tệp không khớp với định dạng ảnh.")
    return DecodedImage(content_type=content_type, data=data)
