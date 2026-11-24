# Rà soát bảo mật trước production — 2026-11-24

Tiếp nối `SECURITY_REVIEW_2026-11-19.md`; chỉ ghi điểm mới hoặc còn hở. Không đọc `.env`. Rà soát bằng đọc mã, build và chạy test cục bộ; chưa kiểm thử trên Vercel/Render thật.

## Trạng thái các việc tồn đọng từ 2026-11-19

| Việc | Trạng thái |
|---|---|
| Staging chặn JWT secret mặc định `development-only…` | Đã có trong `core/config.py`. |
| Body chunked lách giới hạn 16 MB | Đã có trong `core/middleware.py` (từ chối API ghi dữ liệu dùng `Transfer-Encoding: chunked`). |
| `client_ip` lấy hop phải nhất của `X-Forwarded-For` (Vercel rewrite → Render) | **Chưa sửa**, vẫn cần đo trên production (xem "Việc cần chủ dự án làm"). |

## Phát hiện mới

| Mức | Vị trí | Mô tả | Trạng thái |
|---|---|---|---|
| Trung bình | `account/router.py` `upload_avatar`, `articles/service.py` `_apply_cover` | Avatar và ảnh bìa được lưu nguyên byte rồi phục vụ công khai. Ảnh chụp bằng điện thoại thường chứa EXIF GPS (lộ vị trí nhà người dùng). Ngoài ra chỉ kiểm magic bytes, nên dữ liệu lạ nối sau ảnh vẫn được lưu. | **Đã sửa.** `core/images.py` thêm `reencode_without_metadata`: giải mã thật bằng Pillow, kiểm định dạng khớp MIME, giới hạn 16 MP (chống decompression bomb), xoay theo EXIF rồi lưu lại không kèm EXIF/ICC/XMP. Ảnh món của admin đã được Pillow xử lý lại từ trước. |
| Thấp | `core/config.py` `validate_production_secrets` | Production thiếu `BEP_VIET_FRONTEND_URL`/`BEP_VIET_CORS_ORIGINS` vẫn khởi động với `http://localhost:5173`, và chấp nhận origin `http://`. | **Đã sửa.** Production từ chối khởi động nếu `frontend_url` hoặc một origin CORS không phải `https` hoặc là localhost. |
| Thấp | `frontend/src/features/auth/landing.ts` `safeReturnPath` | Trình duyệt bỏ tab/xuống dòng khỏi URL, nên `/\t/evil.com` có thể thành `//evil.com`. Hiện đường dẫn chỉ đi qua `navigate()` của router (không ra ngoài), nhưng nên chặn từ gốc. | **Đã sửa.** Từ chối đường dẫn chứa ký tự điều khiển. |
| Thấp | `frontend/vercel.json`, `frontend/nginx.conf` | Ảnh tĩnh `/images/**` (không băm tên) không có cache dài: nginx gắn `no-cache`, Vercel dùng mặc định. | **Đã sửa.** `public, max-age=604800, stale-while-revalidate=86400` (7 ngày, không `immutable` vì ảnh có thể bị thay cùng tên). |
| Thấp | `backend/.venv` (pip-audit) | `dnspython 2.8.0` (CVE-2026-114605 sửa ở 2.9.0, CVE-2026-128089 sửa ở 2.9.2; phụ thuộc gián tiếp qua `email-validator`), `opentelemetry-api 1.45.1` (CVE-2026-126360 sửa ở 1.45.2). | **Chưa nâng cấp** (không tự nâng dependency). Cần chủ dự án quyết định. |
| Thông tin | `core/config.py` | Giá trị mặc định `email_smtp_username`, `email_from_address`, `support_email` là địa chỉ Gmail cá nhân thật nằm trong mã nguồn. Đây là dữ liệu cá nhân, không phải bí mật. | Ghi nhận; nên chuyển sang biến môi trường hoặc địa chỉ chung. |
| Thông tin | Frontend | `npm audit` không chạy được vì repo dùng `pnpm-lock.yaml` (không có `package-lock.json`); `pnpm` không có trên PATH. | Chạy `pnpm audit --prod` trong CI. |
| Thông tin | `backend/scripts/optimize_recipe_images.py:74` | `ruff check .` báo E501 (dòng 102 ký tự) ở tệp của agent xử lý ảnh. | Không phải lỗi bảo mật; để agent đó sửa. |

### Đã kiểm tra, không thấy lỗi mới

