
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# -------------------------
# User schemas
# -------------------------

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=150)


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# -------------------------
# Merchant schemas
# -------------------------

class MerchantCreate(BaseModel):
    business_name: str = Field(min_length=2, max_length=150)


class MerchantResponse(BaseModel):
    id: int
    business_name: str
    merchant_code: str
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# -------------------------
# Existing payment schemas
# -------------------------

class PaymentCreate(BaseModel):
    merchant_id: int = Field(gt=0)
    amount_paise: int = Field(gt=0)
    currency: str = Field(
        default="INR",
        min_length=3,
        max_length=3,
        pattern=r"^[A-Z]{3}$",
    )


class PaymentResponse(BaseModel):
    id: int
    payment_reference: str
    merchant_id: int
    customer_id: int | None
    payment_request_id: int | None
    amount_paise: int
    currency: str
    status: str
    processing_time_ms: float | None
    security_time_ms: float | None
    created_at: datetime
    completed_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


# -------------------------
# QR payment-request schemas
# -------------------------

class PaymentRequestCreate(BaseModel):
    merchant_id: int = Field(gt=0)
    amount_paise: int = Field(gt=0)
    currency: str = Field(
        default="INR",
        min_length=3,
        max_length=3,
        pattern=r"^[A-Z]{3}$",
    )


class PaymentRequestCreated(BaseModel):
    id: int
    request_token: str
    amount_paise: int
    currency: str
    status: str
    expires_at: datetime
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaymentRequestDetails(BaseModel):
    request_token: str
    merchant_name: str
    amount_paise: int
    currency: str
    status: str
    expires_at: datetime


# -------------------------
# Static QR payment schemas
# -------------------------

class PublicMerchantDetails(BaseModel):
    business_name: str
    merchant_code: str


class StaticPaymentRequestCreate(BaseModel):
    amount_paise: int = Field(gt=0)

    currency: str = Field(
        default="INR",
        min_length=3,
        max_length=3,
        pattern=r"^[A-Z]{3}$",
    )