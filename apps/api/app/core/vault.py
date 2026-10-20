"""HashiCorp Vault KV v2 client for CODITENT.

All application secrets are stored in Vault at ``secret/data/coditent``.
The client is intentionally fail-open: if Vault is unreachable the caller
falls back to the process environment so local development and CI work
without a running Vault server.

Usage
-----
from app.core.vault import vault_client

# Returns the secret from Vault, or falls back to os.environ, or ``default``.
value = vault_client.get_secret("SOME_KEY", default="fallback")

# Eagerly preloads all secrets once and caches them for the process lifetime.
# Called automatically by config.py at import time.
vault_client.preload()
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger("coditent.vault")

_VAULT_HTTP_TIMEOUT = 5.0  # seconds


class VaultClient:
    """HashiCorp Vault KV v2 secret client.

    Secrets are read **once** at startup via :meth:`preload` and cached
    in-process.  Individual :meth:`get_secret` calls therefore have zero
    network overhead after the initial load.
    """

    def __init__(self) -> None:
        self.vault_addr: str = os.getenv("VAULT_ADDR", "").strip().rstrip("/")
        self.vault_token: str = os.getenv("VAULT_TOKEN", "").strip()
        self.mount_point: str = "secret"
        self.secret_path: str = "coditent"
        self.enabled: bool = bool(self.vault_addr and self.vault_token)
        # Populated on first preload(); None means "not yet loaded".
        self._cache: dict[str, Any] | None = None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _headers(self) -> dict[str, str]:
        return {
            "X-Vault-Token": self.vault_token,
            "Content-Type": "application/json",
        }

    def _kv_url(self) -> str:
        return f"{self.vault_addr}/v1/{self.mount_point}/data/{self.secret_path}"

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def health_check(self) -> bool:
        """Return True if Vault is initialized, unsealed, and reachable."""
        if not self.enabled:
            return False
        try:
            with httpx.Client(timeout=_VAULT_HTTP_TIMEOUT) as client:
                resp = client.get(f"{self.vault_addr}/v1/sys/health")
                # 200 = active, 429 = standby, 472 = DR sec, 473 = perf sec
                return resp.status_code in {200, 429, 472, 473}
        except Exception as exc:
            logger.debug(
                "Vault health check failed",
                extra={"exception_type": type(exc).__name__},
            )
            return False

    def preload(self) -> None:
        """Eagerly fetch and cache all secrets from Vault.

        Safe to call multiple times — subsequent calls are no-ops once the
        cache is populated.  Call this at application startup so that every
        ``get_secret`` call later is purely in-memory.
        """
        if self._cache is not None:
            return  # already loaded

        if not self.enabled:
            logger.info(
                "vault_disabled: VAULT_ADDR/VAULT_TOKEN not set — "
                "falling back to environment variables"
            )
            self._cache = {}
            return

        try:
            with httpx.Client(timeout=_VAULT_HTTP_TIMEOUT) as client:
                resp = client.get(self._kv_url(), headers=self._headers())
            if resp.status_code == 200:
                data: dict[str, Any] = (
                    resp.json().get("data", {}).get("data", {})
                )
                self._cache = {k: str(v) for k, v in data.items()}
                logger.info(
                    "vault_secrets_loaded",
                    extra={"count": len(self._cache)},
                )
            else:
                logger.error(
                    "vault_read_failed",
                    extra={"status": resp.status_code},
                )
                self._cache = {}
        except Exception as exc:
            logger.error(
                "vault_unreachable",
                extra={"exception_type": type(exc).__name__},
            )
            self._cache = {}

    def read_secrets(self) -> dict[str, Any]:
        """Return the cached secret dictionary, triggering a load if needed."""
        if self._cache is None:
            self.preload()
        return self._cache or {}

    def get_secret(self, key: str, default: str | None = None) -> str | None:
        """Return *key* from Vault cache, then env, then *default*.

        Priority order:
        1. Vault KV store (preloaded cache)
        2. Process environment variable
        3. *default* argument
        """
        secrets = self.read_secrets()
        if key in secrets:
            return secrets[key]
        env_val = os.getenv(key)
        if env_val is not None:
            return env_val
        return default

    def write_secrets(self, data: dict[str, Any]) -> bool:
        """Write (or overwrite) secrets in Vault KV v2.

        Returns True on success, False on failure.  Intended for the
        ``scripts/vault_init_secrets.py`` setup helper — not called at
        runtime by the application itself.
        """
        if not self.enabled:
            logger.error("vault_write_failed: Vault is not enabled")
            return False
        try:
            url = f"{self.vault_addr}/v1/{self.mount_point}/data/{self.secret_path}"
            with httpx.Client(timeout=_VAULT_HTTP_TIMEOUT) as client:
                resp = client.post(
                    url,
                    headers=self._headers(),
                    json={"data": data},
                )
            if resp.status_code in {200, 204}:
                # Invalidate cache so the next read picks up fresh data.
                self._cache = None
                logger.info("vault_secrets_written", extra={"count": len(data)})
                return True
            logger.error(
                "vault_write_failed",
                extra={"status": resp.status_code, "body": resp.text[:200]},
            )
            return False
        except Exception as exc:
            logger.error(
                "vault_write_exception",
                extra={"exception_type": type(exc).__name__},
            )
            return False


# Module-level singleton — imported everywhere via ``from app.core.vault import vault_client``
vault_client = VaultClient()
