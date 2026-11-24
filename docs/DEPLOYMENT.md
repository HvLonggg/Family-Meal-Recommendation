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

Để cấu hình Gmail API khi phát triển local (kể cả Docker không kết nối được SMTP), làm theo mục [Gmail API configuration for local development](AUTHENTICATION_SECURITY.md#gmail-api-configuration-for-local-development). Không dùng chung OAuth client của Google Sign-In.

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

**Cách nhanh (khuyên dùng):** Dashboard → **New → Blueprint** → chọn repo. Render đọc `render.yaml` ở thư mục gốc, tự sinh `BEP_VIET_JWT_SECRET`, đặt sẵn các biến không bí mật (production, Gmail API, `BEP_VIET_TRUSTED_PROXY_HOPS=2` cho chuỗi Vercel → Render, giới hạn tải, pool DB) và chỉ hỏi các giá trị bí mật/domain. Sau đó bỏ qua bước 1–4 dưới đây.

> `BEP_VIET_TRUSTED_PROXY_HOPS=2` giả định Vercel ghi IP người dùng vào `X-Forwarded-For` rồi Render nối IP Vercel. Sau deploy, nếu thấy giới hạn đăng nhập chặn nhầm nhiều người cùng lúc, kiểm tra log và chỉnh giá trị này.

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
- Đăng ký tài khoản mới và nhận email chào mừng; dùng chức năng quên mật khẩu để kiểm tra OTP email.
- Gửi yêu cầu hỗ trợ; email thông báo đến `BEP_VIET_SUPPORT_EMAIL`.
- Với tài khoản quản trị, kiểm tra `GET /api/v1/admin/meal-suggestions/delivery-status` trước khi gửi gợi ý món.
- Xem log trên Render nếu có lỗi `Gmail OAuth token refresh failed: invalid_grant` (token bị thu hồi/hết hạn → làm lại mục 2.4).

## Giới hạn của gói miễn phí

- **Render Free** tắt service sau khoảng 15 phút không có truy cập; lần truy cập tiếp theo chờ khoảng 30–60 giây. Có thể dùng dịch vụ ping (ví dụ UptimeRobot, 10 phút/lần vào `/api/v1/livez`) để giữ service chạy; một service chạy liên tục vẫn nằm trong 750 giờ free mỗi tháng.
- **Gmail cá nhân** giới hạn khoảng 500 thư/ngày.
- **Neon Free** giới hạn dung lượng lưu trữ; ảnh đại diện người dùng được lưu trong cơ sở dữ liệu nên cần theo dõi dung lượng.
- Các giới hạn trên do nhà cung cấp quy định và có thể thay đổi; kiểm tra trang giá hiện hành trước khi phụ thuộc vào chúng.

## 6. Giám sát uptime và chống ngủ (miễn phí)

- Backend có `GET /api/v1/livez` (dùng cho Render Health Check và healthcheck Docker Compose).
- UptimeRobot (gói Free): tạo monitor **HTTP(s)**, URL `https://<BACKEND>.onrender.com/api/v1/livez`, chu kỳ 5–10 phút, cảnh báo qua email hỗ trợ. Thêm monitor thứ hai cho trang chủ Vercel `https://<FRONTEND_DOMAIN>/`.
- Thay thế: cron-job.org gọi cùng URL mỗi 10 phút. Không ping quá dày (giữ dưới hạn mức 750 giờ/tháng của Render Free).
- Ping chỉ giảm cold start, không đảm bảo SLA; khi có người dùng trả phí hoặc cần ổn định, nâng Render lên gói trả phí.

## 7. Sao lưu cơ sở dữ liệu Neon

1. **Khôi phục theo thời điểm (PITR)**: Neon giữ lịch sử thay đổi trong một khoảng ngắn tùy gói (kiểm tra trang giá hiện hành). Trong console: *Branches → Restore* hoặc tạo branch từ thời điểm trước sự cố.
2. **Branch trước mỗi lần migration/phát hành**: tạo branch `pre-release-<YYYYMMDD>` từ `main` trong console Neon trước khi chạy `alembic upgrade head` trên production.
3. **Bản dump định kỳ ra ngoài Neon** (ít nhất hằng tuần và trước mỗi phát hành), chạy từ máy quản trị có `pg_dump` cùng hoặc mới hơn phiên bản server:

   ```powershell
   $env:PGURL = "<NEON_URL_DANG_postgresql://...?sslmode=require>"
   pg_dump --format=custom --no-owner --file "bep_viet_$(Get-Date -Format yyyyMMdd).dump" $env:PGURL
   Remove-Item Env:PGURL
   ```

   Lưu tệp dump ở nơi riêng tư có mã hóa (không đưa vào Git). Dump chứa dữ liệu cá nhân người dùng.
4. **Diễn tập khôi phục** mỗi tháng vào một branch Neon hoặc Postgres local:

   ```powershell
   pg_restore --no-owner --clean --if-exists --dbname "<URL_DB_THU_NGHIEM>" bep_viet_YYYYMMDD.dump
   ```

## 8. Quy trình rollback

| Thành phần | Cách rollback | Ghi chú |
|---|---|---|
| Frontend (Vercel) | *Deployments* → chọn bản ổn định trước → **Promote to Production** (Instant Rollback) | Không cần build lại. |
| Backend (Render) | *Events/Deploys* → chọn deploy trước → **Rollback**; hoặc revert commit trên `main` | Kiểm tra `/api/v1/livez` sau rollback. |
| Schema DB | Ưu tiên migration tương thích ngược (thêm cột/bảng trước, xóa sau). Nếu bắt buộc: `alembic downgrade -1` với `BEP_VIET_DATABASE_URL` trỏ production | Chỉ khi migration có `downgrade` đã kiểm thử. |
| Dữ liệu hỏng | Khôi phục từ branch `pre-release-*` hoặc PITR của Neon, hoặc `pg_restore` bản dump | Ghi lại thời điểm sự cố để chọn mốc khôi phục. |

Thứ tự khi phát hành có migration: tạo branch Neon → deploy backend (migration chạy khi khởi động) → kiểm tra → deploy frontend. Rollback theo thứ tự ngược lại.

## 9. Header bảo mật

`frontend/vercel.json` (production) và `frontend/nginx.conf` (Docker) đặt CSP, HSTS (chỉ Vercel/HTTPS), `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` (cho phép `microphone=(self)` cho chế độ nấu bằng giọng nói). Backend bổ sung header qua `app/core/middleware.py`. `sw.js`, `index.html`, `manifest.webmanifest` dùng `Cache-Control: no-cache` để người dùng nhận bản vá ngay. Khi thêm dịch vụ ngoài (font, analytics, error tracking), phải cập nhật CSP ở cả hai tệp.

## 10. Tải đông và chống quá tải

Gói free (Render 0,1 CPU/512 MB, một tiến trình uvicorn) phục vụ thoải mái khoảng vài chục đến ~150 người dùng **đang thao tác cùng lúc** (ước lượng, chưa đo tải thật). Nút thắt là CPU của Render, không phải Neon. Frontend tĩnh do CDN Vercel phục vụ, không tốn tài nguyên backend.

Cơ chế bảo vệ có sẵn:

- `BEP_VIET_MAX_CONCURRENT_REQUESTS` (mặc định 64): vượt ngưỡng thì request chờ tối đa `BEP_VIET_OVERLOAD_WAIT_SECONDS` (2 giây) rồi nhận `503 {"code":"OVERLOADED"}` kèm `Retry-After` (`BEP_VIET_OVERLOAD_RETRY_AFTER_SECONDS`, 15 giây). `/status`, `/livez`, `/readyz` không bị giới hạn. Đặt `0` để tắt.
- Hết kết nối trong pool DB (`BEP_VIET_DB_POOL_SIZE` + `BEP_VIET_DB_MAX_OVERFLOW`, chờ `BEP_VIET_DB_POOL_TIMEOUT_SECONDS`) hoặc DB không kết nối được cũng trả `503 OVERLOADED` thay vì 500.
- Mọi phản hồi 429 đều có `Retry-After`.
- `/recipes/catalog` được dựng và nén gzip một lần cho mỗi phiên bản dữ liệu (đệm 5 phút, có ETag → 304).
- Giao diện hiện dải "Bếp Việt đang đông khách…" kèm đếm ngược theo `Retry-After`, không tự thử lại trong thời gian chờ; request treo quá 25 giây (đọc) hoặc 60 giây (ghi) bị hủy và báo như trên.

Khuyến nghị: giữ **một** tiến trình uvicorn (không tăng `--workers` trên 512 MB). Tổng pool 10 kết nối nhỏ hơn nhiều so với giới hạn kết nối trực tiếp của Neon Free nên URL không qua pooler vẫn đủ; chỉ khi chạy nhiều instance mới chuyển sang URL `-pooler` cho ứng dụng (migration vẫn dùng URL trực tiếp). Muốn phục vụ ~1000 người cùng lúc cần nâng gói Render (CPU riêng, 2–4 worker) và đo tải (k6/Locust) trước khi mở rộng.

## Bảo trì, sự cố và cập nhật phiên bản

### Bảo trì có kế hoạch

1. Trên Render (service API), đặt biến môi trường rồi bấm **Save, rebuild and deploy**:
   - `BEP_VIET_MAINTENANCE_MODE=true`
   - `BEP_VIET_MAINTENANCE_MESSAGE=Nâng cấp kho món, dự kiến 30 phút.` (tùy chọn, tối đa 300 ký tự)
   - `BEP_VIET_MAINTENANCE_ENDS_AT=2026-11-20T23:30:00+07:00` (tùy chọn)
2. Mọi API trả `503` mã `MAINTENANCE` kèm `Retry-After`; riêng `/api/v1/status`, `/livez`, `/readyz` vẫn trả lời.
3. Người dùng thấy màn hình "Bếp Việt đang được nâng cấp" (lời nhắn, giờ dự kiến, cam kết dữ liệu được giữ). Trang tự kiểm tra lại mỗi 30 giây.
4. Xong việc: đặt `BEP_VIET_MAINTENANCE_MODE=false` và deploy lại. Trang đang mở tự tải lại.

### Sự cố ngoài kế hoạch

Khi API không phản hồi (Render đang khởi động lại, 502/503/504, mất mạng) hai lần liên tiếp, giao diện hiện dải "Chưa kết nối được máy chủ" và tự thử lại mỗi 15 giây; mất mạng thiết bị hiện "Bạn đang ngoại tuyến". Không cần thao tác gì.

### Cập nhật phiên bản

Mỗi lần build, `vite.config.ts` sinh mã build mới, ghi vào `dist/sw.js` và `dist/version.json` (không cần sửa tay số phiên bản). Tab đang mở kiểm tra `version.json` mỗi 15 phút và khi người dùng quay lại tab, rồi hiện thẻ "Đã có phiên bản mới" với nút **Cập nhật ngay** / **Để sau** (hoãn 1 giờ). Đang ở chế độ Vào bếp thì lời nhắc khuyên cập nhật sau khi nấu xong. Tab cũ đòi tệp JS đã bị thay sẽ tự tải lại một lần.
