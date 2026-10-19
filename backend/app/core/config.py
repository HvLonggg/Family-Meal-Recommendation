from functools import lru_cache
from typing import Literal

from pydantic import AnyHttpUrl, Field, SecretStr, model_validator
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
    database_url: str = "postgresql+psycopg://bep_viet:bep_viet_local@localhost:5432/bep_viet"
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
    # "gmail_api" sends through Gmail's HTTPS API for hosts that block outbound SMTP ports.
    email_provider: Literal["smtp", "gmail_api"] = "smtp"
    email_smtp_host: str | None = "smtp.gmail.com"
    email_smtp_port: int = Field(default=587, ge=1, le=65535)
    email_smtp_username: str | None = "hvlongg@gmail.com"
    email_smtp_password: SecretStr | None = None
    email_from_address: str | None = "hvlongg@gmail.com"
    email_from_name: str = "Bếp Việt"
    support_email: str = "hvlongg@gmail.com"
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
    assistant_timeout_seconds: float = Field(default=30, ge=5, le=120)

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
        if self.app_env == "production" and self.jwt_secret.get_secret_value().startswith(
            "development-only"
        ):
            raise ValueError("Production phải cấu hình BEP_VIET_JWT_SECRET riêng.")
        smtp_password = (
            self.email_smtp_password.get_secret_value() if self.email_smtp_password else ""
        )
        if smtp_password and not self.email_smtp_username:
            raise ValueError("Cần cấu hình tài khoản SMTP khi đã có mật khẩu SMTP.")
        if self.email_use_ssl and self.email_starttls:
            raise ValueError("Chỉ chọn một trong SMTP SSL hoặc STARTTLS.")
        if self.app_env == "production" and not self.email_enabled:
            raise ValueError("Production phải cấu hình SMTP hoặc Gmail API để gửi OTP email.")
        if (
            self.app_env == "production"
            and self.email_provider == "smtp"
            and not (self.email_use_ssl or self.email_starttls)
        ):
            raise ValueError("Production phải mã hóa kết nối SMTP bằng SSL hoặc STARTTLS.")
        return self

    @property
    def docs_enabled(self) -> bool:
        return self.app_env != "production"

    @property
    def secure_cookies(self) -> bool:
        return self.app_env in {"staging", "production"}

    @property
    def email_enabled(self) -> bool:
        if self.email_provider == "gmail_api":
            return bool(
                self.email_gmail_client_id
                and self.email_gmail_client_secret
                and self.email_gmail_client_secret.get_secret_value()
                and self.email_gmail_refresh_token
                and self.email_gmail_refresh_token.get_secret_value()
                and self.email_from_address
            )
        password = (
            self.email_smtp_password.get_secret_value() if self.email_smtp_password else ""
        )
        return bool(
            self.email_smtp_host
            and self.email_smtp_username
            and password
            and self.email_from_address
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
