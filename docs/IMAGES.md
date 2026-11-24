# Ảnh món ăn (frontend/public/images)

## Cấu trúc
- `images/recipes/edited/` — ảnh món đã tách nền (WebP có alpha), dùng ở mọi màn hình và email.
- `images/recipes/BVxxx.jpg`, `images/recipes/<slug>.jpg|webp` — ảnh gốc cũ, còn được
  `frontend/public/data/recipe-catalog.json` / DB (`image_path`) trỏ tới làm fallback.
- `images/platter/`, `images/brand/` — ảnh nền đĩa và nhận diện thương hiệu.
- Không còn `images/recipes-owned/` (ảnh sinh tạm, không được tham chiếu). Bản master PNG/4K
  nằm ngoài repo (`output/recipe-images/...`), không đưa vào `public/`.

## Quy ước tên và kích thước
- `edited/<slug>-<w>.webp` với `w` ∈ 480, 960, 1536 (hoặc 1600 ở lô cũ), 3840.
- Cạnh dài không vượt quá `w`. Canvas 16:9 trong suốt.
- `srcSet` lấy từ `frontend/src/data/recipeImageAssets.json` (khóa = slug) và
  `backend/app/data/curated_recipe_batches/assets_*.json` (`web_variants`).
- Email (`backend/app/modules/auth/email.py`) tự dò `<slug>-{1600,1536,960,480}.webp`,
  nên đừng xóa các cỡ này khi slug còn dùng.

## Thêm ảnh cho món mới
1. Xuất 4 cỡ `<slug>-480/960/1536/3840.webp` vào `images/recipes/edited/`.
2. Thêm mục slug vào `recipeImageAssets.json` (`src` = bản 960, `srcSet`, `master`, `alt`)
   và `web_variants` trong `assets_<batch>.json` tương ứng.
3. Nén lại (idempotent, chỉ ghi khi nhỏ hơn ≥5%, quality 78, method 4):
   ```
   cd backend
   .venv/Scripts/python scripts/optimize_recipe_images.py [--dry-run] [đường dẫn...]
   ```
4. Chạy test ảnh/catalog: `pytest -q tests/test_email_images.py` và
   `vitest run src/data/recipeApi.test.tsx`.

## Lưu ý dung lượng deploy
- Bản `-3840` chiếm phần lớn dung lượng. Chỉ thêm khi thật cần; file không được tham chiếu
  phải xóa khỏi `public/` (mọi file trong `public/` đều được deploy).
