# Tạo và đưa ảnh riêng vào danh mục Bếp Việt

`prompts-300.md` và `prompts-300.jsonl` là bộ prompt cũ cho 300 món đầu. Catalog đã mở rộng; chỉ tạo ảnh cho món đã biên tập và đưa vào danh sách chờ, không chạy lại nguyên bộ prompt cũ để ghi đè ảnh hiện có.

## Chuẩn hình ảnh

- Ảnh món Việt chân thực theo bộ mẫu trong `frontend/public/images/recipes/edited/`.
- Đĩa/bát và thức ăn thấy trọn vẹn, nền alpha trong suốt, bóng đổ tiếp xúc nhẹ.
- Bố cục ngang 16:9, chủ thể ở giữa với lề an toàn; không có khung, viền, lớp phủ, chữ hoặc watermark.
- WebP 3840 × 2160 là bản xuất phóng từ render gốc; không mô tả ảnh xuất là render gốc 4K.
- Mỗi ảnh chỉ có một món, bày đúng món trong công thức; không chép ảnh tham khảo.

## Tạo và xuất ảnh

1. Đối chiếu món đã có bản biên tập, nguồn, trạng thái trùng lặp và ID trước khi đưa vào hàng ảnh. Ghi đúng slug đã chốt; không dùng ID tạm hoặc UUID làm tên món.
2. Tạo PNG nền alpha cho đúng một món và lưu tại `output/recipe-images/inbox/<slug>.png`. Kiểm tra ảnh là món đúng, không cắt viền bát/đĩa, không có nền giả, chữ, watermark hay đạo cụ thừa.
3. Từ thư mục gốc dự án, xuất ảnh bằng lệnh hiện có:

   ```powershell
   python frontend/scripts/export-imagegen-recipe-assets.py --asset slug=output/recipe-images/inbox/slug.png
   ```

   Bộ xuất yêu cầu ảnh RGBA tối thiểu 640 × 360 và có pixel trong suốt. Nó lưu PNG nguồn tại `output/recipe-images/native/`, dựng PNG 3840 × 2160 tại `output/recipe-images/4k/`, rồi tạo WebP 480, 960, 1536 và 3840 px. Bộ xuất không cập nhật manifest, batch sidecar hoặc `progress.json`.
4. Sau khi ảnh được duyệt, thêm đường dẫn WebP vào trường `media` trong batch và ghi alpha, kích thước cùng đường dẫn vào `backend/app/data/curated_recipe_batches/assets_NN.json`. Không thêm món vào catalog khi ảnh chưa đúng.
5. Khi batch hoàn chỉnh, đồng bộ catalog bằng lệnh:

   ```powershell
   node frontend/scripts/prepare-catalog.mjs
   ```

   Lệnh này đồng bộ batch, dựng chỉ mục tìm kiếm và chạy `verify-recipe-images.mjs`. Verifier kiểm tra catalog, manifest và các tệp cục bộ tồn tại/không rỗng; nó không đánh giá độ đúng món, alpha hay chất lượng thị giác. Các điểm này cần được rà riêng qua ảnh và sidecar.
6. Cập nhật `output/recipe-images/progress.json` sau khi đối chiếu số lượng và trạng thái thật. Nếu ImageGen trả lỗi quota, ghi nguyên mã lỗi cùng thông tin reset công cụ trả về; không tự suy đoán thời điểm mở quota.

## Đưa ảnh vào dự án

`frontend/src/data/recipeImageAssets.json` là manifest giao diện dùng để chọn ảnh theo `slug`; `frontend/scripts/sync-curated-recipes.mjs` cập nhật manifest từ batch sau khi ảnh đã xuất. Không thay ảnh gốc trong `frontend/public/images/recipes/`; món chưa có ảnh phù hợp tiếp tục ở trạng thái nháp.

Ảnh tạo bằng AI được ghi nhận là ảnh do Bếp Việt tạo, không mô tả là ảnh chụp thử món thật. Fallback OpenAI API cần `OPENAI_API_KEY` và hạn mức riêng; không dùng API key nếu người dùng chưa chọn phương án đó.
