from typing import Literal
from urllib.parse import urlsplit

from cryptography.fernet import Fernet
from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: Literal["development", "test", "production"] = "development"
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
    gemini_model: str = Field(default="gemini-3-flash-preview", min_length=3, max_length=100)
    resend_api_key: str | None = None
    resend_from_email: str | None = None
    resend_from_name: str = "CODITENT"
    # Raw recipients, OTPs, and invitation URLs are encrypted before entering
    # the durable email outbox. Keep this independent from JWT/TOTP keys.
    email_outbox_encryption_key: str | None = None
    email_delivery_max_attempts: int = Field(default=5, ge=1, le=10)
    email_delivery_lease_seconds: int = Field(default=60, ge=15, le=300)
    access_token_cookie_name: str = "access_token"
    csrf_cookie_name: str = "coditent_csrf"
    oauth_browser_cookie_name: str = "oauth_browser"
    access_token_cookie_secure: bool = True
    access_token_cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    trusted_device_cookie_name: str = "trusted_device"
    trusted_device_expire_days: int = 30
    # This key is intentionally independent from JWT_SECRET so rotation and
    # compromise of one credential class cannot expose the other. Generate
    # with `Fernet.generate_key()` and keep it in the deployment secret store.
    totp_encryption_key: str | None = None
    # Verification codes have a fixed security lifetime. Literal prevents a
    # stale deployment environment from silently extending it.
    otp_expire_minutes: Literal[5] = 5
    otp_max_attempts: int = 5
    otp_resend_cooldown_seconds: int = 60
    redis_url: str = "redis://localhost:6380/0"
    recommendation_cache_ttl_seconds: int = 900
    # AI admission control is shared through Redis so every API and worker
    # process observes the same limits.  "Units" are a small, deterministic
    # cost assigned by operation rather than provider-specific token counts.
    ai_user_daily_quota_units: int = Field(default=60, ge=1, le=100_000)
    ai_company_daily_quota_units: int = Field(default=500, ge=1, le=1_000_000)
    ai_global_daily_budget_units: int = Field(default=5_000, ge=1, le=10_000_000)
    ai_global_concurrency: int = Field(default=8, ge=1, le=100)
    ai_user_concurrency: int = Field(default=2, ge=1, le=20)
    ai_queue_max_pending: int = Field(default=1_000, ge=1, le=100_000)
    ai_provider_timeout_seconds: float = Field(default=30.0, ge=5.0, le=120.0)
    ai_job_max_attempts: int = Field(default=3, ge=1, le=10)
    ai_job_lease_seconds: int = Field(default=180, ge=30, le=900)
    ai_dispatch_lease_seconds: int = Field(default=60, ge=10, le=300)
    ai_dispatch_interval_seconds: float = Field(default=2.0, ge=0.25, le=30.0)
    # Managed PostgreSQL can need a few seconds for a cold TLS connection.
    # Keep this bounded while avoiding false-unhealthy restarts.
    readiness_check_timeout_seconds: float = Field(default=5.0, ge=0.1, le=10.0)
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
        if self.totp_encryption_key:
            try:
                Fernet(self.totp_encryption_key.encode("ascii"))
            except (ValueError, UnicodeEncodeError) as exc:
                raise ValueError("TOTP_ENCRYPTION_KEY must be a valid Fernet key") from exc
        if self.email_outbox_encryption_key:
            try:
                Fernet(self.email_outbox_encryption_key.encode("ascii"))
            except (ValueError, UnicodeEncodeError) as exc:
                raise ValueError("EMAIL_OUTBOX_ENCRYPTION_KEY must be a valid Fernet key") from exc
        # Runtime persistence is Supabase-only. Disposable local PostgreSQL is
        # allowed explicitly in APP_ENV=test so CI can verify migrations,
        # backup/restore, and PostgreSQL-specific concurrency semantics.
        if self.app_env != "test":
            local_markers = ["@db:", "@localhost", "@127.0.0.1", "coditent:coditent@db"]
            for marker in local_markers:
                if marker in self.database_url:
                    raise ValueError(
                        f"DATABASE_URL contains local marker '{marker}'. Local DB removed — use Supabase."
                    )
        if self.app_env == "production":
            if not self.totp_encryption_key:
                raise ValueError("TOTP_ENCRYPTION_KEY must be configured in production")
            if self.resend_api_key and not self.email_outbox_encryption_key:
                raise ValueError(
                    "EMAIL_OUTBOX_ENCRYPTION_KEY must be configured when email delivery is enabled"
                )
            if urlsplit(self.frontend_url).scheme != "https":
                raise ValueError("FRONTEND_URL must use HTTPS in production")
            if not self.access_token_cookie_secure:
                raise ValueError("ACCESS_TOKEN_COOKIE_SECURE must be true in production")
            configured_redirects = (
                (self.google_client_id, self.google_redirect_uri),
                (self.linkedin_client_id, self.linkedin_redirect_uri),
            )
            if any(
                client_id and urlsplit(uri).scheme != "https"
                for client_id, uri in configured_redirects
            ):
                raise ValueError("OAuth redirect URIs must use HTTPS in production")
            if any(
                urlsplit(origin.strip()).scheme != "https"
                for origin in self.cors_origins.split(",")
                if origin.strip()
            ):
                raise ValueError("Production CORS origins must use HTTPS")
        return self

    @property
    def allowed_cors_origins(self) -> list[str]:
        """Return unique, explicit HTTP(S) origins; wildcards are rejected."""
        candidates = [self.frontend_url, *self.cors_origins.split(",")]
        if self.app_env != "production":
            candidates.extend(
                [
                    "http://localhost:3001",
                    "http://127.0.0.1:3001",
                    "http://localhost:3000",
                    "http://127.0.0.1:3000",
                ]
            )
        origins: list[str] = []
        for candidate in candidates:
            origin = candidate.strip().rstrip("/")
            if not origin or origin == "*":
                continue
            parsed = urlsplit(origin)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.path:
                raise ValueError(f"Invalid CORS origin: {origin}")
            if self.app_env == "production" and parsed.scheme != "https":
                raise ValueError("Production CORS origins must use HTTPS")
            if origin not in origins:
                origins.append(origin)
        return origins

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
