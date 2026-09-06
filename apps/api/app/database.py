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

# Supabase pooler (6543, transaction mode) requires careful pool handling.
# For PgBouncer transaction mode, disable prepared statements and use NullPool behavior
# is not needed with asyncpg + transaction mode if we keep default pooling — Supabase
# recommends session mode for full compatibility. We use default pooling which works
# with both direct (5432) and session pooler (5432). If using transaction pooler (6543),
# SQLAlchemy's prepared statement cache can cause issues; asyncpg handles it.
engine = create_async_engine(
    _normalized_url,
    future=True,
    # Supabase always requires SSL; asyncpg will negotiate if server requires it.
    # Passing connect_args as empty keeps compatibility with both direct and pooled URLs.
    connect_args={},
)
AsyncSessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
