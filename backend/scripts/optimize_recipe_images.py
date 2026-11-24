"""Nén lại ảnh WebP món ăn tại chỗ (giữ nguyên đường dẫn, định dạng, kênh alpha).

Chạy từ thư mục backend/:
    .venv/Scripts/python scripts/optimize_recipe_images.py [--dry-run] [--workers 6] [paths...]

Mặc định xử lý frontend/public/images/recipes/edited. Cạnh dài bị giới hạn theo hậu tố
kích thước trong tên file (vd. `-1536.webp` -> 1536px). Chỉ ghi đè khi bản mới nhỏ hơn
ít nhất MIN_GAIN, nên chạy lại nhiều lần là an toàn (idempotent).
"""

from __future__ import annotations

import argparse
import io
import re
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DIR = ROOT / "frontend/public/images/recipes/edited"
QUALITY = 78
METHOD = 4  # đo trên ảnh 3840: method 6 chậm ~9 lần mà kích thước gần như bằng
MIN_GAIN = 0.05  # bỏ qua nếu tiết kiệm dưới 5%
SIZE_SUFFIX = re.compile(r"-(\d{3,4})\.webp$", re.I)


def optimize(path: Path, dry_run: bool) -> tuple[int, int]:
    """Trả về (kích thước cũ, kích thước mới); mới == cũ nghĩa là bỏ qua."""
    before = path.stat().st_size
    with Image.open(path) as image:
        image.load()
        match = SIZE_SUFFIX.search(path.name)
        cap = int(match[1]) if match else None
        if cap and max(image.size) > cap:
            image.thumbnail((cap, cap), Image.Resampling.LANCZOS)
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
        buffer = io.BytesIO()
        image.save(buffer, "WEBP", quality=QUALITY, method=METHOD)
    data = buffer.getvalue()
    if len(data) > before * (1 - MIN_GAIN):
        return before, before
    if not dry_run:
        path.write_bytes(data)
    return before, len(data)


def _task(args: tuple[str, bool]) -> tuple[str, int, int]:
    path, dry_run = args
    try:
        before, after = optimize(Path(path), dry_run)
    except (OSError, ValueError) as error:  # file hỏng: báo, không dừng cả lô
        print(f"SKIP {path}: {error}", file=sys.stderr)
        return path, 0, 0
    return path, before, after


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("paths", nargs="*", type=Path, help="File hoặc thư mục .webp")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()

    files: list[Path] = []
    for target in args.paths or [DEFAULT_DIR]:
        files.extend(sorted(target.rglob("*.webp")) if target.is_dir() else [target])

    total_before = total_after = changed = 0
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        jobs = [(str(f), args.dry_run) for f in files]
        for _, before, after in pool.map(_task, jobs, chunksize=8):
            total_before += before
            total_after += after
            changed += after < before
    mib = 2**20
    print(
        f"{len(files)} file, nén lại {changed}: "
        f"{total_before / mib:.1f} MiB -> {total_after / mib:.1f} MiB"
        + (" (dry-run)" if args.dry_run else "")
    )


if __name__ == "__main__":
    main()
