from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Supabase PostgreSQL is the sole persistent database.
    # Example direct:  postgresql+asyncpg://postgres.<ref>:<password>@db.<ref>.supabase.co:5432/postgres
    # Example pooled:  postgresql+asyncpg://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true
    # Dashboard copy is postgresql:// — auto-upgraded to postgresql+asyncpg:// by database.py
    database_url: str
    supabase_url: str | None = None
    supabase_service_key: str | None = None
    frontend_url: str = "http://localhost:3000"
    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str = "http://localhost:8001/auth/sso/google/callback"
    linkedin_client_id: str | None = None
    linkedin_client_secret: str | None = None
    linkedin_redirect_uri: str = "http://localhost:8001/auth/sso/linkedin/callback"
    secret_key: str = Field(validation_alias=AliasChoices("JWT_SECRET", "SECRET_KEY"))
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    gemini_api_key: str
    resend_api_key: str | None = None
    resend_from_email: str | None = None
    access_token_cookie_name: str = "access_token"
    access_token_cookie_secure: bool = True
    access_token_cookie_samesite: str = "lax"
    oauth_onboarding_cookie_name: str = "oauth_onboarding"
    oauth_onboarding_expire_minutes: int = 10
    oauth_onboarding_cookie_secure: bool = False
    oauth_onboarding_cookie_samesite: str = "lax"
    redis_url: str = "redis://localhost:6379/0"
    recommendation_cache_ttl_seconds: int = 900
    log_level: str = "INFO"

    @model_validator(mode="after")
    def validate_oauth_config(self) -> "Settings":
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

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
