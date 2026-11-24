# Rà soát bảo mật backend — 2026-11-19

Phạm vi: `backend/app/**` (xác thực, phân quyền, đầu vào, rate limit, trợ lý AI, bí mật), `frontend/nginx.conf`, các chỗ render HTML ở `frontend/src`. Không đọc `.env`. Rà soát bằng cách đọc mã và chạy test, không kiểm thử xâm nhập trên môi trường thật.

## Phát hiện

| Mức | Vị trí | Mô tả | Trạng thái |
|---|---|---|---|
| Cao | `backend/app/modules/auth/service.py` `authenticate_oauth_user` (~589) | **Chiếm tài khoản trước khi chủ thật đăng ký (pre-account takeover).** Đăng ký bằng mật khẩu không xác minh email. Kẻ tấn công đăng ký trước bằng email của nạn nhân; khi nạn nhân đăng nhập Google, danh tính Google bị gắn vào tài khoản đó và kẻ tấn công vẫn giữ mật khẩu và các phiên đang mở. | **Đã sửa.** Khi Google xác minh email cho một tài khoản chưa xác minh, hệ thống xóa mật khẩu và định danh `password`, thu hồi mọi phiên và tăng `auth_version`. Tài khoản đã xác minh vẫn giữ mật khẩu. |
| Trung bình | `auth/service.py` `rotate_refresh_token` (~220) | Không phát hiện refresh token bị dùng lại. Token đã xoay bị dùng lại chỉ nhận 401, kẻ giữ token mới không bị đăng xuất. Không khóa dòng, nên hai request song song cùng một token tạo được hai phiên. | **Đã sửa.** Có `SELECT … FOR UPDATE`. Token đã xoay được đánh dấu `expires_at == revoked_at`. Nếu nó bị dùng lại sau 30 giây ân hạn (để nhiều tab làm mới cùng lúc), hệ thống thu hồi mọi phiên và access token. Token thu hồi do đăng xuất hay đổi mật khẩu không kích hoạt cơ chế này. |
| Trung bình | `auth/router.py` `register` (~190) | Đăng ký không có giới hạn tần suất. Có thể tạo tài khoản hàng loạt, và mỗi lần đăng ký gửi email chào mừng tới một địa chỉ bất kỳ chưa xác minh (spam qua hệ thống). | **Đã sửa.** Giới hạn 30 lần/giờ/IP (`REGISTRATIONS_PER_IP`), trả 429 `REGISTRATION_RATE_LIMITED`. |
| Trung bình | `backend/app/core/net.py` `client_ip` | Hàm lấy hop phải nhất của `X-Forwarded-For`. Trong Docker (nginx) cách này đúng. Khi chạy Vercel rewrite → Render, hop phải nhất có thể là IP egress của Vercel. Khi đó mọi người dùng dùng chung một bộ đếm, nên giới hạn đăng nhập (20/15 phút), OTP (10/giờ), hỗ trợ và đăng ký có thể chặn người dùng hợp lệ hàng loạt. | **Chưa sửa, cần xác minh trên production.** Ghi log tạm `X-Forwarded-For` (không log ở mức info lâu dài) để xem có bao nhiêu hop, rồi chọn số proxy tin cậy cố định. |
| Thấp | `backend/app/core/rate_limit.py` | `SlidingWindowLimiter` không bao giờ xóa khóa. Đăng nhập với hàng triệu email hoặc IP ngẫu nhiên làm bộ nhớ tăng mãi. Ngoài ra `blocked()` tạo khóa ngay cả khi chỉ đọc, và `now or …` hiểu sai `now=0`. | **Đã sửa.** Khóa hết hạn bị xóa, tối đa 50.000 khóa (dọn khi đầy), `blocked()` không tạo khóa. |
| Thấp | `auth/security.py` `secure_compare` (~81) | `hmac.compare_digest` trên `str` có ký tự ngoài ASCII ném `TypeError`. Tham số `state` của OAuth callback do client kiểm soát, nên request gây lỗi 500. | **Đã sửa.** Hàm so sánh dạng bytes; callback trả về `status=error`. |
| Thấp | `auth/service.py` `reset_password` (~264) | Đọc reset token không khóa dòng, nên hai request song song có thể dùng cùng một token. | **Đã sửa** (`with_for_update`). |
| Thấp | `core/config.py` `validate_production_secrets` | Staging chỉ kiểm tra độ dài ≥ 32. Secret mặc định `development-only-…` (công khai trong repo) dài hơn 32 ký tự, nên staging vẫn khởi động được với JWT secret công khai. | **Ngoài phạm vi, chưa sửa.** Xem mục "Việc cần làm". |
| Thấp | `core/middleware.py` `_too_large` | Chỉ kiểm tra header `Content-Length`. Body chunked không có header này lọt qua giới hạn 16 MB ở tầng ứng dụng. nginx (`client_max_body_size 16m`) chặn được trong Docker; trên Render, khả năng này phụ thuộc vào proxy của nền tảng. | **Ngoài phạm vi, chưa sửa.** |
| Thấp | `articles/router.py` `cover_image`, `recipes/router.py` `recipe_image` | Ảnh bìa của bài nháp/chờ duyệt và ảnh của món chưa xuất bản vẫn trả về công khai nếu biết UUID/slug. UUID khó đoán; thẻ `<img>` không gửi bearer token, nên chặn sẽ làm hỏng phần xem trước của tác giả. | Chấp nhận, ghi nhận. |
| Thông tin | `auth/router.py` `forgot_password`, `register` | Hai endpoint cho biết email đã có tài khoản hay chưa (`EMAIL_NOT_REGISTERED`, `EMAIL_ALREADY_EXISTS`). Đây là quyết định sản phẩm đã ghi trong `AUTHENTICATION_SECURITY.md`, và việc dò bị giới hạn bởi số OTP mỗi giờ theo email/IP. | Theo thiết kế. |
| Thông tin | `auth/router.py` `login` | Khóa theo email (5 lần sai/15 phút) cho phép người khác cố ý khóa tạm một tài khoản. Bộ đếm nằm trong bộ nhớ tiến trình, nên chạy nhiều worker thì giới hạn nhân lên theo số worker. | Chấp nhận, ghi nhận. |
| Thông tin | `change-password`, `change-email`, `account/delete` | Ba endpoint xác minh lại mật khẩu nhưng không giới hạn số lần sai. Kẻ có access token bị lộ (15 phút) có thể dò mật khẩu, nhưng chậm vì argon2. | Chưa sửa (rủi ro thấp). |

