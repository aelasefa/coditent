#!/usr/bin/env python3
"""Vault Secret Initialisation Script for CODITENT.

This script reads secrets from your local ``.env`` file and writes them
into HashiCorp Vault KV v2 at ``secret/data/coditent``.

Run this **once** during initial setup (or whenever you rotate a secret):

    python scripts/vault_init_secrets.py [--env-file .env] [--dry-run]

Requirements
------------
- Vault must be running and reachable at ``VAULT_ADDR``.
- ``VAULT_TOKEN`` must have write permission on ``secret/data/coditent``.
- Both ``VAULT_ADDR`` and ``VAULT_TOKEN`` must be present in the env file
  (or already in the process environment).
- ``pip install httpx python-dotenv`` (already in requirements.txt).
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

try:
    from dotenv import dotenv_values
except ImportError:
    print("ERROR: python-dotenv is required.  Run: pip install python-dotenv")
    sys.exit(1)

try:
    import httpx
except ImportError:
    print("ERROR: httpx is required.  Run: pip install httpx")
    sys.exit(1)

# ── Keys that are NOT secrets and should remain in .env only ──────────────────
# These configure infrastructure topology, not application secrets.
NON_SECRET_KEYS: set[str] = {
    "VAULT_ADDR",
    "VAULT_TOKEN",
    "REDIS_URL",
    "FRONTEND_URL",
    "NEXT_PUBLIC_API_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_OAUTH_API_URL",
    "BACKEND_PROXY_URL",
    "GOOGLE_REDIRECT_URI",
    "LINKEDIN_REDIRECT_URI",
    "APP_ENV",
    "ACCESS_TOKEN_COOKIE_SECURE",
    "RESEND_FROM_EMAIL",
    "RESEND_FROM_NAME",
    "DB_POOL_SIZE",
    "DB_MAX_OVERFLOW",
    "DB_POOL_TIMEOUT_SECONDS",
    "DB_POOL_RECYCLE_SECONDS",
    "READINESS_CHECK_TIMEOUT_SECONDS",
    "WORKER_HEARTBEAT_TTL_SECONDS",
    "OTP_EXPIRE_MINUTES",
    "OTP_MAX_ATTEMPTS",
    "OTP_RESEND_COOLDOWN_SECONDS",
    "TRUSTED_DEVICE_EXPIRE_DAYS",
    "GEMINI_MODEL",
    "GEMINI_FALLBACK_MODEL",
}

# ── Keys that are definitely secrets and MUST go to Vault ────────────────────
SECRET_KEYS: set[str] = {
    "DATABASE_URL",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_KEY",
    "JWT_SECRET",
    "SECRET_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "LINKEDIN_CLIENT_ID",
    "LINKEDIN_CLIENT_SECRET",
    "RESEND_API_KEY",
    "TOTP_ENCRYPTION_KEY",
    "EMAIL_OUTBOX_ENCRYPTION_KEY",
    "VAULT_DEV_ROOT_TOKEN_ID",
}


def _vault_write(
    vault_addr: str,
    vault_token: str,
    mount: str,
    path: str,
    data: dict[str, str],
    dry_run: bool,
) -> bool:
    url = f"{vault_addr.rstrip('/')}/v1/{mount}/data/{path}"
    payload = {"data": data}

    if dry_run:
        print(f"\n[DRY RUN] Would POST to: {url}")
        print(f"[DRY RUN] Payload keys: {sorted(data.keys())}")
        return True

    headers = {
        "X-Vault-Token": vault_token,
        "Content-Type": "application/json",
    }
    try:
        resp = httpx.post(url, headers=headers, json=payload, timeout=10.0)
        if resp.status_code in {200, 204}:
            print(f"✅  Written {len(data)} secrets to vault: {mount}/data/{path}")
            return True
        print(f"❌  Vault returned HTTP {resp.status_code}: {resp.text[:300]}")
        return False
    except httpx.RequestError as exc:
        print(f"❌  Could not reach Vault at {vault_addr}: {exc}")
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Push .env secrets into Vault KV v2")
    parser.add_argument(
        "--env-file",
        default=".env",
        help="Path to the .env file to read secrets from (default: .env)",
    )
    parser.add_argument(
        "--mount",
        default="secret",
        help="Vault KV v2 mount point (default: secret)",
    )
    parser.add_argument(
        "--path",
        default="coditent",
        help="Secret path inside the mount (default: coditent)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be written without touching Vault",
    )
    args = parser.parse_args()

    env_path = Path(args.env_file)
    if not env_path.exists():
        print(f"ERROR: env file not found: {env_path}")
        sys.exit(1)

    raw: dict[str, str | None] = dotenv_values(env_path)

    vault_addr = raw.get("VAULT_ADDR") or os.getenv("VAULT_ADDR", "")
    vault_token = raw.get("VAULT_TOKEN") or os.getenv("VAULT_TOKEN", "")

    if not vault_addr:
        print("ERROR: VAULT_ADDR is not set in env file or environment.")
        sys.exit(1)
    if not vault_token and not args.dry_run:
        print("ERROR: VAULT_TOKEN is not set in env file or environment.")
        sys.exit(1)

    # Build the secrets payload: include known SECRET_KEYS and anything
    # that isn't in the NON_SECRET_KEYS blocklist.
    secrets: dict[str, str] = {}
    skipped: list[str] = []

    for key, value in raw.items():
        if not value:
            continue  # skip empty values
        if key in NON_SECRET_KEYS:
            skipped.append(key)
            continue
        secrets[key] = value

    print(f"\n📋 Env file: {env_path.resolve()}")
    print(f"🏦 Vault:    {vault_addr}/v1/{args.mount}/data/{args.path}")
    print(f"\n✅  Secrets to upload ({len(secrets)}):")
    for k in sorted(secrets.keys()):
        masked = secrets[k][:4] + "***" if len(secrets[k]) > 4 else "***"
        print(f"   {k:<40} {masked}")
    print(f"\n⏭️  Skipped — stay in .env ({len(skipped)}):")
    for k in sorted(skipped):
        print(f"   {k}")

    if not secrets:
        print("\nNothing to write.")
        return

    success = _vault_write(
        vault_addr=vault_addr,
        vault_token=vault_token,
        mount=args.mount,
        path=args.path,
        data=secrets,
        dry_run=args.dry_run,
    )

    if not success:
        sys.exit(1)

    if not args.dry_run:
        print(
            "\n💡 You can now remove the secrets listed above from your .env file.\n"
            "   Keep only VAULT_ADDR and VAULT_TOKEN (and any non-secret config)."
        )


if __name__ == "__main__":
    main()
