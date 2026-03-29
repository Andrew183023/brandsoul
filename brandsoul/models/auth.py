from typing import Literal

from pydantic import BaseModel, Field


class UserPublic(BaseModel):
    id: int
    name: str
    email: str
    is_active: bool
    created_at: str
    updated_at: str


class TenantPublic(BaseModel):
    id: int
    name: str
    slug: str
    business_model: Literal["product", "service", "hybrid"]
    plan: str
    is_active: bool
    created_at: str
    updated_at: str


class AuthResponse(BaseModel):
    token: str
    user: UserPublic
    tenant: TenantPublic


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: str = Field(..., min_length=5, max_length=160)
    password: str = Field(..., min_length=8, max_length=256)
    tenant_name: str = Field(..., min_length=2, max_length=140)
    business_model: Literal["product", "service", "hybrid"] = "hybrid"


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=160)
    password: str = Field(..., min_length=8, max_length=256)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=160)


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=20, max_length=512)
    new_password: str = Field(..., min_length=8, max_length=256)


class MessageResponse(BaseModel):
    message: str
