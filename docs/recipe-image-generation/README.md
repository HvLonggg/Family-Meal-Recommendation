# Tạo và đưa ảnh riêng vào danh mục Bếp Việt

`prompts-300.md` có 300 prompt tách theo mã món; `prompts-300.jsonl` là cùng bộ dữ liệu ở định dạng máy đọc được.

## Chuẩn hình ảnh

- Ảnh món Việt chân thực theo bộ mẫu trong `frontend/public/images/recipes/edited/`.
- Đĩa/bát và thức ăn thấy trọn vẹn, nền alpha trong suốt, bóng đổ tiếp xúc nhẹ.
- Bố cục ngang 16:9, chủ thể ở giữa với lề an toàn; không có khung, viền, lớp phủ, chữ hoặc watermark.
- Ảnh WebP 3840 × 2160 là bản xuất phóng từ render gốc; các mẫu gốc hiện khoảng 1672 × 941 px.
- Mỗi ảnh chỉ có một món, bày đúng món trong công thức; không chép ảnh tham khảo.

## Tạo ảnh

1. Xem `output/recipe-images/progress.json`; chỉ tạo ảnh cho món trong `pendingRecipes`. File này luôn là nguồn chính xác cho tiến độ và món tiếp theo.
2. Dùng prompt đúng món trong `prompts-300.md`, tạo PNG có alpha và lưu vào `output/recipe-images/inbox/<slug>.png`.
3. Từ thư mục gốc dự án, chạy bộ xuất hiện có: `node .tmp/imagegen/export.cjs <slug> output/recipe-images/inbox/<slug>.png`. Lệnh kiểm tra nền trong suốt rồi cập nhật PNG gốc, master 3840 × 2160, các biến thể WebP và `recipeImageAssets.json`.
4. Chạy `node .tmp/imagegen/audit.cjs` để cập nhật `progress.json` và kiểm tra bộ ảnh. Nếu ImageGen trả lỗi quota, ghi nguyên trạng thái lỗi vào `progress.json` và tiếp tục từ món còn thiếu khi lượt tạo được mở lại; không tự suy đoán thời điểm mở quota.

## Đưa ảnh vào dự án

Bộ xuất trên cập nhật `frontend/src/data/recipeImageAssets.json`, là manifest mà giao diện dùng để chọn ảnh theo `slug`. Không thay thế ảnh catalog gốc trong `frontend/public/images/recipes/`; các món chưa làm xong tiếp tục dùng ảnh hiện tại.

Ảnh tạo bằng AI sẽ được ghi nhận là ảnh do Bếp Việt tạo, không mô tả là ảnh chụp thử món thật. Fallback OpenAI API cần `OPENAI_API_KEY` và hạn mức riêng; không dùng API key nếu chưa được người dùng chọn phương án đó.
