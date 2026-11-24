"""Kiểm tra ảnh người dùng tải lên dưới dạng data URL (avatar, ảnh bìa bài viết)."""

import base64
import binascii
import re
import warnings
from dataclasses import dataclass
from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.exceptions import DomainError

_DATA_URL_PATTERN = re.compile(r"^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$")
_SIGNATURES: dict[str, tuple[bytes, ...]] = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),
}
# Ảnh đại diện/ảnh bìa không cần lớn hơn ~16 MP; chặn "decompression bomb" khi giải mã.
_MAX_PIXELS = 16_000_000
_PIL_FORMATS = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}


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


def reencode_without_metadata(image: DecodedImage) -> DecodedImage:
    """Giải mã thật rồi lưu lại ảnh để bỏ EXIF/GPS, ICC, chú thích và dữ liệu gắn kèm.

    Ảnh avatar và ảnh bìa được phục vụ công khai; ảnh chụp từ điện thoại thường mang tọa độ GPS.
    Lưu lại bằng Pillow cũng loại phần dữ liệu lạ nối sau ảnh (tệp đa định dạng).
    """
    fmt = _PIL_FORMATS[image.content_type]
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(image.data)) as source:
                if source.format != fmt:
                    raise InvalidImageError("Nội dung tệp không khớp với định dạng ảnh.")
                if source.width * source.height > _MAX_PIXELS:
                    raise InvalidImageError("Ảnh có kích thước điểm ảnh quá lớn.")
                source.load()
                picture = ImageOps.exif_transpose(source)
    except InvalidImageError:
        raise
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        SyntaxError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as exc:
        raise InvalidImageError("Không đọc được dữ liệu ảnh.") from exc
    if fmt == "JPEG" and picture.mode not in {"RGB", "L"}:
        picture = picture.convert("RGB")
    elif picture.mode not in {"RGB", "RGBA", "L", "LA", "P"}:
        picture = picture.convert("RGBA")
    # Pillow tự chép EXIF/ICC/XMP từ ``info`` khi lưu: chỉ giữ thông tin độ trong suốt.
    transparency = picture.info.get("transparency")
    picture.info = {} if transparency is None else {"transparency": transparency}
    output = BytesIO()
    options: dict[str, object] = {"quality": 90} if fmt in {"JPEG", "WEBP"} else {"optimize": True}
    picture.save(output, format=fmt, **options)
    return DecodedImage(content_type=image.content_type, data=output.getvalue())
