import argparse
import json
from pathlib import Path

from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = SCRIPT_DIR.parent
PROJECT_DIR = FRONTEND_DIR.parent
SIZES = (480, 960, 1536, 3840)
EXPORT_SIZE = (3840, 2160)


def export_asset(slug: str, source: Path) -> dict:
    with Image.open(source) as opened:
        image = opened.convert("RGBA")
    if image.width < 640 or image.height < 360:
        raise ValueError(f"{slug}: source image is too small ({image.width}x{image.height}).")
    if image.getchannel("A").getextrema()[0] == 255:
        raise ValueError(f"{slug}: source image has no transparent pixels.")

    native_dir = PROJECT_DIR / "output/recipe-images/native"
    four_k_dir = PROJECT_DIR / "output/recipe-images/4k"
    web_dir = FRONTEND_DIR / "public/images/recipes/edited"
    for directory in (native_dir, four_k_dir, web_dir):
        directory.mkdir(parents=True, exist_ok=True)

    native_path = native_dir / f"{slug}.png"
    image.save(native_path, format="PNG", optimize=True)

    export = Image.new("RGBA", EXPORT_SIZE, (0, 0, 0, 0))
    scaled = image.copy()
    scaled.thumbnail(EXPORT_SIZE, Image.Resampling.LANCZOS)
    export.alpha_composite(scaled, ((EXPORT_SIZE[0] - scaled.width) // 2, (EXPORT_SIZE[1] - scaled.height) // 2))
    export.save(four_k_dir / f"{slug}.png", format="PNG", optimize=True)

    for width in SIZES:
        height = round(EXPORT_SIZE[1] * width / EXPORT_SIZE[0])
        variant = export.resize((width, height), Image.Resampling.LANCZOS)
        variant.save(
            web_dir / f"{slug}-{width}.webp",
            format="WEBP",
            quality=92,
            method=6,
            exact=True,
        )

    return {
        "slug": slug,
        "native": [image.width, image.height],
        "export": list(EXPORT_SIZE),
        "alpha": image.getchannel("A").getextrema()[0] < 255,
        "native_file": str(native_path.relative_to(PROJECT_DIR)),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset", action="append", required=True, help="slug=source.png")
    args = parser.parse_args()
    results = []
    for item in args.asset:
        slug, separator, source_text = item.partition("=")
        if not separator or not slug or not source_text:
            raise ValueError(f"Invalid asset argument: {item}")
        source = Path(source_text).expanduser().resolve()
        if not source.is_file():
            raise FileNotFoundError(source)
        results.append(export_asset(slug, source))
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
