from io import BytesIO

import pytest
from PIL import Image, ImageDraw

from app.modules.auth.email_images import EMAIL_DISH_SIZE, compose_dish_cutout


def cutout_webp(size: tuple[int, int] = (800, 600)) -> bytes:
    """Ảnh giả lập món đã tách nền: đĩa đỏ ở giữa, phần còn lại trong suốt."""
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(image).ellipse((150, 120, 650, 480), fill=(200, 40, 30, 255))
    output = BytesIO()
    image.save(output, "WEBP", lossless=True)
    return output.getvalue()


def test_dish_image_is_a_crisp_transparent_png_without_a_baked_in_background() -> None:
    dish = Image.open(BytesIO(compose_dish_cutout(cutout_webp())))

    assert dish.format == "PNG"
    assert dish.size == EMAIL_DISH_SIZE
    assert dish.mode == "RGBA"
    red, green, blue, alpha = dish.getpixel((EMAIL_DISH_SIZE[0] // 2, EMAIL_DISH_SIZE[1] // 2))
    assert red > 150 and green < 90 and blue < 90 and alpha == 255
    assert dish.getpixel((8, 8)) == (0, 0, 0, 0)
    assert dish.getchannel("A").getbbox() is not None


def test_dish_image_resizes_to_fit_an_email_attachment_budget() -> None:
    encoded = compose_dish_cutout(cutout_webp(), max_bytes=50_000)
    dish = Image.open(BytesIO(encoded))

    assert dish.format == "PNG"
    assert dish.width < EMAIL_DISH_SIZE[0]
    assert len(encoded) <= 50_000
    assert dish.getpixel((0, 0))[3] == 0


def test_dish_image_rejects_empty_or_broken_images() -> None:
    empty = BytesIO()
    Image.new("RGBA", (40, 40), (0, 0, 0, 0)).save(empty, "PNG")
    with pytest.raises(ValueError):
        compose_dish_cutout(empty.getvalue())
    with pytest.raises(OSError):
        compose_dish_cutout(b"not an image")


def test_meal_email_uses_the_cutout_image_and_falls_back_to_the_catalog_photo(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.modules.auth import email as auth_email

    requested: list[str] = []

    def fetch(path: str, max_bytes: int) -> tuple[bytes, str] | None:
        requested.append(path)
        if path == "/images/recipes/edited/thit-kho-1600.webp":
            return cutout_webp(), "image/webp"
        if path == "/images/recipes/BV007.jpg":
            return b"catalog-photo", "image/jpeg"
        return None

    monkeypatch.setattr(auth_email, "_fetch_public_image", fetch)

    source, inline = auth_email._email_image_source("/images/recipes/BV007.jpg", 0, slug="thit-kho")
    assert source == "cid:bep-viet-meal-0"
    assert inline is not None
    assert inline[2:] == ("image/png", "thit-kho.png")
    rendered = Image.open(BytesIO(inline[1]))
    assert rendered.size == EMAIL_DISH_SIZE
    assert rendered.mode == "RGBA"
    assert rendered.getpixel((8, 8))[3] == 0

    fallback, fallback_inline = auth_email._email_image_source(
        "/images/recipes/BV007.jpg", 1, slug="mon-chua-tach-nen"
    )
    assert fallback == "cid:bep-viet-meal-1"
    assert fallback_inline == ("bep-viet-meal-1", b"catalog-photo", "image/jpeg", "BV007.jpg")

    requested.clear()
    auth_email._email_image_source("/images/recipes/BV007.jpg", 2, slug="../../etc")
    assert requested == ["/images/recipes/BV007.jpg"]


def test_older_runtime_keeps_the_transparent_cutout_when_pillow_is_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import builtins

    from app.modules.auth import email as auth_email

    webp = cutout_webp()
    monkeypatch.setattr(auth_email, "_fetch_public_image", lambda *args: (webp, "image/webp"))
    original_import = builtins.__import__

    def import_without_pillow(name: str, *args: object, **kwargs: object) -> object:
        if name == "PIL":
            raise ImportError("Pillow has not been installed in this runtime")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", import_without_pillow)
    source, inline = auth_email._email_image_source("/images/recipes/BV007.jpg", 0, slug="thit-kho")

    assert source == "cid:bep-viet-meal-0"
    assert inline == ("bep-viet-meal-0", webp, "image/webp", "thit-kho.webp")


def test_email_uses_transparent_cutouts_with_a_clean_email_layout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.modules.auth import email as auth_email

    deliveries: list[dict[str, object]] = []
    monkeypatch.setattr(auth_email, "_send_message", lambda **message: deliveries.append(message))
    monkeypatch.setattr(
        auth_email,
        "_email_image_source",
        lambda path, index, **kwargs: (
            f"cid:bep-viet-meal-{index}",
            (f"bep-viet-meal-{index}", b"png-photo", "image/png", "dish.png"),
        ),
    )

    auth_email.send_meal_suggestion_email(
        recipient="moi@example.com",
        recipient_name="  ",
        meal_type="lunch",
        subject="Gợi ý bữa trưa",
        intro_message="Bếp Việt chọn món cho bạn.",
        closing_message="",
        recipes=[
            {"slug": "pho-bo", "name": "Phở bò", "excerpt": "Nước dùng trong.", "image_path": ""},
            {"slug": "goi-cuon", "name": "Gỏi cuốn", "excerpt": "Thanh mát.", "image_path": ""},
        ],
    )

    message = deliveries[0]
    html = str(message["html"])
    assert "Chào bạn," in html
    assert "Chào bạn," in str(message["text"])
    assert (
        message["preheader"]
        == "2 món được đề xuất cho bữa trưa ngon miệng tại nhà. Phở bò, Gỏi cuốn"
    )
    assert "MÓN 2 / 2" in html
    assert html.count("Xem công thức</a>") == 2
    assert "bgcolor='#fbf8f3'" in html
    assert "cid:bep-viet-meal-0" in html
    assert "width:100%;max-width:544px;height:auto" in html
    assert message["inline_images"] == [
        ("bep-viet-meal-0", b"png-photo", "image/png", "dish.png"),
        ("bep-viet-meal-1", b"png-photo", "image/png", "dish.png"),
    ]


def test_meal_email_without_a_photo_does_not_render_an_empty_image(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.modules.auth import email as auth_email

    deliveries: list[dict[str, object]] = []
    monkeypatch.setattr(auth_email, "_send_message", lambda **message: deliveries.append(message))
    monkeypatch.setattr(auth_email, "_email_image_source", lambda *args, **kwargs: ("", None))

    auth_email.send_meal_suggestion_email(
        recipient="moi@example.com",
        recipient_name="Bạn",
        meal_type="dinner",
        subject="Gợi ý bữa tối",
        intro_message="Bếp Việt chọn món cho bạn.",
        closing_message="",
        recipes=[
            {
                "slug": "pho-bo",
                "name": "Phở bò",
                "excerpt": "Nước dùng trong.",
                "image_path": "",
            }
        ],
    )

    assert "<img" not in str(deliveries[0]["html"])
