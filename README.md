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
- **Tài khoản người dùng:** đăng ký, đăng nhập, khôi phục mật khẩu và quản lý hồ sơ.
- **Đăng nhập Google:** hỗ trợ OAuth khi được cấu hình thông tin Google Cloud.
- **Phân quyền quản trị:** khu vực riêng dành cho tài khoản quản trị viên.
- **Đề xuất món:** người dùng đã đăng nhập có thể gửi món ăn mới cho hệ thống.
- **Giao diện responsive:** sử dụng được trên máy tính, máy tính bảng và điện thoại.

Một số dịch vụ như gửi email, SMS OTP và đăng nhập Facebook cần được kết nối với nhà cung cấp tương ứng khi triển khai production.

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

## Chạy dự án bằng Docker

### Yêu cầu

- Docker Desktop
- Docker Compose

### Khởi động

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Sau khi các dịch vụ khởi động:

- Giao diện web: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- Tài liệu OpenAPI: `http://localhost:8000/docs`

Dừng hệ thống bằng lệnh:

```powershell
docker compose down
```

## Chạy ở chế độ phát triển

### Backend

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
Copy-Item .env.example .env
alembic upgrade head
python -m app.scripts.seed_recipes
uvicorn app.main:app --reload
```

### Frontend

Từ thư mục gốc của dự án:

```powershell
corepack pnpm install
Copy-Item frontend/.env.example frontend/.env
corepack pnpm frontend:dev
```

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
