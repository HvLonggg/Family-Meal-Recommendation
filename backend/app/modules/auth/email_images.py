"""Prepare crisp, transparent dish cutouts for branded email cards."""

from io import BytesIO

from PIL import Image, ImageChops, ImageFilter, ImageOps

# 1200px gives a sharp 2x rendition at the email template's 544px display width.
EMAIL_DISH_SIZE = (1200, 760)
MAX_SOURCE_PIXELS = 24_000_000
_SHADOW_COLOR = (70, 42, 28)


def compose_dish_cutout(
    image_bytes: bytes,
    size: tuple[int, int] = EMAIL_DISH_SIZE,
    max_bytes: int | None = None,
) -> bytes:
    """Tạo PNG độ phân giải cao, giữ nền trong suốt cho ảnh món trong email."""
    with Image.open(BytesIO(image_bytes)) as source:
        if source.width * source.height > MAX_SOURCE_PIXELS:
            raise ValueError("Ảnh món quá lớn để dựng email.")
        dish = ImageOps.exif_transpose(source).convert("RGBA")

    bbox = dish.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Ảnh món không có nội dung.")
    dish = dish.crop(bbox)

    width, height = size
    scale = min(width * 0.88 / dish.width, height * 0.84 / dish.height)
    dish = dish.resize(
        (max(1, round(dish.width * scale)), max(1, round(dish.height * scale))),
        Image.Resampling.LANCZOS,
    )
    x = (width - dish.width) // 2
    y = (height - dish.height) // 2 - round(height * 0.025)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))

    shadow_alpha = Image.new("L", size, 0)
    shadow_alpha.paste(dish.getchannel("A"), (x, y + round(dish.height * 0.035)))
    shadow_alpha = shadow_alpha.filter(ImageFilter.GaussianBlur(max(8, round(height * 0.025))))
    shadow_alpha = ImageChops.multiply(shadow_alpha, Image.new("L", size, 42))
    shadow = Image.new("RGBA", size, (*_SHADOW_COLOR, 0))
    shadow.putalpha(shadow_alpha)
    canvas.alpha_composite(shadow)
    canvas.alpha_composite(dish, (x, y))

    # Thu nhỏ ảnh nếu vượt giới hạn tệp đính kèm.
    candidate_sizes = [size]
    if max_bytes is not None:
        candidate_sizes.extend(
            (max(640, round(width * factor)), max(400, round(height * factor)))
            for factor in (0.9, 0.8, 0.7, 0.6, 0.5)
        )
    for candidate_size in dict.fromkeys(candidate_sizes):
        image = (
            canvas
            if candidate_size == size
            else canvas.resize(candidate_size, Image.Resampling.LANCZOS)
        )
        output = BytesIO()
        image.save(output, "PNG", optimize=True, compress_level=8)
        encoded = output.getvalue()
        if max_bytes is None or len(encoded) <= max_bytes:
            return encoded
    raise ValueError("Không thể tối ưu ảnh món trong giới hạn dung lượng email.")
