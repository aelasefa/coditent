from supabase import Client, create_client

from app.config import settings


_supabase_client: Client | None = None


def get_supabase_client() -> Client:
    """Return a singleton Supabase admin client configured from environment variables."""
    global _supabase_client

    if _supabase_client is not None:
        return _supabase_client

    if not settings.supabase_url or not settings.supabase_service_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in environment variables."
        )

    _supabase_client = create_client(settings.supabase_url, settings.supabase_service_key)
    return _supabase_client
