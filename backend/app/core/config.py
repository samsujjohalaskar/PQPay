
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "PQPay API"
    app_version: str = "0.1.0"
    app_description: str = (
        "Payment gateway prototype with an experimental "
        "post-quantum security layer."
    )
    environment: str = "development"

    frontend_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    database_url: str

    jwt_secret_key: str
    jwt_access_token_expire_minutes: int = 30

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
