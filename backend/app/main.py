from fastapi import FastAPI, HTTPException
from sqlalchemy.exc import SQLAlchemyError

from app.api.users import router as users_router
from app.core.config import settings
from app.db.session import check_database_connection
from app.api.merchants import router as merchants_router
from app.api.payments import router as payments_router
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title=settings.app_name,
    description=settings.app_description,
    version=settings.app_version,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in settings.frontend_origins.split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users_router)
app.include_router(merchants_router)
app.include_router(payments_router)

@app.get("/")
def root():
    return {
        "name": settings.app_name,
        "message": "Payment gateway API is running",
        "version": settings.app_version,
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "pqpay-backend",
        "environment": settings.environment,
    }


@app.get("/health/db")
def database_health_check():
    try:
        check_database_connection()
        return {
            "status": "healthy",
            "database": "connected",
        }
    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "unhealthy",
                "database": "unavailable",
            },
        )
