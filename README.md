# Bếp Việt — Gợi ý món ăn và lập kế hoạch bữa cơm gia đình

Bếp Việt là ứng dụng web giúp người dùng khám phá món ăn Việt, lựa chọn món phù hợp và chủ động xây dựng thực đơn cho gia đình. Dự án tập trung vào trải nghiệm gần gũi, nội dung tiếng Việt và quy trình sử dụng đơn giản trên cả máy tính lẫn điện thoại.

> Dự án hiện đang trong giai đoạn phát triển MVP.

## Bài toán dự án giải quyết

Việc chuẩn bị bữa cơm hằng ngày thường gặp những câu hỏi quen thuộc: hôm nay ăn gì, kết hợp món nào, cần bao nhiêu nguyên liệu và làm sao lên kế hoạch cho cả tuần. Bếp Việt được xây dựng để tập trung các nhu cầu đó vào một hệ thống duy nhất:

- Giảm thời gian suy nghĩ và tìm kiếm món ăn mỗi ngày.
- Hỗ trợ lựa chọn món theo nhu cầu, vùng miền và loại bữa ăn.
- Điều chỉnh lượng nguyên liệu theo số người dùng.
- Lưu món yêu thích và tổ chức kế hoạch nấu ăn theo tuần.
- Cung cấp công thức tiếng Việt với nguyên liệu và các bước thực hiện rõ ràng.

## Tính năng chính

- **Kho món Việt:** duyệt, tìm kiếm và lọc công thức món ăn.
- **Chi tiết công thức:** xem nguyên liệu, khẩu phần và hướng dẫn nấu từng bước.
- **Điều chỉnh khẩu phần:** thay đổi số người ăn để tính lại lượng nguyên liệu.
- **Gợi ý món và mâm cơm:** hỗ trợ kết hợp món cho bữa ăn gia đình.
- **Kế hoạch theo tuần:** sắp xếp món ăn cho từng ngày.
- **Yêu thích:** lưu lại các món người dùng quan tâm.
- **Tài khoản người dùng:** đăng ký trực tiếp bằng email, khôi phục mật khẩu bằng OTP email, đăng nhập và quản lý hồ sơ.
- **Đăng nhập Google:** hỗ trợ OAuth khi được cấu hình thông tin Google Cloud.
- **Phân quyền quản trị:** khu vực riêng dành cho tài khoản quản trị viên.
- **Đề xuất món:** người dùng đã đăng nhập có thể gửi món ăn mới cho hệ thống.
- **Giao diện responsive:** sử dụng được trên máy tính, máy tính bảng và điện thoại.

OTP email cần cấu hình SMTP để gửi thư thật; khi chạy development chưa có SMTP, API trả mã thử để kiểm tra luồng. Cấu hình và nguyên tắc phiên/tài khoản được ghi tại [docs/AUTHENTICATION_SECURITY.md](docs/AUTHENTICATION_SECURITY.md). Đăng nhập Facebook chưa được kích hoạt.

## Ứng dụng thực tế

Bếp Việt phù hợp với:

- Cá nhân hoặc gia đình muốn lên thực đơn nhanh và hạn chế lặp món.
- Người mới nấu ăn cần công thức và hướng dẫn bằng tiếng Việt.
- Người nội trợ muốn chuẩn bị trước nguyên liệu cho nhiều ngày.
- Nhóm phát triển muốn tham khảo một ứng dụng full-stack React và FastAPI.

## Công nghệ sử dụng

| Thành phần | Công nghệ |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, React Query |
| Backend | Python 3.12, FastAPI, SQLAlchemy, Pydantic |
| Database | PostgreSQL |
| Migration | Alembic |
| Xác thực | JWT, Argon2, Google OAuth |
| Kiểm thử | Pytest, Vitest, Testing Library |
| Triển khai local | Docker, Docker Compose |

## Kiến trúc tổng quan

```text
Frontend React
      │
      │ REST API
      ▼
Backend FastAPI
      │
      ▼
PostgreSQL
```

Backend được tổ chức theo kiến trúc modular monolith. Nghiệp vụ xác thực và công thức được tách thành các module riêng; frontend giao tiếp với backend thông qua REST API.

## Cấu trúc thư mục

```text
.
├── backend/              # FastAPI API, migration và kiểm thử backend
├── frontend/             # Ứng dụng React/TypeScript
├── docs/                 # Tài liệu kỹ thuật của hệ thống
├── .github/workflows/    # Quy trình kiểm tra CI
├── docker-compose.yml    # Môi trường chạy toàn bộ ứng dụng
└── README.md
```

