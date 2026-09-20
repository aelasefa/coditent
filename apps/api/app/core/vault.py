import os
import logging
from typing import Any, Dict, Optional
import httpx

logger = logging.getLogger("coditent.vault")

class VaultClient:
    """HashiCorp Vault Secret Manager Client for Coditent."""

    def __init__(self):
        self.vault_addr = os.getenv("VAULT_ADDR", "http://vault:8200").rstrip("/")
        self.vault_token = os.getenv("VAULT_TOKEN", "coditent-vault-token-secret")
        self.mount_point = "secret"
        self.secret_path = "coditent"
        self.enabled = bool(self.vault_addr and self.vault_token)

    def _headers(self) -> Dict[str, str]:
        return {"X-Vault-Token": self.vault_token, "Content-Type": "application/json"}

    def health_check(self) -> bool:
        """Check if HashiCorp Vault is initialized, unsealed, and reachable."""
        if not self.enabled:
            return False
        try:
            with httpx.Client(timeout=3.0) as client:
                resp = client.get(f"{self.vault_addr}/v1/sys/health")
                return resp.status_code in (200, 429, 472, 473)
        except Exception as e:
            logger.debug(f"Vault health check failed: {e}")
            return False

    def write_secrets(self, secrets_dict: Dict[str, Any]) -> bool:
        """Store key-value secrets in Vault KV v2 engine."""
        if not self.enabled:
            return False
        try:
            url = f"{self.vault_addr}/v1/{self.mount_point}/data/{self.secret_path}"
            payload = {"data": secrets_dict}
            with httpx.Client(timeout=5.0) as client:
                resp = client.post(url, headers=self._headers(), json=payload)
                if resp.status_code in (200, 204):
                    logger.info("Successfully wrote secrets to HashiCorp Vault")
                    return True
                logger.warning(f"Vault write returned status {resp.status_code}: {resp.text}")
                return False
        except Exception as e:
            logger.error(f"Error writing secrets to Vault: {e}")
            return False

    def read_secrets(self) -> Optional[Dict[str, Any]]:
        """Retrieve key-value secrets from Vault KV v2 engine."""
        if not self.enabled:
            return None
        try:
            url = f"{self.vault_addr}/v1/{self.mount_point}/data/{self.secret_path}"
            with httpx.Client(timeout=5.0) as client:
                resp = client.get(url, headers=self._headers())
                if resp.status_code == 200:
                    data = resp.json().get("data", {}).get("data", {})
                    return data
                return None
        except Exception as e:
            logger.error(f"Error reading secrets from Vault: {e}")
            return None

    def get_secret(self, key: str, default: Optional[str] = None) -> Optional[str]:
        """Fetch a specific secret key from Vault with fallback to environment variables."""
        secrets = self.read_secrets()
        if secrets and key in secrets:
            return str(secrets[key])
        return os.getenv(key, default)


vault_client = VaultClient()
