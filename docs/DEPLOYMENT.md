# Triển khai miễn phí: Vercel + Render + Neon

| Thành phần | Dịch vụ | Cấu hình trong repo |
|---|---|---|
| Frontend (React/Vite) | Vercel | `frontend/vercel.json` |
| Backend (FastAPI) | Render, Web Service Docker | `backend/Dockerfile` |
| PostgreSQL | Neon | — |
| Email OTP | Gmail API qua HTTPS | `BEP_VIET_EMAIL_PROVIDER=gmail_api` |

Trình duyệt chỉ làm việc với domain Vercel. Vercel chuyển tiếp `/api/*` sang Render (giống `nginx.conf` khi chạy Docker Compose), nên cookie đăng nhập vẫn là first-party và không cần mở CORS cho domain khác.

Không commit giá trị thật của bất kỳ biến bí mật nào; chỉ nhập chúng vào trang cấu hình của từng dịch vụ.

## 1. Neon – cơ sở dữ liệu

1. Tạo project tại <https://console.neon.tech>, chọn phiên bản PostgreSQL mới nhất có sẵn và region gần người dùng (ví dụ Singapore).
2. Lấy connection string **không qua pooler** (host không có `-pooler`).
3. Đổi tiền tố `postgresql://` thành `postgresql+psycopg://` và giữ tham số `sslmode=require`:

   ```text
   postgresql+psycopg://<USER>:<PASSWORD>@<HOST>/<DB>?sslmode=require
   ```

4. Nạp dữ liệu từ máy local (cần tệp `BEP_VIET_300_mon_Viet.docx` ở thư mục gốc, xem `docs/RECIPE_CATALOG_IMPORT.md`):

   ```powershell
   cd backend
   $env:BEP_VIET_DATABASE_URL = "<NEON_URL>"
   .\.venv\Scripts\python.exe -m alembic upgrade head
   .\.venv\Scripts\python.exe -m app.scripts.import_recipe_catalog
   .\.venv\Scripts\python.exe -m app.scripts.create_admin --email <ADMIN_EMAIL>
   Remove-Item Env:BEP_VIET_DATABASE_URL
   ```

## 2. Gmail API – gửi email

Render free chặn cổng SMTP 25/465/587, nên production gửi mail qua Gmail API (cổng 443) bằng chính tài khoản Gmail đang dùng.

1. Google Cloud Console → **APIs & Services** → bật **Gmail API**.
2. **OAuth consent screen**: thêm scope `https://www.googleapis.com/auth/gmail.send`, rồi bấm **Publish app** để chuyển sang **In production**. Nếu để *Testing*, refresh token hết hạn sau 7 ngày và email ngừng gửi.
3. **Credentials** → **Create OAuth client ID** → loại **Desktop app**.
4. Lấy refresh token (đăng nhập đúng Gmail sẽ gửi thư; khi Google báo "chưa xác minh", chọn *Advanced → Go to …*):

   ```powershell
   cd backend
   .\.venv\Scripts\python.exe scripts\get_gmail_refresh_token.py --client-id <CLIENT_ID> --client-secret <CLIENT_SECRET>
   ```

Thu hồi quyền tại <https://myaccount.google.com/permissions> sẽ vô hiệu hóa token; khi đó chạy lại bước 4.

## 3. Render – backend

1. <https://dashboard.render.com> → **New → Web Service** → kết nối repo GitHub.
2. Cấu hình:
   - **Language**: Docker; **Root Directory**: `backend`; **Instance type**: Free
   - **Health Check Path**: `/api/v1/livez`
   - Không cần Start Command: `Dockerfile` tự chạy `alembic upgrade head` rồi uvicorn trên `$PORT`.