- **Bí mật ở frontend:** không có key/token trong `src`, `public`, `index.html`. `VITE_*` chỉ có `VITE_API_BASE_URL` và thông tin liên hệ công khai. Build production (`vite build`) không có tệp `.map` hay `sourceMappingURL`; grep `dist` không thấy mẫu `AIza…`, `sk-…`, `BEGIN PRIVATE KEY`, JWT hay `password=`.
- **Lưu token:** access token chỉ nằm trong bộ nhớ; refresh token là cookie `HttpOnly`/`Secure`/`SameSite=Lax`, path `/api/v1/auth`. `localStorage` chỉ giữ tín hiệu đăng xuất giữa các tab, tiến độ nấu và cờ giao diện, không chứa token.
- **XSS:** không có `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function` hay `javascript:`.
- **Header:** Vercel có HSTS 1 năm, CSP `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `upgrade-insecure-requests`, XFO DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP `same-origin`. `img-src https:` phải giữ vì catalog dùng ảnh ngoài (cookbeo.com, monngonmoingay.com…). `connect-src 'self'` đủ vì API đi qua rewrite cùng origin. Google OAuth dùng chuyển hướng toàn trang nên COOP/`form-action` không cản. nginx (Docker cục bộ, HTTP) cố ý không có HSTS và `upgrade-insecure-requests`. `index.html`, `sw.js`, `manifest.webmanifest`, `version.json` là `no-cache`; `/assets/**` cache 1 năm `immutable`.
- **Backend:** `/docs`, `/redoc`, `/openapi.json` tắt ngoài development/test. CORS là danh sách origin cụ thể kèm credentials. Không có `text()` ghép chuỗi. Endpoint mới (`/health/status`, cache catalog) chỉ trả dữ liệu công khai. Tài liệu `.docx/.pptx` của admin có giới hạn dung lượng, số tệp con, kích thước sau giải nén và chặn DTD/ENTITY.
- **.gitignore:** `.env*`, `.pnpm-store/`, `dist`, `coverage`, `*.log` đã bị bỏ qua; `.pnpm-store` không còn trong index. `*.pem`/`*.key` chưa được ignore (báo cho agent phụ trách `.gitignore`); hiện không có tệp khóa nào được track.

## Thay đổi

- `backend/app/core/images.py`: thêm `reencode_without_metadata`.
- `backend/app/modules/account/router.py`, `backend/app/modules/articles/service.py`: gọi hàm trên cho avatar và ảnh bìa.
- `backend/app/core/config.py`: production bắt buộc `frontend_url`/`cors_origins` là https thật.
- `backend/tests/test_auth.py`: hai test chạy ở chế độ production đặt thêm URL https giả lập.
- `backend/tests/test_security_review_2026_11_24.py`: 7 test hồi quy (bỏ GPS/payload nối, định dạng giả, avatar qua API, cấu hình production).
- `frontend/src/features/auth/landing.ts`, `session.test.tsx`: chặn ký tự điều khiển, thêm test.
- `frontend/vercel.json`, `frontend/nginx.conf`: cache cho `/images/`.

## Việc cần chủ dự án làm

1. **Render:** đặt `BEP_VIET_APP_ENV=production`, `BEP_VIET_FRONTEND_URL=https://<domain-vercel>`, `BEP_VIET_CORS_ORIGINS=["https://<domain-vercel>"]`, `BEP_VIET_GOOGLE_REDIRECT_URI=https://<domain-vercel>/api/v1/auth/oauth/google/callback`, `BEP_VIET_JWT_SECRET` ngẫu nhiên ≥ 32 ký tự. Từ bản này, thiếu hoặc sai URL thì API **không khởi động**.
2. **Đo `X-Forwarded-For` trên production** (log tạm số hop) rồi chỉnh `core/net.py` lấy đúng hop của proxy tin cậy. Nếu không, mọi người dùng sau Vercel có thể chung một bộ đếm giới hạn đăng nhập/OTP.
3. **Dependency:** nâng `dnspython` lên ≥ 2.9.2 và `opentelemetry-api` lên ≥ 1.45.2 (hoặc thư viện cha), rồi chạy lại test. Thêm `pip-audit` và `pnpm audit --prod` vào CI.
4. Chuyển địa chỉ email mặc định trong `config.py` sang biến môi trường.
5. Sau deploy, kiểm header thật: `curl -sI https://<domain>/` và `curl -sI https://<domain>/images/...`; thử đăng nhập Google và trang Liên hệ (iframe Google Maps) để xác nhận CSP không chặn.

## Kiểm chứng

- Backend: `pytest -q` toàn bộ đạt (exit 0), `ruff format --check` các tệp đã sửa đạt. `ruff check .` chỉ còn E501 ở `scripts/optimize_recipe_images.py` (ngoài phạm vi).
- Frontend: `tsc -b` đạt; `eslint . --max-warnings=0` đạt; `vitest run` lần 1 (chạy song song với pytest) có 3/549 test lỗi, lần 2 không có test nào lỗi, nên nhiều khả năng do timeout khi máy quá tải; `vite build` thành công, không có source map.
- Chưa kiểm: header trên Vercel thật, cấu trúc `X-Forwarded-For` qua Render.
