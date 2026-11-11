
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.models import Merchant, User
from app.schemas import MerchantCreate, MerchantResponse

router = APIRouter(prefix="/merchants", tags=["Merchants"])


@router.post(
    "/",
    response_model=MerchantResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_merchant(
    merchant_data: MerchantCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    merchant_code = "mrc_" + secrets.token_hex(10)

    merchant = Merchant(
        owner_id=current_user.id,
        business_name=merchant_data.business_name,
        merchant_code=merchant_code,
    )

    db.add(merchant)
    db.commit()
    db.refresh(merchant)

    return merchant


@router.get("/", response_model=list[MerchantResponse])
def list_merchants(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Merchant)
        .filter(Merchant.owner_id == current_user.id)
        .order_by(Merchant.id.desc())
        .all()
    )



@router.get("/{merchant_id}", response_model=MerchantResponse)
def get_merchant(
    merchant_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    merchant = (
        db.query(Merchant)
        .filter(
            Merchant.id == merchant_id,
            Merchant.owner_id == current_user.id,
        )
        .first()
    )

    if merchant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Merchant not found.",
        )

    return merchant
