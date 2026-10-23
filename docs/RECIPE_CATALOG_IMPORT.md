# Kho món ăn Bếp Việt

Kho hiện có **589 món ăn tại ba miền Việt Nam**: 300 hồ sơ `BV001`–`BV300` từ `BEP_VIET_300_recipes.json`, 30 món tráng miệng trái cây `BV301`–`BV330`, 255 món vùng miền trong 51 batch tiếp theo (`BV331`–`BV585`) và bốn món cũ được giữ lại. Bốn món đã có được cập nhật tại chỗ. Mỗi hồ sơ có nguyên liệu, định lượng, sơ chế, cách nấu, thành phẩm, cách dùng, mẹo, thời gian chờ và món ăn kèm.

Chạy tại thư mục `backend` sau khi PostgreSQL đã sẵn sàng:

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m app.scripts.import_recipe_catalog
```

Khi CSDL đã có dữ liệu và chỉ muốn bổ sung món mới mà không ghi đè nội dung món đang dùng, chạy:

```powershell
.\.venv\Scripts\python.exe -m app.scripts.import_recipe_catalog --only-missing
```

Chế độ này giữ nguyên các món đã có và trạng thái chỉnh sửa của chúng; món thử nghiệm `thit-kho-trung-qa` được chuyển sang ẩn để không xuất hiện trong kho công khai.

Có thể truyền `--source` và `--document` để dùng đường dẫn khác. Hai tệp đầu vào mặc định nằm ở thư mục gốc dự án. Tài liệu Word là tệp tài liệu cục bộ được bỏ qua trong Git; cần giữ tệp này để trích xuất lại ảnh.

Lệnh kiểm tra đủ ID, trường nội dung, tổng thời gian và liên kết món ăn kèm trước khi nhập. Ảnh trong Word được ghép theo ID hồ sơ và lưu vào `frontend/public/images/recipes`; ảnh minh họa mới nằm trong `frontend/public/images/recipes/edited`. Lệnh cập nhật theo ID hoặc slug và giữ UUID món cũ; chạy lại không tạo bản ghi trùng. Các ảnh Bếp Việt và ảnh có giấy phép đang dùng cho món cũ được giữ nguyên.

Giao diện tải toàn bộ kho từ `/api/v1/recipes/catalog`, từng trang 100 món. Trang `/recipes` có tìm kiếm tên, tên gọi khác, nguyên liệu và từ khóa; hỗ trợ có/không dấu, bộ lọc vùng miền và loại món, sắp xếp và xem thêm. Nội dung mới cũng dùng được trong vòng quay mâm cơm. Lệnh nhập cũng xuất bản chụp dữ liệu vào `frontend/public/data/recipe-catalog.json`; khi API mất kết nối, ứng dụng tải bản này và thông báo rõ trạng thái mất kết nối. CSDL vẫn là nguồn dữ liệu chính khi API hoạt động.

Các URL giao diện dùng tiếng Anh: `/recipes`, `/meals`, `/random-meal`, `/planner`, `/suggestions`, `/nutrition`, `/articles`, `/favorites`, `/submit-recipe`, `/account`, `/admin` và các trang đăng nhập. Địa chỉ tiếng Việt cũ được chuyển sang địa chỉ mới, giữ mã món, query và hash. Tên món và nội dung giao diện vẫn là tiếng Việt.

Phần cách dùng hiển thị trực tiếp nội dung Bếp Việt biên soạn; các chỉnh sửa cụ thể được lưu trong `backend/app/data/serving_overrides.json`. Nguồn tham khảo và trạng thái biên tập được giữ trong `content` của từng hồ sơ. Ảnh từ bộ 300 món có trạng thái `reference_only`, chưa xác nhận quyền phát hành; ứng dụng ghi nhận nguồn ảnh riêng, không gắn nhãn ảnh này là ảnh sở hữu của Bếp Việt. 30 món tráng miệng và 255 món vùng miền bổ sung có ảnh minh họa Bếp Việt tạo mới. Tất cả 589 món có ảnh cục bộ trong bản build; các công thức bổ sung được biên tập từ nguồn tham khảo và chưa có kết quả nấu thử. Dinh dưỡng chỉ hiển thị khi có dữ liệu xác minh.
