"""Regression checks for fail-closed secret configuration."""

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.core.vault import VaultClient


def _repository_root() -> Path | None:
    return next(
        (
            parent
            for parent in Path(__file__).resolve().parents
            if (parent / "docker-compose.yml").is_file()
        ),
        None,
    )


def test_vault_is_disabled_without_injected_credentials(monkeypatch) -> None:
    monkeypatch.delenv("VAULT_ADDR", raising=False)
    monkeypatch.delenv("VAULT_TOKEN", raising=False)

    client = VaultClient()

    assert client.enabled is False
    assert client.vault_addr == ""
    assert client.vault_token == ""


def test_vault_requires_both_address_and_token(monkeypatch) -> None:
    monkeypatch.setenv("VAULT_ADDR", "https://vault.example.invalid")
    monkeypatch.delenv("VAULT_TOKEN", raising=False)
    assert VaultClient().enabled is False

    monkeypatch.delenv("VAULT_ADDR", raising=False)
    monkeypatch.setenv("VAULT_TOKEN", "injected-at-runtime")
    assert VaultClient().enabled is False


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


def test_compose_has_no_default_vault_root_credential() -> None:
    repo_root = _repository_root()
    if repo_root is None:
        pytest.skip("repository-level Compose files are not mounted in API container")

    compose = (repo_root / "docker-compose.yml").read_text()
    development_override = (
        repo_root / "docker-compose.dev-vault.yml"
    ).read_text()

    assert "VAULT_DEV_ROOT_TOKEN_ID" not in compose
    assert "profiles: [\"dev-vault\"]" in development_override
    assert "VAULT_DEV_ROOT_TOKEN_ID:?" in development_override
    assert '"127.0.0.1:8200:8200"' in development_override
    assert "coditent-vault-token-secret" not in compose
    assert "coditent-vault-token-secret" not in development_override