## Khởi động nhanh khi đã cài thư viện

Trên máy đã có `backend/.venv` và `frontend/node_modules`, dùng cách này để chạy lại dự án. Database chạy trong Docker; backend và frontend chạy trực tiếp trên máy. Không cần cài lại thư viện hoặc build image mỗi lần khởi động.

Mở Docker Desktop, sau đó mở **hai terminal PowerShell tại thư mục gốc dự án** (`D:\idea\Dish_recommendation_project` trên máy hiện tại).

### Terminal 1 — database và backend

```powershell
docker compose up -d --no-build --wait db
if ($LASTEXITCODE -ne 0) { throw "Database chưa khởi động thành công." }

cd backend
$env:BEP_VIET_DATABASE_URL = "postgresql+psycopg://bep_viet:bep_viet_local@127.0.0.1:5432/bep_viet"
.\.venv\Scripts\python.exe -m alembic upgrade head
if ($LASTEXITCODE -ne 0) { throw "Migration chưa chạy thành công." }

.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

URL database ở trên dùng tài khoản, mật khẩu và cổng mặc định của dự án. Nếu đã đổi `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT` hoặc `POSTGRES_DB` trong `.env` ở thư mục gốc, chỉnh URL cho khớp. Biến `$env:BEP_VIET_DATABASE_URL` chỉ áp dụng cho terminal hiện tại và ưu tiên hơn giá trị trong `backend/.env`.

Dùng `127.0.0.1` cho kết nối database cục bộ để tránh trường hợp kết nối qua `localhost` bị chậm trên Windows. Chờ backend hiện dòng `Uvicorn running on http://127.0.0.1:8000`.

### Terminal 2 — frontend

```powershell
corepack pnpm --dir frontend dev --host 127.0.0.1 --port 5173 --strictPort
```

Chờ Vite hiện `ready` và địa chỉ web, rồi mở:

- Giao diện web: <http://localhost:5173>
- Backend API: <http://localhost:8000>
- Tài liệu OpenAPI: <http://localhost:8000/docs>
- Kiểm tra kết nối database: <http://localhost:8000/api/v1/readyz>

**Giữ cả hai terminal mở khi dùng ứng dụng.** Vite và Uvicorn chạy liên tục để phục vụ web; terminal không tự kết thúc sau khi máy chủ sẵn sàng là bình thường.

### Dừng chế độ phát triển

Nhấn `Ctrl+C` trong từng terminal backend và frontend. Nếu muốn dừng database Bếp Việt, mở terminal tại thư mục gốc và chạy:

```powershell
docker compose stop db
```

Lệnh này giữ dữ liệu database và chỉ dừng dịch vụ `db` của dự án Bếp Việt. CVAT/Nuclio thuộc dự án khác vẫn được giữ nguyên.

## Thiết lập chế độ phát triển lần đầu

Chỉ cần làm phần này khi chưa có môi trường Python hoặc thư viện frontend. Yêu cầu Docker Desktop đang chạy, Python 3.12, Node.js 22.15 và Corepack.

### Tạo các file cấu hình

