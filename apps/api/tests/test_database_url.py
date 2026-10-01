"""Database URL normalization regression tests."""

import pytest

from app.database import _normalize_database_url


def test_normalizer_preserves_supabase_session_pooler_port():
    url = "postgresql://postgres.project:password@aws-0-eu-west-3.pooler.supabase.com:5432/postgres"

    normalized = _normalize_database_url(url)

    assert normalized.startswith("postgresql+asyncpg://")
    assert ".pooler.supabase.com:5432/postgres" in normalized


def test_normalizer_preserves_supabase_transaction_pooler_port():
    url = "postgresql://postgres.project:password@aws-0-eu-west-3.pooler.supabase.com:6543/postgres"

    normalized = _normalize_database_url(url)

    assert ".pooler.supabase.com:6543/postgres" in normalized


def test_normalizer_rejects_local_database():
    with pytest.raises(ValueError, match="Local DATABASE_URL"):
        _normalize_database_url("postgresql://user:password@localhost:5432/coditent")
