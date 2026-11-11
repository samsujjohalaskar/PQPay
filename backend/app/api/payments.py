
import secrets
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.models import Merchant, Payment, PaymentRequest, User
from app.schemas import (
    PaymentCreate,
    PaymentResponse,
    PaymentRequestCreate,
    PaymentRequestCreated,
    PaymentRequestDetails,
    PublicMerchantDetails,
    StaticPaymentRequestCreate,
)
from app.security_protocol.protocol import run_protocol

router = APIRouter(prefix="/payments", tags=["Payments"])


# =========================================================
# EXISTING LEGACY PAYMENT ENDPOINT
# =========================================================

@router.post(
    "/",
    response_model=PaymentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_payment(
    payment_data: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start_time = time.perf_counter()

    merchant = (
        db.query(Merchant)
        .filter(
            Merchant.id == payment_data.merchant_id,
            Merchant.owner_id == current_user.id,
            Merchant.is_active.is_(True),
        )
        .first()
    )

    if merchant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active merchant not found.",
        )

    protocol_result = run_protocol()

    if not protocol_result["authenticated"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="PQPay security protocol authentication failed.",
        )

    payment = Payment(
        payment_reference="pay_" + secrets.token_hex(12),
        merchant_id=merchant.id,
        amount_paise=payment_data.amount_paise,
        currency=payment_data.currency,
        status="success",
        security_time_ms=protocol_result["security_time_ms"],
    )

    db.add(payment)
    db.flush()

    payment.completed_at = datetime.now(timezone.utc)
    payment.processing_time_ms = (
        time.perf_counter() - start_time
    ) * 1000

    db.commit()
    db.refresh(payment)

    return payment


# =========================================================
# 1. MERCHANT CREATES A PAYMENT REQUEST
# POST /payments/requests
# =========================================================

@router.post(
    "/requests",
    response_model=PaymentRequestCreated,
    status_code=status.HTTP_201_CREATED,
)
def create_payment_request(
    request_data: PaymentRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    merchant = (
        db.query(Merchant)
        .filter(
            Merchant.id == request_data.merchant_id,
            Merchant.owner_id == current_user.id,
            Merchant.is_active.is_(True),
        )
        .first()
    )

    if merchant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active merchant not found.",
        )

    now = datetime.now(timezone.utc)

    payment_request = PaymentRequest(
        merchant_id=merchant.id,
        request_token=secrets.token_urlsafe(32),
        amount_paise=request_data.amount_paise,
        currency=request_data.currency,
        status="pending",
        expires_at=now + timedelta(minutes=10),
    )

    db.add(payment_request)
    db.commit()
    db.refresh(payment_request)

    return payment_request


# =========================================================
# 2. CUSTOMER RETRIEVES PAYMENT REQUEST DETAILS
# GET /payments/requests/{request_token}
# =========================================================

@router.get(
    "/requests/{request_token}",
    response_model=PaymentRequestDetails,
)
def get_payment_request(
    request_token: str,
    db: Session = Depends(get_db),
):
    result = (
        db.query(PaymentRequest, Merchant)
        .join(
            Merchant,
            PaymentRequest.merchant_id == Merchant.id,
        )
        .filter(
            PaymentRequest.request_token == request_token,
        )
        .first()
    )

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment request not found.",
        )

    payment_request, merchant = result

    current_status = payment_request.status

    if (
        current_status == "pending"
        and payment_request.expires_at <= datetime.now(timezone.utc)
    ):
        current_status = "expired"

    return PaymentRequestDetails(
        request_token=payment_request.request_token,
        merchant_name=merchant.business_name,
        amount_paise=payment_request.amount_paise,
        currency=payment_request.currency,
        status=current_status,
        expires_at=payment_request.expires_at,
    )


# =========================================================
# 3. AUTHENTICATED CUSTOMER CONFIRMS PAYMENT
# POST /payments/requests/{request_token}/confirm
# =========================================================

