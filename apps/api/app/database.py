from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


def _normalize_database_url(url: str) -> str:
    """Normalize DATABASE_URL for Supabase.

    - Ensures asyncpg driver prefix (postgresql+asyncpg://)
    - Supabase requires SSL; asyncpg handles it via query params or connect_args.
    - Rejects local DB fallback to enforce Supabase-only architecture.
    """
    if not url:
        raise ValueError("DATABASE_URL is not set")
    # Enforce Supabase-only: reject local fallbacks
    local_markers = ["@db:", "@localhost", "@127.0.0.1", "coditent:coditent@db"]
    for marker in local_markers:
        if marker in url:
            raise ValueError(
                f"Local DATABASE_URL detected ({marker}). "
                "Local PostgreSQL has been removed. Use Supabase PostgreSQL: "
                "postgresql+asyncpg://postgres.<project_ref>:<password>@<host>:5432/postgres "
                "or pooler: postgresql+asyncpg://postgres.<project_ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres"
            )
    # Auto-upgrade to asyncpg driver if user supplied plain postgresql:// (common from Supabase dashboard)
    if url.startswith("postgresql://") and not url.startswith("postgresql+asyncpg://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


_normalized_url = _normalize_database_url(settings.database_url)

# Supabase pooler requires disabling prepared statements for PgBouncer compatibility
# (both 5432 session and 6543 transaction). Without this, asyncpg raises
# "cannot perform operation: another operation is in progress" under concurrent load.
engine = create_async_engine(
    _normalized_url,
    future=True,
    connect_args={"statement_cache_size": 0, "prepared_statement_cache_size": 0},
    pool_pre_ping=True,
)
AsyncSessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
