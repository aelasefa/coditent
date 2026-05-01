from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    supabase_url: str | None = None
    supabase_service_key: str | None = None
    frontend_url: str = "http://localhost:3000"
    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str = "http://localhost:8001/auth/sso/google/callback"
    linkedin_client_id: str | None = None
    linkedin_client_secret: str | None = None
    secret_key: str = Field(validation_alias=AliasChoices("JWT_SECRET", "SECRET_KEY"))
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    gemini_api_key: str
    resend_api_key: str | None = None
    resend_from_email: str | None = None
    access_token_cookie_name: str = "access_token"
    access_token_cookie_secure: bool = True
    access_token_cookie_samesite: str = "lax"
    redis_url: str = "redis://localhost:6379/0"
    recommendation_cache_ttl_seconds: int = 900
    log_level: str = "INFO"

    @model_validator(mode="after")
    def require_google_oauth(self) -> "Settings":
        if not self.google_client_id or not self.google_client_secret:
            raise ValueError("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required")
        return self

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
