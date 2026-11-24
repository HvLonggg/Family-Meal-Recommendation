from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.legal import CURRENT_TERMS_VERSION
from app.modules.account.preferences import PreferencesResponse, read_preferences, to_response


def validate_password_strength(value: str) -> str:
    if len(value) < 8:
        raise ValueError("Mật khẩu phải có ít nhất 8 ký tự.")
    if not any(character.isalpha() for character in value):
        raise ValueError("Mật khẩu phải có ít nhất một chữ cái.")
    if not any(character.isdigit() for character in value):
        raise ValueError("Mật khẩu phải có ít nhất một chữ số.")
    return value


def require_current_terms_version(value: str) -> str:
    if value != CURRENT_TERMS_VERSION:
        raise ValueError("Bạn cần đồng ý phiên bản Điều khoản hiện hành để tiếp tục.")
    return value


class AcceptTermsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: str = Field(min_length=1, max_length=16)

    @field_validator("version")
    @classmethod
    def check_version(cls, value: str) -> str:
        return require_current_terms_version(value)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    remember_me: bool = False

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().casefold()


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    # Phiên bản Điều khoản/Chính sách người dùng đã tick đồng ý trên form đăng ký.
    accepted_terms_version: str = Field(min_length=1, max_length=16)

    @field_validator("accepted_terms_version")
    @classmethod
    def check_terms_version(cls, value: str) -> str:
        return require_current_terms_version(value)

    @field_validator("full_name")
    @classmethod
    def clean_full_name(cls, value: str) -> str:
        return " ".join(value.strip().split())

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().casefold()

    @field_validator("password")
    @classmethod
    def check_password(cls, value: str) -> str:
        return validate_password_strength(value)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().casefold()


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=32, max_length=256)
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def check_password(cls, value: str) -> str:
        return validate_password_strength(value)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def check_password(cls, value: str) -> str:
        return validate_password_strength(value)


class ChangeEmailRequest(BaseModel):
    new_email: EmailStr
    # Bắt buộc với tài khoản có mật khẩu; tài khoản chỉ dùng mạng xã hội để trống.
    current_password: str | None = Field(default=None, max_length=128)

    @field_validator("new_email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().casefold()


class EmailOtpVerifyRequest(BaseModel):
    challenge_id: UUID
    code: str = Field(pattern=r"^\d{5}$")


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str | None
    phone_e164: str | None
    full_name: str
    role: str
    created_at: datetime
    avatar_url: str | None = None
    terms_version: str | None = None
    terms_accepted_at: datetime | None = None
    preferences: PreferencesResponse = Field(default_factory=PreferencesResponse)

    @field_validator("preferences", mode="before")
    @classmethod
    def normalize_preferences(cls, value: Any) -> Any:
        if isinstance(value, dict) or value is None:
            return to_response(read_preferences(value))
        return value


class AuthSessionResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class MessageResponse(BaseModel):
    message: str


class ForgotPasswordResponse(MessageResponse):
    challenge_id: UUID
    expires_in: int
    development_code: str | None = None


class ResetTokenResponse(BaseModel):
    reset_token: str
    expires_in: int
    message: str


class ProviderAvailabilityResponse(BaseModel):
    google: bool
    facebook: bool
    email: bool