@router.post(
    "/requests/{request_token}/confirm",
    response_model=PaymentResponse,
    status_code=status.HTTP_201_CREATED,
)
def confirm_payment_request(
    request_token: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start_time = time.perf_counter()

    # Lock the request row to prevent simultaneous confirmations.
    payment_request = (
        db.query(PaymentRequest)
        .filter(
            PaymentRequest.request_token == request_token,
        )
        .with_for_update()
        .first()
    )

    if payment_request is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment request not found.",
        )

    if payment_request.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This payment request is no longer available.",
        )

    now = datetime.now(timezone.utc)

    if payment_request.expires_at <= now:
        payment_request.status = "expired"
        db.commit()

        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Payment request has expired.",
        )

    merchant = (
        db.query(Merchant)
        .filter(
            Merchant.id == payment_request.merchant_id,
            Merchant.is_active.is_(True),
        )
        .first()
    )

    if merchant is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Merchant is currently unavailable.",
        )

    # Execute the experimental security protocol.
    protocol_result = run_protocol()

    if not protocol_result["authenticated"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="PQPay security protocol authentication failed.",
        )

    # The amount and merchant are taken from the database,
    # never from customer-supplied confirmation data.
    payment = Payment(
        payment_reference="pay_" + secrets.token_hex(12),
        merchant_id=merchant.id,
        customer_id=current_user.id,
        payment_request_id=payment_request.id,
        amount_paise=payment_request.amount_paise,
        currency=payment_request.currency,
        status="success",
        security_time_ms=protocol_result["security_time_ms"],
    )

    payment_request.status = "paid"
    payment_request.paid_at = now

    db.add(payment)

    try:
        db.flush()

        payment.completed_at = datetime.now(timezone.utc)
        payment.processing_time_ms = (
            time.perf_counter() - start_time
        ) * 1000

        db.commit()
        db.refresh(payment)

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This payment request has already been processed.",
        )

    return payment


# =========================================================
# STATIC QR PAYMENT FLOW
# =========================================================

# 1. Customer scans static QR and retrieves merchant details.
# GET /payments/static/{merchant_code}

@router.get(
    "/static/{merchant_code}",
    response_model=PublicMerchantDetails,
)
def get_static_qr_merchant(
    merchant_code: str,
    db: Session = Depends(get_db),
):
    merchant = (
        db.query(Merchant)
        .filter(
            Merchant.merchant_code == merchant_code,
            Merchant.is_active.is_(True),
        )
        .first()
    )

    if merchant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Merchant not found or inactive.",
        )

    return PublicMerchantDetails(
        business_name=merchant.business_name,
        merchant_code=merchant.merchant_code,
    )


# 2. Customer enters amount and confirms payment.
# POST /payments/static/{merchant_code}/pay

@router.post(
    "/static/{merchant_code}/pay",
    response_model=PaymentResponse,
    status_code=status.HTTP_201_CREATED,
)
def make_static_qr_payment(
    merchant_code: str,
    payment_data: StaticPaymentRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start_time = time.perf_counter()

    merchant = (
        db.query(Merchant)
        .filter(
            Merchant.merchant_code == merchant_code,
            Merchant.is_active.is_(True),
        )
        .first()
    )

    if merchant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Merchant not found or inactive.",
        )

    # Execute the experimental security protocol.
    protocol_result = run_protocol()

    if not protocol_result["authenticated"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="PQPay security protocol authentication failed.",
        )

    # Record the simulated payment.
    payment = Payment(
        payment_reference="pay_" + secrets.token_hex(12),
        merchant_id=merchant.id,
        customer_id=current_user.id,
        amount_paise=payment_data.amount_paise,
        currency=payment_data.currency,
        status="success",
        security_time_ms=protocol_result["security_time_ms"],
    )

    db.add(payment)

    try:
        db.flush()

        payment.completed_at = datetime.now(timezone.utc)
        payment.processing_time_ms = (
            time.perf_counter() - start_time
        ) * 1000

        db.commit()
        db.refresh(payment)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Payment could not be recorded.",
        )

    return payment


# =========================================================
# 4. TRANSACTION HISTORY
# Merchant sees received payments.
# Customer sees payments made.
# GET /payments/
# =========================================================

@router.get(
    "/",
    response_model=list[PaymentResponse],
)
def get_payments(
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payments = (
        db.query(Payment)
        .join(
            Merchant,
            Payment.merchant_id == Merchant.id,
        )
        .filter(
            or_(
                Merchant.owner_id == current_user.id,
                Payment.customer_id == current_user.id,
            )
        )
        .order_by(Payment.created_at.desc())
        .limit(limit)
        .all()
    )

    return payments