Chạy tại thư mục gốc. Các lệnh dưới đây giữ cấu hình `.env` nếu file đã tồn tại:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
if (-not (Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
if (-not (Test-Path frontend/.env)) { Copy-Item frontend/.env.example frontend/.env }
```

### Cài thư viện backend

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
cd ..
```

### Cài thư viện frontend

Tại thư mục gốc:

```powershell
corepack pnpm install --frozen-lockfile
```

Sau đó chạy theo phần **Khởi động nhanh khi đã cài thư viện** ở trên. Khi database mới chưa có món ăn, mở thêm terminal tại `backend`, đặt cùng biến `$env:BEP_VIET_DATABASE_URL` như Terminal 1, rồi chạy:

```powershell
.\.venv\Scripts\python.exe -m app.scripts.seed_recipes
```

Để nhập bộ 300 công thức, xem [hướng dẫn nhập kho công thức](docs/RECIPE_CATALOG_IMPORT.md).

## Chạy toàn bộ dự án bằng Docker

Cách này cần Docker Desktop và Docker Compose. Backend, frontend và database đều chạy trong container. Dừng các terminal Vite/Uvicorn trước khi dùng cách này để tránh trùng cổng `5173` và `8000`.

### Khởi động lần đầu hoặc sau khi sửa mã nguồn

Chạy tại thư mục gốc:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose up -d --build
```

Lần build đầu cần Internet để tải image và thư viện; bước này có thể mất nhiều thời gian. Sau khi build và khởi động thành công, ứng dụng chạy nền nhờ `-d` và vẫn truy cập qua <http://localhost:5173>.

### Chạy lại khi các image đã build thành công

```powershell
docker compose up -d --no-build
```

Chỉ dùng `--no-build` khi đã có đầy đủ image backend và frontend. Nếu lần build trước thất bại, cần chạy lại lệnh có `--build`.

### Xem trạng thái và log

```powershell
docker compose ps -a
docker compose logs -f --tail 50
```

Nhấn `Ctrl+C` để thoát màn hình theo dõi log; các container chạy nền vẫn hoạt động.

### Dừng hệ thống Bếp Việt

```powershell
docker compose down
```

Chạy lệnh tại thư mục Bếp Việt. Lệnh giữ volume database và không dừng dự án CVAT/Nuclio riêng.

## Khi khởi động chưa thành công

- **`EAI_AGAIN`, `Temporary failure in name resolution`, `ETIMEDOUT`:** Docker đang lỗi DNS hoặc kết nối khi tải thư viện. Kiểm tra mạng và cấu hình VPN/proxy, rồi thử build lại; web chưa mở được nếu build chưa hoàn tất.
- **API phản hồi chậm hoặc hết thời gian chờ:** khi chạy backend trực tiếp trên Windows, dùng `127.0.0.1` trong URL database như hướng dẫn khởi động nhanh. Khi backend chạy trong Docker, tên host database vẫn là `db` theo cấu hình Compose.
- **Cổng `5173` hoặc `8000` đã được dùng:** kiểm tra phiên Bếp Việt đã chạy trước đó và dừng phiên đó trước khi mở phiên mới. Không chạy đồng thời backend/frontend bằng Docker và chế độ phát triển trên cùng cổng.
- **Terminal vẫn chạy sau khi hiện `ready` hoặc `Uvicorn running`:** đây là trạng thái máy chủ đang phục vụ ứng dụng; mở địa chỉ web và giữ terminal chạy.

## Ảnh món, trình chiếu và phân trang

- Kho món hiển thị **24 món mỗi trang**. Chọn số trang hoặc mũi tên để thay danh sách hiện tại; tìm kiếm, đổi loại món, vùng miền hoặc cách sắp xếp sẽ trở về trang đầu. Trang đang xem và bộ lọc được lưu trong URL.
- Đề xuất trên trang chủ trình chiếu từng món, chuyển nhẹ sau **10–13 giây**. Có nút chọn ảnh và chạy/tạm dừng; tự dừng khi rê chuột, thao tác bằng bàn phím hoặc chuyển sang tab khác. Người dùng bật chế độ giảm chuyển động sẽ không bị tự chạy slide.
- Ảnh mới dùng nền trong suốt, giữ trọn đĩa/bát. Bản WebP theo kích thước hiển thị nằm tại `frontend/public/images/recipes/edited/`; ảnh gốc của kho vẫn được giữ nguyên.
- Bộ ảnh có **334/334 món**: 304 món ban đầu và 30 món tráng miệng trái cây mới. Tiến độ, kích thước render thật và các đường dẫn ảnh được ghi tại [progress.json](output/recipe-images/progress.json) và [manifest.json](output/recipe-images/manifest.json).
- Các bản PNG xuất **3840 × 2160** nằm tại [output/recipe-images/4k](output/recipe-images/4k). Đây là bản xuất phóng từ ảnh AI gốc; kích thước render của từng ảnh khác nhau và không phải render 4K nguyên bản. [Ghi chú ảnh và prompt](output/recipe-images/README.md) mô tả nguồn và cách xuất ảnh.

## Kiểm tra chất lượng mã nguồn

Backend:

```powershell
cd backend
ruff format --check .
ruff check .
mypy app
pytest
```

Frontend:

```powershell
corepack pnpm frontend:check
corepack pnpm frontend:build
```

## Tác giả

Dự án cá nhân được thiết kế và phát triển bởi **Hoàng Văn Long**.

- GitHub: [@HvLonggg](https://github.com/HvLonggg)
- Repository: [Family Meal Recommendation](https://github.com/HvLonggg/Family-Meal-Recommendation)

## Trạng thái và định hướng

Phiên bản hiện tại xây dựng nền tảng cho kho công thức, tài khoản người dùng, gợi ý bữa ăn và kế hoạch theo tuần. Các bước tiếp theo tập trung vào hoàn thiện dữ liệu món ăn, thuật toán gợi ý, tích hợp dịch vụ production và triển khai bản dùng thử công khai.
