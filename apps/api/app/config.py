import secrets

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    supabase_url: str | None = None
    supabase_service_key: str | None = None
    frontend_url: str = "http://localhost:3000"
    google_client_id: str | None = None
    google_client_secret: str | None = None
    linkedin_client_id: str | None = None
    linkedin_client_secret: str | None = None
    # If JWT_SECRET/SECRET_KEY is not provided, generate a strong random key for local dev.
    secret_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("JWT_SECRET", "SECRET_KEY"),
    )
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    admin_email: str | None = None
    admin_password: str | None = None
    admin_full_name: str = "Platform Admin"
    gemini_api_key: str
    resend_api_key: str | None = None
    resend_from_email: str | None = None

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @model_validator(mode="after")
    def ensure_secret_key(self) -> "Settings":
        if not self.secret_key:
            self.secret_key = secrets.token_hex(32)
        return self


settings = Settings()
