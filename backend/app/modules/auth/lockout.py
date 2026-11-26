"""Khóa tạm đăng nhập khi nhập sai mật khẩu nhiều lần; trang quản trị có thể mở khóa sớm."""

from app.core.rate_limit import SlidingWindowLimiter

LOGIN_FAILURES_PER_EMAIL = SlidingWindowLimiter(limit=5, window_seconds=15 * 60)
LOGIN_FAILURES_PER_IP = SlidingWindowLimiter(limit=20, window_seconds=15 * 60)


def login_email_key(email: str) -> str:
    return email.strip().casefold()


def is_login_locked(email: str | None) -> bool:
    return bool(email) and LOGIN_FAILURES_PER_EMAIL.blocked(login_email_key(email or ""))


def unlock_login(email: str) -> None:
    """Xóa bộ đếm sai mật khẩu của email để người dùng đăng nhập lại ngay."""
    LOGIN_FAILURES_PER_EMAIL.reset(login_email_key(email))


def locked_login_count() -> int:
    """Số email đang bị khóa đăng nhập tạm thời (chỉ trong tiến trình hiện tại)."""
    return LOGIN_FAILURES_PER_EMAIL.blocked_count()
