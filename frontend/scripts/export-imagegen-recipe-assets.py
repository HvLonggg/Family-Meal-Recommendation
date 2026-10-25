import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import sys
from pathlib import Path

from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = SCRIPT_DIR.parent
PROJECT_DIR = FRONTEND_DIR.parent
SIZES = (480, 960, 1536, 3840)
EXPORT_SIZE = (3840, 2160)
ALPHA_THRESHOLD = 12
WEBP_METHOD = 4


def trim_transparent_margin(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    visible = alpha.point(lambda value: 255 if value > ALPHA_THRESHOLD else 0)
    bounds = visible.getbbox()
    if bounds is None:
        raise ValueError("Source image contains no visible dish pixels.")

    left, top, right, bottom = bounds
    margin = max(2, round(max(image.size) * 0.012))
    bounds = (
        max(0, left - margin),
        max(0, top - margin),
        min(image.width, right + margin),
        min(image.height, bottom + margin),
    )
    return image.crop(bounds)


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
    if source.resolve() != native_path.resolve():
        image.save(native_path, format="PNG", optimize=True)

    visible_image = trim_transparent_margin(image)
    export = Image.new("RGBA", EXPORT_SIZE, (0, 0, 0, 0))
    safe_width = round(EXPORT_SIZE[0] * 0.84)
    safe_height = round(EXPORT_SIZE[1] * 0.88)
    scale = min(safe_width / visible_image.width, safe_height / visible_image.height)
    scaled_size = (round(visible_image.width * scale), round(visible_image.height * scale))
    scaled = visible_image.resize(scaled_size, Image.Resampling.LANCZOS)
    export.alpha_composite(scaled, ((EXPORT_SIZE[0] - scaled.width) // 2, (EXPORT_SIZE[1] - scaled.height) // 2))
    export.save(four_k_dir / f"{slug}.png", format="PNG", optimize=False, compress_level=2)

    for width in SIZES:
        height = round(EXPORT_SIZE[1] * width / EXPORT_SIZE[0])
        variant = export.resize((width, height), Image.Resampling.LANCZOS)
        variant.save(
            web_dir / f"{slug}-{width}.webp",
            format="WEBP",
            quality=92,
            method=WEBP_METHOD,
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
    parser.add_argument("--asset", action="append", help="slug=source.png")
    parser.add_argument(
        "--refresh-registered",
        action="store_true",
        help="Re-export registered images that have a native PNG in output/recipe-images/native.",
    )
    parser.add_argument(
        "--refresh-native",
        action="store_true",
        help="Re-export every native recipe PNG in output/recipe-images/native.",
    )
    parser.add_argument(
        "--refresh-missing-native",
        action="store_true",
        help="Export native recipes that are missing at least one WebP size.",
    )
    args = parser.parse_args()
    if sum(
        (args.refresh_registered, args.refresh_native, args.refresh_missing_native, bool(args.asset))
    ) != 1:
        parser.error("Choose one refresh mode or one or more --asset options.")

    results = []
    assets: list[tuple[str, Path]] = []
    if args.refresh_registered:
        registry_path = FRONTEND_DIR / "src/data/recipeImageAssets.json"
        registry = json.loads(registry_path.read_text(encoding="utf-8"))
        native_dir = PROJECT_DIR / "output/recipe-images/native"
        assets = [
            (slug, native_dir / f"{slug}.png")
            for slug in registry
            if (native_dir / f"{slug}.png").is_file()
        ]
    elif args.refresh_native:
        native_dir = PROJECT_DIR / "output/recipe-images/native"
        assets = sorted(
            ((source.stem, source) for source in native_dir.glob("*.png")),
            key=lambda asset: asset[0],
        )
    elif args.refresh_missing_native:
        native_dir = PROJECT_DIR / "output/recipe-images/native"
        web_dir = FRONTEND_DIR / "public/images/recipes/edited"
        assets = sorted(
            (
                (source.stem, source)
                for source in native_dir.glob("*.png")
                if any(not (web_dir / f"{source.stem}-{width}.webp").is_file() for width in SIZES)
            ),
            key=lambda asset: asset[0],
        )
    else:
        for item in args.asset:
            slug, separator, source_text = item.partition("=")
            if not separator or not slug or not source_text:
                raise ValueError(f"Invalid asset argument: {item}")
            source = Path(source_text).expanduser().resolve()
            if not source.is_file():
                raise FileNotFoundError(source)
            assets.append((slug, source))

    if args.refresh_registered or args.refresh_native or args.refresh_missing_native:
        with ThreadPoolExecutor(max_workers=2) as executor:
            pending = {
                executor.submit(export_asset, slug, source): (index, slug)
                for index, (slug, source) in enumerate(assets, start=1)
            }
            for future in as_completed(pending):
                index, slug = pending[future]
                results.append(future.result())
                print(f"Normalized {index}/{len(assets)}: {slug}", file=sys.stderr, flush=True)
    else:
        for slug, source in assets:
            results.append(export_asset(slug, source))
    if args.refresh_registered or args.refresh_native or args.refresh_missing_native:
        print(f"Refreshed {len(results)} recipe images.")
    else:
        print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
