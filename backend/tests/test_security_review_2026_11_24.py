"""Hồi quy cho rà soát bảo mật 2026-11-24: bỏ metadata ảnh công khai, chặn URL localhost ở prod."""

import base64
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from pydantic import AnyHttpUrl, SecretStr, ValidationError

from app.core.config import Settings
from app.core.images import (
    InvalidImageError,
    decode_image_data_url,
    reencode_without_metadata,
)
from tests.helpers import register_and_login

GPS_TAG = 0x8825


def _jpeg_with_gps() -> bytes:
    exif = Image.Exif()
    exif[0x010F] = "PhoneMaker"  # Make
    exif[GPS_TAG] = {1: "N", 2: (21.0, 1.0, 30.0), 3: "E", 4: (105.0, 51.0, 0.0)}
    output = BytesIO()
    Image.new("RGB", (32, 24), (200, 120, 60)).save(output, "JPEG", exif=exif)
    return output.getvalue()


def _data_url(raw: bytes, content_type: str = "image/jpeg") -> str:
    return f"data:{content_type};base64,{base64.b64encode(raw).decode()}"


def test_reencode_strips_exif_gps_and_trailing_payload() -> None:
    raw = _jpeg_with_gps() + b"<script>alert(1)</script>"
    with Image.open(BytesIO(raw)) as before:
        assert GPS_TAG in before.getexif()

    cleaned = reencode_without_metadata(decode_image_data_url(_data_url(raw), max_bytes=10**6))

    assert cleaned.content_type == "image/jpeg"
    assert b"<script>" not in cleaned.data
    with Image.open(BytesIO(cleaned.data)) as after:
        assert after.size == (32, 24)
        assert len(after.getexif()) == 0


def test_reencode_rejects_format_mismatch() -> None:
    output = BytesIO()
    Image.new("RGB", (4, 4)).save(output, "PNG")
    # Chữ ký RIFF/WEBP giả đặt trước dữ liệu PNG.
    fake_webp = b"RIFF\x00\x00\x00\x00WEBP" + output.getvalue()
    decoded = decode_image_data_url(_data_url(fake_webp, "image/webp"), max_bytes=10**6)
    with pytest.raises(InvalidImageError):
        reencode_without_metadata(decoded)


def test_avatar_is_served_without_gps_metadata(client: TestClient) -> None:
    headers = register_and_login(client, "gps@example.com")
    uploaded = client.put(
        "/api/v1/account/avatar",
        headers=headers,
        json={"data_url": _data_url(_jpeg_with_gps())},
    )
    assert uploaded.status_code == 200, uploaded.text
    served = client.get(f"/api/v1{uploaded.json()['avatar_url']}")
    assert served.status_code == 200
    with Image.open(BytesIO(served.content)) as image:
        assert GPS_TAG not in image.getexif()


@pytest.mark.parametrize(
    ("frontend", "origins"),
    [
        ("http://localhost:5173", ["https://bepviet.example.test"]),
        ("https://bepviet.example.test", ["http://localhost:5173"]),
        ("http://bepviet.example.test", ["https://bepviet.example.test"]),
    ],
)
def test_production_refuses_insecure_frontend_or_cors(frontend: str, origins: list[str]) -> None:
    with pytest.raises(ValidationError, match="https"):
        Settings(
            app_env="production",
            jwt_secret=SecretStr("p" * 48),
            email_provider="smtp",
            email_smtp_username="smtp-user",
            email_smtp_host="smtp.example.test",
            email_from_address="no-reply@example.test",
            email_smtp_password=SecretStr("not-a-real-password"),
            frontend_url=AnyHttpUrl(frontend),
            cors_origins=[AnyHttpUrl(origin) for origin in origins],
        )


def test_production_accepts_https_frontend_and_cors() -> None:
    settings = Settings(
        app_env="production",
        jwt_secret=SecretStr("p" * 48),
        email_provider="smtp",
        email_smtp_username="smtp-user",
        email_smtp_host="smtp.example.test",
        email_from_address="no-reply@example.test",
        email_smtp_password=SecretStr("not-a-real-password"),
        frontend_url=AnyHttpUrl("https://bepviet.example.test"),
        cors_origins=[AnyHttpUrl("https://bepviet.example.test")],
    )
    assert settings.secure_cookies is True
    assert settings.docs_enabled is False
