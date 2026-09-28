# ADR 0002 Xác thực và phân quyền theo vai trò

Status: Accepted  
Date: 27/09/2026  
Owner: Technical Lead

## Context

MVP cần đăng ký, đăng nhập, quên mật khẩu, số điện thoại, Google, Facebook và tách quyền quản trị khỏi người dùng. Các trang public vẫn truy cập không cần tài khoản.

## Decision

- Mật khẩu được băm bằng Argon2, không lưu hoặc ghi log mật khẩu thô.
- Access token JWT sống ngắn; refresh token ngẫu nhiên chỉ nằm trong cookie HttpOnly, được lưu dạng SHA-256 và xoay vòng mỗi lần làm mới.
- Vai trò MVP gồm `admin` và `user`; backend luôn là nơi quyết định quyền cuối cùng.
- Đăng ký công khai chỉ tạo `user`. Tài khoản `admin` chỉ được tạo bằng lệnh vận hành nội bộ.
- OTP số điện thoại dùng challenge có hạn, giới hạn số lần thử. Mã thử nghiệm chỉ trả về ở môi trường development; production phải tích hợp cổng SMS.
- Google dùng OpenID Connect Authorization Code Flow, kiểm tra `state` bằng cookie HttpOnly trước khi đổi code và tự tạo/liên kết tài khoản theo email đã xác minh. Facebook dùng OAuth 2.0 và chỉ kích hoạt callback khi có thông tin ứng dụng Meta.
- Luồng quên mật khẩu luôn trả cùng một thông điệp để tránh dò email tồn tại.

## Alternatives considered

- Lưu JWT dài hạn trong localStorage.
- Cho phép frontend tự quyết định quyền admin.
- Tự mô phỏng Google/Facebook khi chưa có thông tin nhà cung cấp.
- Dùng dịch vụ auth managed ngay từ đầu.

## Consequences

- Email/mật khẩu và OTP development có thể kiểm thử ngay.
- Google đã có đầy đủ luồng ứng dụng nhưng cần OAuth Client của chủ dự án để bật. Facebook, SMS và email reset production cần credential/dịch vụ gửi thật trước khi phát hành.
- Mọi module nghiệp vụ bảo vệ phải dùng dependency `get_current_user` hoặc `require_admin`.

## Security impact

Refresh token có thể thu hồi theo phiên. Việc đổi mật khẩu thu hồi toàn bộ phiên đang hoạt động. Cookie production bắt buộc `Secure` và `SameSite=Lax`; hệ thống production phải chạy HTTPS.

## Migration impact

Migration `0002_authentication` tạo `users`, `auth_identities`, `refresh_sessions`, `password_reset_tokens` và `phone_otp_challenges`.

## Rollback plan

Tắt router auth và quay migration về `0001_bootstrap` chỉ khi chưa có dữ liệu người dùng cần giữ. Khi đã có dữ liệu production, phải lập migration bảo toàn dữ liệu riêng.
