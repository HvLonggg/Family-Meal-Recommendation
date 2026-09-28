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
    phone_otp_expire_minutes: int = Field(default=5, ge=2, le=15)
    oauth_state_expire_minutes: int = Field(default=10, ge=5, le=20)
    google_client_id: str | None = None
    google_client_secret: SecretStr | None = None
    google_redirect_uri: AnyHttpUrl = AnyHttpUrl(
        "http://localhost:5173/api/v1/auth/oauth/google/callback"
    )
    facebook_client_id: str | None = None
    facebook_client_secret: SecretStr | None = None

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
        if self.app_env == "production" and self.jwt_secret.get_secret_value().startswith(
            "development-only"
        ):
            raise ValueError("Production phải cấu hình BEP_VIET_JWT_SECRET riêng.")
        return self

    @property
    def docs_enabled(self) -> bool:
        return self.app_env != "production"

    @property
    def secure_cookies(self) -> bool:
        return self.app_env in {"staging", "production"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
