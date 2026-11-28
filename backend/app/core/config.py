from datetime import datetime
from functools import lru_cache
from typing import Literal

from pydantic import AnyHttpUrl, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="BEP_VIET_",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "Bếp Việt API"
    app_env: Literal["development", "test", "staging", "production"] = "development"
    api_v1_prefix: str = "/api/v1"
    # Bảo trì có kế hoạch: bật cờ này rồi khởi động lại API. Mọi API (trừ kiểm tra trạng thái)
    # trả 503 MAINTENANCE và giao diện hiện màn hình bảo trì cho đến khi tắt.
    maintenance_mode: bool = False
    maintenance_message: str | None = Field(default=None, max_length=300)
    maintenance_ends_at: datetime | None = None
    database_url: str = "postgresql+psycopg://bep_viet:bep_viet_local@localhost:5432/bep_viet"
    # Pool kết nối DB cho một tiến trình uvicorn. Hết kết nối quá pool_timeout → 503 OVERLOADED
    # (không treo request). Neon Free trực tiếp có giới hạn kết nối: giữ tổng pool nhỏ.
    db_pool_size: int = Field(default=5, ge=1, le=50)
    db_max_overflow: int = Field(default=5, ge=0, le=50)
    db_pool_timeout_seconds: float = Field(default=10, ge=1, le=60)
    # Neon/proxy đóng kết nối nhàn rỗi: làm mới trước khi bị cắt.
    db_pool_recycle_seconds: int = Field(default=300, ge=30, le=3600)
    db_connect_timeout_seconds: int = Field(default=15, ge=2, le=60)
    # Chống quá tải: số request API xử lý cùng lúc (0 = tắt). Vượt ngưỡng thì chờ tối đa
    # overload_wait_seconds rồi trả 503 OVERLOADED kèm Retry-After.
    max_concurrent_requests: int = Field(default=64, ge=0, le=2000)
    # Số proxy tin cậy đứng trước API và tự nối IP vào X-Forwarded-For.
    # Docker Compose (nginx) hoặc Render gọi thẳng: 1. Vercel rewrite -> Render: 2.
    trusted_proxy_hops: int = Field(default=1, ge=1, le=5)
    overload_wait_seconds: float = Field(default=2, ge=0, le=10)
    overload_retry_after_seconds: int = Field(default=15, ge=1, le=300)
    cors_origins: list[AnyHttpUrl] = Field(
        default_factory=lambda: [AnyHttpUrl("http://localhost:5173")]
    )
    frontend_url: AnyHttpUrl = AnyHttpUrl("http://localhost:5173")
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    jwt_secret: SecretStr = SecretStr("development-only-secret-change-before-deploying-bep-viet")
    access_token_expire_minutes: int = Field(default=15, ge=5, le=60)
    refresh_token_expire_days: int = Field(default=30, ge=1, le=90)
    password_reset_expire_minutes: int = Field(default=30, ge=10, le=120)
    email_otp_expire_minutes: int = Field(default=5, ge=2, le=15)
    session_expire_hours: int = Field(default=12, ge=1, le=72)
    oauth_state_expire_minutes: int = Field(default=10, ge=5, le=20)
    # Auto prefers a configured Gmail API account; otherwise it uses configured SMTP.
    email_provider: Literal["auto", "smtp", "gmail_api"] = "auto"
    email_smtp_host: str | None = "smtp.gmail.com"
    email_smtp_port: int = Field(default=587, ge=1, le=65535)
    # Địa chỉ email cá nhân không đặt sẵn trong mã: cấu hình qua biến môi trường.
    email_smtp_username: str | None = None
    email_smtp_password: SecretStr | None = None
    email_from_address: str | None = None
    email_from_name: str = "Bếp Việt"
    # Để trống thì dùng email_from_address.
    support_email: str = ""
    email_asset_base_url: str | None = None
    email_use_ssl: bool = False
    email_starttls: bool = True
    email_timeout_seconds: int = Field(default=10, ge=3, le=60)
    email_gmail_client_id: str | None = None
    email_gmail_client_secret: SecretStr | None = None
    email_gmail_refresh_token: SecretStr | None = None
    google_client_id: str | None = None
    google_client_secret: SecretStr | None = None
    google_redirect_uri: AnyHttpUrl = AnyHttpUrl(
        "http://localhost:5173/api/v1/auth/oauth/google/callback"
    )
    facebook_client_id: str | None = None
    facebook_client_secret: SecretStr | None = None
    # Trợ lý Chú Rồng: không có key thì chạy bộ máy gợi ý món nội bộ (miễn phí).
    anthropic_api_key: SecretStr | None = None
    assistant_model: str = "claude-opus-5-5"
    # Gemini (gói miễn phí của Google AI Studio) làm nguồn AI thay thế Claude.
    gemini_api_key: SecretStr | None = None
    # Chat cần phản hồi tức thì: bản lite bắt đầu trả lời sau ~1 giây; bản flash làm dự phòng.
    gemini_model: str = "gemini-flash-lite-latest"
    # Dùng lần lượt khi model chính quá tải (503) hoặc hết hạn mức (429).
    gemini_fallback_models: list[str] = Field(default_factory=lambda: ["gemini-flash-latest"])
    # auto: dùng Claude nếu có key, không thì Gemini, không có key nào thì bộ máy nội bộ.
    assistant_provider: Literal["auto", "claude", "gemini"] = "auto"
    assistant_timeout_seconds: float = Field(default=30, ge=5, le=120)
    # RAG: embedding Gemini cho tìm kiếm ngữ nghĩa; không có key thì chỉ dùng BM25.
    gemini_embedding_model: str = "gemini-embedding-2"
    rag_top_k: int = Field(default=6, ge=1, le=12)
    # AI riêng của Bếp Việt (bepviet_ai): off | shadow (chỉ ghi log dự đoán, vẫn dùng LLM) |
    # auto (in-house cho intent đã qua cổng chấm điểm) | inhouse_only (không dùng LLM).
    ai_mode: Literal["off", "shadow", "auto", "inhouse_only"] = "shadow"
    ai_min_confidence: float = Field(default=0.8, ge=0, le=1)
    ai_min_precision: float = Field(default=0.95, ge=0, le=1)
    # Thông báo đẩy (Web Push) cho chuông hẹn giờ khi vào bếp: khóa riêng VAPID P-256
    # dạng base64url (32 byte). Không cấu hình thì chuông chỉ kêu trong ứng dụng.
    web_push_vapid_private_key: SecretStr | None = None
    web_push_subject: str | None = None
    # Render Free không có cron: GitHub Actions gọi các endpoint /internal/* kèm khóa này
    # (header X-Cron-Secret). Để trống = tắt hẳn các endpoint đó (trả 503).
    cron_secret: SecretStr | None = None

    @field_validator("maintenance_message", "maintenance_ends_at", mode="before")
    @classmethod
    def blank_maintenance_value_is_unset(cls, value: object) -> object:
        # Biến môi trường để trống (như trong .env.example) nghĩa là không đặt, không phải lỗi.
        return None if isinstance(value, str) and not value.strip() else value

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
        if (
            self.app_env in {"staging", "production"}
            and len(self.jwt_secret.get_secret_value()) < 32
        ):
            raise ValueError("BEP_VIET_JWT_SECRET phải dài ít nhất 32 ký tự ngẫu nhiên.")
        # Secret mặc định nằm công khai trong repo: staging cũng phải dùng secret riêng.
        if self.app_env in {
            "staging",
            "production",
        } and self.jwt_secret.get_secret_value().startswith("development-only"):
            raise ValueError("Staging/production phải cấu hình BEP_VIET_JWT_SECRET riêng.")
        smtp_password = (
            self.email_smtp_password.get_secret_value() if self.email_smtp_password else ""
        )
        if smtp_password and not self.email_smtp_username:
            raise ValueError("Cần cấu hình tài khoản SMTP khi đã có mật khẩu SMTP.")
        if self.email_use_ssl and self.email_starttls:
            raise ValueError("Chỉ chọn một trong SMTP SSL hoặc STARTTLS.")
        if self.app_env == "production":
            # Cookie phiên (Secure, SameSite) và CORS kèm credentials chỉ an toàn trên HTTPS.
            # Quên đặt biến môi trường thì từ chối khởi động thay vì chạy với giá trị localhost.
            for url in [self.frontend_url, *self.cors_origins]:
                if url.scheme != "https" or url.host in {"localhost", "127.0.0.1", "0.0.0.0"}:
                    raise ValueError(
                        "Production phải đặt BEP_VIET_FRONTEND_URL và BEP_VIET_CORS_ORIGINS "
                        "là địa chỉ https thật (không dùng localhost)."
                    )
        if not self.support_email.strip() and self.email_from_address:
            self.support_email = self.email_from_address.strip()
        if self.app_env == "production" and not self.support_email.strip():
            raise ValueError("Production phải đặt BEP_VIET_SUPPORT_EMAIL hoặc EMAIL_FROM_ADDRESS.")
        if self.app_env == "production" and not self.email_enabled:
            raise ValueError("Production phải cấu hình SMTP hoặc Gmail API để gửi OTP email.")
        if (
            self.app_env == "production"
            and self.email_delivery_provider == "smtp"
            and self.email_enabled
            and not (self.email_use_ssl or self.email_starttls)
        ):
            raise ValueError("Production phải mã hóa kết nối SMTP bằng SSL hoặc STARTTLS.")
        return self

    @property
    def docs_enabled(self) -> bool:
        # Tài liệu API chỉ mở khi phát triển trên máy; staging/production đều ẩn.
        return self.app_env in {"development", "test"}

    @property
    def secure_cookies(self) -> bool:
        return self.app_env in {"staging", "production"}

    @property
    def email_enabled(self) -> bool:
        if self.email_provider == "auto":
            return self.gmail_api_configured or self.smtp_configured
        if self.email_provider == "gmail_api":
            return self.gmail_api_configured
        return self.smtp_configured

    @property
    def gmail_api_configured(self) -> bool:
        return bool(
            self.email_gmail_client_id
            and self.email_gmail_client_secret
            and self.email_gmail_client_secret.get_secret_value()
            and self.email_gmail_refresh_token
            and self.email_gmail_refresh_token.get_secret_value()
            and self.email_from_address
        )

    @property
    def smtp_configured(self) -> bool:
        password = self.email_smtp_password.get_secret_value() if self.email_smtp_password else ""
        return bool(
            self.email_smtp_host
            and self.email_smtp_username
            and password
            and self.email_from_address
        )

    @property
    def email_delivery_provider(self) -> Literal["smtp", "gmail_api"]:
        if self.email_provider != "auto":
            return self.email_provider
        if self.gmail_api_configured:
            return "gmail_api"
        return "smtp"


@lru_cache
def get_settings() -> Settings:
    return Settings()
