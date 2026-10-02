from typing import Literal
from urllib.parse import urlsplit

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Supabase PostgreSQL is the sole persistent database.
    # Example direct:  postgresql+asyncpg://postgres.<ref>:<password>@db.<ref>.supabase.co:5432/postgres
    # Example pooled:  postgresql+asyncpg://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true
    # Dashboard copy is postgresql:// — auto-upgraded to postgresql+asyncpg:// by database.py
    database_url: str
    db_pool_size: int = Field(default=4, ge=1, le=20)
    db_max_overflow: int = Field(default=1, ge=0, le=20)
    db_pool_timeout_seconds: int = Field(default=15, ge=1, le=120)
    db_pool_recycle_seconds: int = Field(default=300, ge=30, le=3600)
    supabase_url: str | None = None
    supabase_service_key: str | None = None
    frontend_url: str = "http://localhost:3000"
    cors_origins: str = ""
    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str = "http://localhost:8001/auth/sso/google/callback"
    linkedin_client_id: str | None = None
    linkedin_client_secret: str | None = None
    linkedin_redirect_uri: str = "http://localhost:8001/auth/sso/linkedin/callback"
    secret_key: str = Field(
        min_length=32,
        validation_alias=AliasChoices("JWT_SECRET", "SECRET_KEY"),
    )
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    gemini_api_key: str
    resend_api_key: str | None = None
    resend_from_email: str | None = None
    resend_from_name: str = "CODITENT"
    access_token_cookie_name: str = "access_token"
    access_token_cookie_secure: bool = True
    access_token_cookie_samesite: str = "lax"
    trusted_device_cookie_name: str = "trusted_device"
    trusted_device_expire_days: int = 30
    # Verification codes have a fixed security lifetime. Literal prevents a
    # stale deployment environment from silently extending it.
    otp_expire_minutes: Literal[5] = 5
    otp_max_attempts: int = 5
    otp_resend_cooldown_seconds: int = 60
    redis_url: str = "redis://localhost:6380/0"
    recommendation_cache_ttl_seconds: int = 900
    readiness_check_timeout_seconds: float = Field(default=2.0, ge=0.1, le=10.0)
    worker_heartbeat_ttl_seconds: int = Field(default=30, ge=5, le=300)
    log_level: str = "INFO"

    @model_validator(mode="after")
    def validate_oauth_config(self) -> "Settings":
        normalized_signing_key = self.secret_key.strip().lower()
        if (
            normalized_signing_key.startswith("<")
            or "change-me" in normalized_signing_key
            or "replace-me" in normalized_signing_key
            or "your_" in normalized_signing_key
        ):
            raise ValueError("JWT_SECRET must be a generated runtime secret, not a placeholder")
        if (self.google_client_id and not self.google_client_secret) or (
            self.google_client_secret and not self.google_client_id
        ):
            raise ValueError("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both be set")
        if (self.linkedin_client_id and not self.linkedin_client_secret) or (
            self.linkedin_client_secret and not self.linkedin_client_id
        ):
            raise ValueError("LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET must both be set")
        # Enforce Supabase-only DB: reject local DATABASE_URL early with clear error
        local_markers = ["@db:", "@localhost", "@127.0.0.1", "coditent:coditent@db"]
        for marker in local_markers:
            if marker in self.database_url:
                raise ValueError(
                    f"DATABASE_URL contains local marker '{marker}'. Local DB removed — use Supabase."
                )
        return self

    @property
    def allowed_cors_origins(self) -> list[str]:
        """Return unique, explicit HTTP(S) origins; wildcards are rejected."""
        candidates = [
            self.frontend_url,
            "http://localhost:3001",
            "http://127.0.0.1:3001",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            *self.cors_origins.split(","),
        ]
        origins: list[str] = []
        for candidate in candidates:
            origin = candidate.strip().rstrip("/")
            if not origin or origin == "*":
                continue
            parsed = urlsplit(origin)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.path:
                raise ValueError(f"Invalid CORS origin: {origin}")
            if origin not in origins:
                origins.append(origin)
        return origins

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
