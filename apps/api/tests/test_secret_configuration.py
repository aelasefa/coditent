"""Regression checks for fail-closed secret configuration."""

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.core.runtime_secrets import RuntimeSecretsClient


def _repository_root() -> Path | None:
    return next(
        (
            parent
            for parent in Path(__file__).resolve().parents
            if (parent / "docker-compose.yml").is_file()
        ),
        None,
    )


def test_runtime_secrets_are_disabled_without_injected_credentials(monkeypatch) -> None:
    for key in (
        "SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
        "SUPABASE_RUNTIME_TOKEN",
    ):
        monkeypatch.delenv(key, raising=False)

    client = RuntimeSecretsClient()
    assert client.enabled is False
    assert client.endpoint == ""
    assert client.access_token == ""


def test_runtime_secrets_require_project_url_publishable_key_and_token(monkeypatch) -> None:
    monkeypatch.delenv("SECRET_SOURCE", raising=False)
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
    monkeypatch.delenv("SUPABASE_RUNTIME_TOKEN", raising=False)
    assert RuntimeSecretsClient().enabled is False

    monkeypatch.setenv("SUPABASE_RUNTIME_TOKEN", "teammate-runtime-token")
    assert RuntimeSecretsClient().enabled is True


@pytest.mark.parametrize(
    "unsafe_key",
    [
        "too-short",
        "change-me-to-a-random-32-char-secret",
        "<GENERATE_A_RANDOM_SECRET_OF_AT_LEAST_32_BYTES>",
    ],
)
def test_runtime_rejects_weak_or_placeholder_signing_keys(
    unsafe_key: str,
) -> None:
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            DATABASE_URL="postgresql+asyncpg://runtime.invalid/app",
            JWT_SECRET=unsafe_key,
            GEMINI_API_KEY="development-adapter-only",
        )


def test_compose_uses_vault_injected_environment() -> None:
    repo_root = _repository_root()
    if repo_root is None:
        pytest.skip("repository-level Compose files are not mounted in API container")

    compose = (repo_root / "docker-compose.yml").read_text()

    assert "image: hashicorp/vault:1.21.4" in compose
    assert "SECRET_SOURCE: environment" in compose
    assert 'RUNTIME_SECRETS_REQUIRED: "false"' in compose
    assert "JWT_SECRET: ${JWT_SECRET:-}" in compose
    assert "vault_data:/vault/file" in compose


def test_launcher_injected_secrets_are_loaded_without_hosted_broker(monkeypatch) -> None:
    monkeypatch.setenv("SECRET_SOURCE", "environment")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://runtime.invalid/app")
    monkeypatch.setenv("JWT_SECRET", "a" * 48)
    monkeypatch.setenv("GEMINI_API_KEY", "injected-provider-key")
    monkeypatch.setenv("SUPABASE_RUNTIME_TOKEN", "stale-broker-token")
    assert RuntimeSecretsClient().enabled is False
    settings = Settings(_env_file=None)
    assert settings.secret_key == "a" * 48
    assert settings.gemini_api_key == "injected-provider-key"
