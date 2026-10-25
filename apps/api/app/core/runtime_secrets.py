"""Fetch the app's startup secret bundle from the Supabase Edge Function.

The bundle lives in Supabase Vault. This client authenticates to a small Edge
Function with a per-teammate bearer token, then caches the returned values for
the lifetime of this process. The token is a read-only credential for this
single application bundle; it is not a Supabase service key.
"""

from __future__ import annotations

import hashlib
import logging
import os
from typing import Any

import httpx

logger = logging.getLogger("coditent.runtime_secrets")
_HTTP_TIMEOUT = 10.0


class RuntimeSecretsClient:
    def __init__(self) -> None:
        project_url = (
            os.getenv("SUPABASE_URL", "")
            or os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
        ).strip().rstrip("/")
        self.endpoint = os.getenv("SUPABASE_RUNTIME_SECRETS_URL", "").strip().rstrip("/")
        if not self.endpoint and project_url:
            self.endpoint = f"{project_url}/functions/v1/coditent-runtime-secrets"
        self.publishable_key = (
            os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
            or os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
        ).strip()
        self.access_token = os.getenv("SUPABASE_RUNTIME_TOKEN", "").strip()
        self.required = os.getenv("RUNTIME_SECRETS_REQUIRED", "false").lower() in {
            "1", "true", "yes",
        }
        self.enabled = (
            os.getenv("SECRET_SOURCE") != "environment"
            and bool(self.endpoint and self.publishable_key and self.access_token)
        )
        self._cache: dict[str, Any] | None = None

    def _headers(self) -> dict[str, str]:
        return {
            "apikey": self.publishable_key,
            "Authorization": f"Bearer {self.access_token}",
            "x-coditent-runtime-token": self.access_token,
            "Content-Type": "application/json",
        }

    def health_check(self) -> bool:
        """Check that Supabase accepts this teammate's secret-read token."""
        try:
            with httpx.Client(timeout=_HTTP_TIMEOUT) as client:
                response = client.post(self.endpoint, headers=self._headers(), json={})
            if response.status_code != 200:
                logger.warning(
                    "runtime_secrets_health_failed",
                    extra={"status": response.status_code},
                )
                return False
            payload = response.json()
            secrets = payload.get("secrets") if isinstance(payload, dict) else None
            return isinstance(secrets, dict) and bool(secrets)
        except Exception as exc:
            logger.debug(
                "runtime_secrets_health_failed",
                extra={"exception_type": type(exc).__name__},
            )
            return False

    def preload(self) -> None:
        """Fetch and cache secrets. Safe to call more than once."""
        if self._cache is not None:
            return
        if not self.enabled:
            if self.required:
                raise RuntimeError(
                    "Supabase runtime secrets are required: set the project URL, "
                    "publishable key, and SUPABASE_RUNTIME_TOKEN"
                )
            logger.info("runtime_secrets_disabled")
            self._cache = {}
            return

        try:
            with httpx.Client(timeout=_HTTP_TIMEOUT) as client:
                response = client.post(self.endpoint, headers=self._headers(), json={})
            if response.status_code != 200:
                logger.error(
                    "runtime_secrets_read_failed",
                    extra={"status": response.status_code},
                )
                if self.required:
                    raise RuntimeError(
                        f"Supabase runtime secret read failed (HTTP {response.status_code})"
                    )
                self._cache = {}
                return

            payload = response.json()
            data = payload.get("secrets") if isinstance(payload, dict) else None
            if not isinstance(data, dict):
                raise RuntimeError("Supabase runtime secret response had an invalid shape")
            self._cache = {str(key): str(value) for key, value in data.items()}
            logger.info("runtime_secrets_loaded", extra={"count": len(self._cache)})
        except Exception as exc:
            logger.error(
                "runtime_secrets_unavailable",
                extra={"exception_type": type(exc).__name__},
            )
            if self.required:
                if isinstance(exc, RuntimeError):
                    raise
                raise RuntimeError("Supabase runtime secrets are required but unavailable") from exc
            self._cache = {}

    def read_secrets(self) -> dict[str, Any]:
        if self._cache is None:
            self.preload()
        return self._cache or {}

    def get_secret(self, key: str, default: str | None = None) -> str | None:
        return self.read_secrets().get(key, default)

    def credential_fingerprint(self) -> str:
        """Return a non-secret identifier useful for safe diagnostics."""
        if not self.access_token:
            return ""
        return hashlib.sha256(self.access_token.encode()).hexdigest()[:12]


runtime_secrets_client = RuntimeSecretsClient()
