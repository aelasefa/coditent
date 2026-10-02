"""Production configuration must fail closed at the external trust boundary."""

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import Settings


def _settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "APP_ENV": "production",
        "DATABASE_URL": "postgresql+asyncpg://runtime.invalid/app",
        "JWT_SECRET": "a-runtime-generated-signing-key-with-32-bytes",
        "GEMINI_API_KEY": "provider-key-injected-at-runtime",
        "FRONTEND_URL": "https://app.example.invalid",
        "CORS_ORIGINS": "https://app.example.invalid",
        "ACCESS_TOKEN_COOKIE_SECURE": True,
        "GOOGLE_CLIENT_ID": None,
        "GOOGLE_CLIENT_SECRET": None,
        "LINKEDIN_CLIENT_ID": None,
        "LINKEDIN_CLIENT_SECRET": None,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


@pytest.mark.parametrize(
    "override",
    [
        {"FRONTEND_URL": "http://app.example.invalid"},
        {"CORS_ORIGINS": "http://app.example.invalid"},
        {"ACCESS_TOKEN_COOKIE_SECURE": False},
        {
            "GOOGLE_CLIENT_ID": "client-id",
            "GOOGLE_CLIENT_SECRET": "client-secret",
            "GOOGLE_REDIRECT_URI": "http://app.example.invalid/auth/sso/google/callback",
        },
    ],
)
def test_production_rejects_insecure_browser_boundaries(
    override: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        _settings(**override)


def test_production_does_not_add_development_cors_origins() -> None:
    settings = _settings(CORS_ORIGINS="https://admin.example.invalid")

    assert settings.allowed_cors_origins == [
        "https://app.example.invalid",
        "https://admin.example.invalid",
    ]


def test_development_retains_explicit_local_origins() -> None:
    settings = _settings(
        APP_ENV="development",
        FRONTEND_URL="http://localhost:3000",
        CORS_ORIGINS="",
        ACCESS_TOKEN_COOKIE_SECURE=False,
    )

    assert "http://localhost:3000" in settings.allowed_cors_origins
    assert "http://127.0.0.1:3001" in settings.allowed_cors_origins


def test_production_compose_and_ingress_are_private_tls_and_waf_bounded() -> None:
    repo_root = next(
        (
            parent
            for parent in Path(__file__).resolve().parents
            if (parent / "docker-compose.yml").is_file()
        ),
        None,
    )
    if repo_root is None:
        pytest.skip("repository deployment files are not mounted in API container")

    compose = (repo_root / "docker-compose.yml").read_text()
    production = (repo_root / "docker-compose.production.yml").read_text()
    nginx = (
        repo_root / "ansible/roles/nginx/templates/coditent.conf.j2"
    ).read_text()
    waf = (
        repo_root / "ansible/roles/nginx/templates/modsecurity-coditent.conf.j2"
    ).read_text()

    assert '"127.0.0.1:8001:8001"' in compose
    assert '"127.0.0.1:6380:6379"' in compose
    assert '"127.0.0.1:3001:80"' in compose
    assert "APP_ENV: production" in production
    assert 'ACCESS_TOKEN_COOKIE_SECURE: "true"' in production
    assert "return 308 https://$host$request_uri" in nginx
    assert "listen 443 ssl http2" in nginx
    assert "modsecurity on" in nginx
    assert "ctl:requestBodyProcessor=JSON" in waf
    assert "SecRequestBodyLimitAction Reject" in waf
