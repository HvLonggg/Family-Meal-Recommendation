import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


def validate_password_strength(value: str) -> str:
    if len(value) < 8:
        raise ValueError("Mật khẩu phải có ít nhất 8 ký tự.")
    if not any(character.isalpha() for character in value):
        raise ValueError("Mật khẩu phải có ít nhất một chữ cái.")
    if not any(character.isdigit() for character in value):
        raise ValueError("Mật khẩu phải có ít nhất một chữ số.")
    return value


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

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


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().casefold()


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


class PhoneOtpRequest(BaseModel):
    phone: str = Field(min_length=9, max_length=20)

    @field_validator("phone")
    @classmethod
    def clean_phone(cls, value: str) -> str:
        return re.sub(r"[\s.()-]", "", value)


class PhoneOtpVerifyRequest(BaseModel):
    challenge_id: UUID
    code: str = Field(pattern=r"^\d{6}$")


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str | None
    phone_e164: str | None
    full_name: str
    role: str
    created_at: datetime


class AuthSessionResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class MessageResponse(BaseModel):
    message: str


class ForgotPasswordResponse(MessageResponse):
    development_reset_token: str | None = None


class PhoneOtpResponse(BaseModel):
    challenge_id: UUID
    expires_in: int
    message: str
    development_code: str | None = None


class ProviderAvailabilityResponse(BaseModel):
    google: bool
    facebook: bool
    phone: bool
