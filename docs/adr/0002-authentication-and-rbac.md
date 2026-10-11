# ADR 0002 Xác thực và phân quyền theo vai trò

Status: Accepted (updated for direct registration and email recovery on 07/10/2026)
Date: 27/09/2026  
Owner: Technical Lead

## Context

MVP cần đăng ký, đăng nhập, khôi phục mật khẩu bằng email, Google, Facebook và tách quyền quản trị khỏi người dùng. Các trang public vẫn truy cập không cần tài khoản.

## Decision

- Mật khẩu được băm bằng Argon2, không lưu hoặc ghi log mật khẩu thô.
- Access token JWT sống ngắn; refresh token ngẫu nhiên chỉ nằm trong cookie HttpOnly, được lưu dạng SHA-256 và xoay vòng mỗi lần làm mới.
- Vai trò MVP gồm `admin` và `user`; backend luôn là nơi quyết định quyền cuối cùng.
- Đăng ký công khai chỉ tạo `user`. Tài khoản `admin` chỉ được tạo bằng lệnh vận hành nội bộ.
- Đăng ký kiểm tra định dạng và tính duy nhất của email, tạo tài khoản ngay, không yêu cầu OTP, sau đó xếp email chào mừng vào outbox. Vì không có bước xác nhận hộp thư, `email_verified_at` vẫn để trống.
- OTP email 5 chữ số chỉ dùng cho khôi phục mật khẩu; challenge dùng một lần, hết hạn sau 5 phút, tối đa 3 lần thử, có giới hạn gửi lại theo email/IP. Mã chỉ được trả về trong môi trường test; các môi trường khác cần SMTP hoạt động.
- Google dùng OpenID Connect Authorization Code Flow, kiểm tra `state` bằng cookie HttpOnly trước khi đổi code và tự tạo/liên kết tài khoản theo email đã xác minh. Facebook dùng OAuth 2.0 và chỉ kích hoạt callback khi có thông tin ứng dụng Meta.
- Luồng quên mật khẩu báo rõ khi email chưa có tài khoản theo yêu cầu sản phẩm; challenge cho email lạ vẫn được tạo rồi vô hiệu hóa để áp dụng giới hạn tần suất.

## Alternatives considered

- Lưu JWT dài hạn trong localStorage.
- Cho phép frontend tự quyết định quyền admin.
- Tự mô phỏng Google/Facebook khi chưa có thông tin nhà cung cấp.
- Dùng dịch vụ auth managed ngay từ đầu.

## Consequences

- Đăng ký email/mật khẩu không cần OTP. Khôi phục mật khẩu và thông báo bảo mật dùng Gmail SMTP; lỗi gửi OTP sẽ làm vô hiệu challenge, còn email thông báo được giữ trong outbox để thử lại.
- Đăng ký trực tiếp không chứng minh quyền sở hữu hộp thư. Việc báo email chưa có tài khoản ở luồng khôi phục có thể tiết lộ trạng thái tài khoản và được giữ lại theo yêu cầu sản phẩm.
- Google đã có đầy đủ luồng ứng dụng nhưng cần OAuth Client của chủ dự án để bật. Facebook cần credential của Meta trước khi bật callback.
- Mọi module nghiệp vụ bảo vệ phải dùng dependency `get_current_user` hoặc `require_admin`.

## Security impact

Refresh token có thể thu hồi theo phiên. Việc đổi mật khẩu thu hồi toàn bộ phiên đang hoạt động. Cookie production bắt buộc `Secure` và `SameSite=Lax`; hệ thống production phải chạy HTTPS.

## Migration impact

Migration `0002_authentication` tạo các bảng tài khoản và challenge SMS cũ. Migration `0008_email_otp` chuyển xác thực sang email, tạo bảng challenge mới và xóa bảng challenge SMS đã ngừng sử dụng; thông tin tài khoản người dùng hiện có được giữ nguyên.

## Rollback plan

Tắt router auth và quay migration về `0001_bootstrap` chỉ khi chưa có dữ liệu người dùng cần giữ. Khi đã có dữ liệu production, phải lập migration bảo toàn dữ liệu riêng.