### Các điểm đã kiểm tra và không thấy lỗi

- JWT HS256 kiểm `aud`/`iss`/`type`/`exp`. Vai trò lấy từ DB, `auth_version` vô hiệu hóa token cũ. Refresh cookie có `HttpOnly`, `SameSite=Lax`, `Secure` ở staging/production, path `/api/v1/auth`. Access token chỉ nằm trong bộ nhớ.
- OTP: 5 chữ số, HMAC theo challenge, so sánh constant-time, tối đa 3 lần thử, hết hạn sau 5 phút, cooldown 60 giây, tối đa 3 lần/giờ/email và 10 lần/giờ/IP, khóa advisory PostgreSQL. OTP đổi email và xóa tài khoản gắn với `user_id`.
- OAuth: `state` ngẫu nhiên lưu trong cookie HttpOnly. Callback chuyển hướng cố định về `frontend_url`, không có open redirect. Phía frontend `safeReturnPath` chặn `//` và `/\`.
- IDOR: planner, favorites, saved_meals, cooking (log, timer, push), submissions, support, assistant (hội thoại, bộ nhớ) và account export/delete đều lọc theo `current_user.id`. Bài viết dùng `can_manage`. Toàn bộ router `/admin` có `dependencies=[Depends(require_admin)]`. Admin không tự đổi được vai trò hay trạng thái của chính mình.
- Mass assignment: schema bài viết có `extra="forbid"`, `kind` chỉ admin đặt được, `status` do server tính. Cập nhật hồ sơ chỉ nhận `full_name`. Tùy chọn cá nhân đi qua `scope_preferences_for_role`.
- SQL: không có `text()` ghép chuỗi (chỉ có `SELECT 1` ở health). `ilike` dùng tham số bind. Ký tự `%`/`_` chưa được escape, nên chỉ ảnh hưởng độ khớp tìm kiếm, không gây injection.
- Ảnh: lưu trong DB (không ghi file, không có path traversal). Có whitelist MIME, giới hạn kích thước và kiểm tra magic bytes. Ảnh món mở bằng Pillow, có giới hạn số pixel. Khi trả ảnh có `nosniff` và CSP `default-src 'none'`.
- XSS: frontend không có `dangerouslySetInnerHTML`/`innerHTML` hay thư viện markdown; nội dung bài viết render dạng text. Email HTML dùng `html.escape` cho dữ liệu người dùng.
- SSRF: endpoint Web Push bị whitelist theo host, chỉ chấp nhận https và cổng 443. Ảnh trong email chỉ tải từ `frontend_url`/`email_asset_base_url`.
- Trợ lý AI: hội thoại và bộ nhớ lọc theo người dùng; RAG chỉ chứa catalog và tài liệu do admin nạp, không có dữ liệu người khác để prompt injection làm lộ. Có giới hạn theo phút/ngày theo user/IP và ngân sách khách chung mỗi ngày.
- Lỗi: handler trả câu chung kèm `trace_id`, traceback chỉ ghi vào log. Log không chứa token, mật khẩu hay OTP. OTP chỉ trả trong API khi `app_env == "test"`.
- CORS: danh sách origin cụ thể và `allow_credentials`. nginx/Vercel có CSP `script-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`. Không cần sửa `nginx.conf`.

## Thay đổi

- `backend/app/modules/auth/service.py`: thêm `RegistrationRateLimitError`, phát hiện refresh token bị dùng lại kèm khóa dòng, khóa dòng reset token, bỏ thông tin đăng nhập chưa xác minh khi liên kết Google.
- `backend/app/modules/auth/router.py`: thêm `REGISTRATIONS_PER_IP` cho `/auth/register`.
- `backend/app/modules/auth/security.py`: `secure_compare` so sánh dạng bytes.
- `backend/app/core/rate_limit.py`: giới hạn số khóa, dọn khóa hết hạn.
- `backend/tests/conftest.py`: reset limiter đăng ký giữa các test.
- `backend/tests/test_security_review_2026_11.py`: 7 test hồi quy.

## Việc cần làm ở tệp ngoài phạm vi

1. `backend/app/core/config.py`: trong `validate_production_secrets`, áp dụng điều kiện chặn secret mặc định cho cả staging:
   ```python
   if self.app_env in {"staging", "production"} and self.jwt_secret.get_secret_value().startswith("development-only"):
       raise ValueError("Staging/production phải cấu hình BEP_VIET_JWT_SECRET riêng.")
   ```
2. `backend/app/core/middleware.py`: chặn body chunked không có `Content-Length`. Cách 1: đếm byte khi đọc `request.stream()` trong một ASGI middleware thuần và trả 413 khi vượt `MAX_BODY_BYTES`. Cách 2: trả 411/413 cho request `POST/PUT/PATCH` có `Transfer-Encoding: chunked` tới `/api/`.
3. Production (Render): xác minh cấu trúc `X-Forwarded-For` thực tế qua Vercel. Nếu hop phải nhất là IP của Vercel, sửa `core/net.py` để lấy hop thứ N tính từ phải, với N là số proxy tin cậy và cấu hình được.
4. Thông báo cho người dùng: ai đăng ký bằng mật khẩu rồi đăng nhập Google lần đầu sẽ mất mật khẩu (phải dùng "Quên mật khẩu" để đặt lại). Cân nhắc gửi email xác minh khi đăng ký để bỏ được bước này.

## Phiên bản thư viện liên quan bảo mật (chỉ ghi nhận)

Backend (`pyproject.toml`): fastapi 0.141.1, PyJWT 2.15.0, pwdlib[argon2] 0.3.1, cryptography 50.0.0, sqlalchemy 2.1.1, psycopg 3.3.6, pydantic-settings 2.15.0, email-validator 2.3.0, httpx 0.28.1, pillow 13.0.0, uvicorn 0.54.0, anthropic 1.15.0, certifi 2026.10.19. Tất cả đều ghim phiên bản cụ thể.
Frontend (`package.json`): react/react-dom 19.3.0, react-router 7.18.4, @tanstack/react-query 5.104.0, zod 4.6.6, react-hook-form 7.89.0; dev: vite 8.3.1. Chưa chạy `pip-audit`/`npm audit` (cần mạng và quyền); nên chạy trong CI.

## Kiểm chứng

- `backend/.venv/Scripts/python -m pytest tests/test_security_review_2026_11.py`: 7/7 đạt.
- Toàn bộ `pytest` backend: 412 test đạt (SQLite trong bộ nhớ, không cần Postgres).
- `ruff check` các tệp đã sửa: đạt. `mypy` (strict) cho `app/core/rate_limit.py` và `app/modules/auth`: không có lỗi.
- Chưa kiểm: `FOR UPDATE` trên PostgreSQL thật, vì SQLite bỏ qua mệnh đề này; cấu trúc `X-Forwarded-For` trên production.
