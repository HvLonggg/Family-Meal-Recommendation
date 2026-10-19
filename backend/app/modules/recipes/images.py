"""Chuẩn hóa ảnh món đã tách nền mà quản trị viên tải lên.

Toàn bộ kho món của Bếp Việt dùng ảnh tách nền khung 16:9; ảnh món mới phải theo cùng
chuẩn đó để hiển thị đồng nhất trên thẻ món, kế hoạch và email gợi ý.
"""

from io import BytesIO

from PIL import Image, UnidentifiedImageError

from app.core.images import InvalidImageError

CANVAS_SIZE = (1600, 900)
# Món chiếm tối đa 92% khung, chừa lề để bóng đổ và nền kem phía giao diện thở.
FILL_RATIO = 0.92
MAX_SOURCE_PIXELS = 30_000_000
# Ảnh coi là đã tách nền khi phần lớn viền ngoài trong suốt.
MIN_TRANSPARENT_BORDER = 0.6


def _border_transparency(alpha: Image.Image) -> float:
    width, height = alpha.size
    pixels = alpha.load()
    assert pixels is not None
    step = max(1, min(width, height) // 120)
    samples = [
        *(pixels[x, y] for x in range(0, width, step) for y in (0, height - 1)),
        *(pixels[x, y] for y in range(0, height, step) for x in (0, width - 1)),
    ]
    clear = sum(1 for value in samples if isinstance(value, int) and value < 24)
    return clear / max(1, len(samples))


def prepare_recipe_cutout(data: bytes) -> bytes:
    """Kiểm tra ảnh có nền trong suốt, cắt sát món và đặt giữa khung 1600×900 (WebP)."""
    try:
        with Image.open(BytesIO(data)) as source:
            if source.width * source.height > MAX_SOURCE_PIXELS:
                raise InvalidImageError("Ảnh có kích thước quá lớn.")
            image = source.convert("RGBA")
    except (UnidentifiedImageError, OSError) as exc:
        raise InvalidImageError("Không đọc được ảnh món.") from exc

    alpha = image.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 8 else 0).getbbox()
    if bbox is None:
        raise InvalidImageError("Ảnh món đang trống.")
    if _border_transparency(alpha) < MIN_TRANSPARENT_BORDER:
        raise InvalidImageError(
            "Ảnh cần được tách nền: hãy tải ảnh PNG hoặc WebP có nền trong suốt."
        )

    dish = image.crop(bbox)
    max_width = CANVAS_SIZE[0] * FILL_RATIO
    max_height = CANVAS_SIZE[1] * FILL_RATIO
    scale = min(max_width / dish.width, max_height / dish.height)
    size = (max(1, round(dish.width * scale)), max(1, round(dish.height * scale)))
    dish = dish.resize(size, Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
    canvas.alpha_composite(dish, ((CANVAS_SIZE[0] - size[0]) // 2, (CANVAS_SIZE[1] - size[1]) // 2))
    output = BytesIO()
    canvas.save(output, "WEBP", quality=90, method=4)
    return output.getvalue()