3. Đặt tên service là `bep-viet-api` để URL khớp `frontend/vercel.json`. Nếu Render cấp tên khác, sửa `destination` trong tệp đó.
4. **Environment Variables** (`<FRONTEND>` là domain Vercel ở bước 4, ví dụ `https://bep-viet.vercel.app`):

   | Biến | Giá trị |
   |---|---|
   | `BEP_VIET_APP_ENV` | `production` |
   | `BEP_VIET_DATABASE_URL` | URL Neon ở bước 1 |
   | `BEP_VIET_JWT_SECRET` | chuỗi ngẫu nhiên ≥ 32 ký tự (`python -c "import secrets; print(secrets.token_urlsafe(48))"`) |
   | `BEP_VIET_FRONTEND_URL` | `<FRONTEND>` |
   | `BEP_VIET_CORS_ORIGINS` | `["<FRONTEND>"]` |
   | `BEP_VIET_EMAIL_PROVIDER` | `gmail_api` |
   | `BEP_VIET_EMAIL_GMAIL_CLIENT_ID` | từ bước 2 |
   | `BEP_VIET_EMAIL_GMAIL_CLIENT_SECRET` | từ bước 2 |
   | `BEP_VIET_EMAIL_GMAIL_REFRESH_TOKEN` | từ bước 2 |
   | `BEP_VIET_EMAIL_FROM_ADDRESS` | Gmail đã cấp quyền ở bước 2 |
   | `BEP_VIET_SUPPORT_EMAIL` | email nhận yêu cầu hỗ trợ |
   | `BEP_VIET_GOOGLE_CLIENT_ID` / `BEP_VIET_GOOGLE_CLIENT_SECRET` | (nếu dùng đăng nhập Google) |
   | `BEP_VIET_GOOGLE_REDIRECT_URI` | `<FRONTEND>/api/v1/auth/oauth/google/callback` |

   Khi đăng nhập Google, thêm đúng redirect URI trên vào **Authorized redirect URIs** của OAuth client đăng nhập (Web application) trong Google Cloud Console.

5. Kiểm tra: mở `https://<BACKEND>.onrender.com/api/v1/livez`.

## 4. Vercel – frontend

1. <https://vercel.com/new> → import repo.
2. **Root Directory**: `frontend`; Framework Preset: **Vite** (build `pnpm build`, output `dist`).
3. **Environment Variables**:
   - `VITE_API_BASE_URL` = `/api/v1`
   - `ENABLE_EXPERIMENTAL_COREPACK` = `1` (dùng đúng pnpm khai báo trong `packageManager`)
   - Tùy chọn: các biến `VITE_CONTACT_*` trong `frontend/.env.example`
4. Deploy, rồi cập nhật `BEP_VIET_FRONTEND_URL`, `BEP_VIET_CORS_ORIGINS` và `BEP_VIET_GOOGLE_REDIRECT_URI` trên Render theo domain thật.

## 5. Kiểm tra sau triển khai

- Trang chủ và `/recipes` hiển thị đủ món; F5 tại một trang con không bị 404.
- Đăng ký tài khoản mới, nhận được email OTP; đăng nhập rồi tải lại trang vẫn giữ phiên.
- Gửi yêu cầu hỗ trợ; email thông báo đến `BEP_VIET_SUPPORT_EMAIL`.
- Xem log trên Render nếu có lỗi `Gmail OAuth token refresh failed: invalid_grant` (token bị thu hồi/hết hạn → làm lại mục 2.4).

## Giới hạn của gói miễn phí

- **Render Free** tắt service sau khoảng 15 phút không có truy cập; lần truy cập tiếp theo chờ khoảng 30–60 giây. Có thể dùng dịch vụ ping (ví dụ UptimeRobot, 10 phút/lần vào `/api/v1/livez`) để giữ service chạy; một service chạy liên tục vẫn nằm trong 750 giờ free mỗi tháng.
- **Gmail cá nhân** giới hạn khoảng 500 thư/ngày.
- **Neon Free** giới hạn dung lượng lưu trữ; ảnh đại diện người dùng được lưu trong cơ sở dữ liệu nên cần theo dõi dung lượng.
- Các giới hạn trên do nhà cung cấp quy định và có thể thay đổi; kiểm tra trang giá hiện hành trước khi phụ thuộc vào chúng.
