#!/usr/bin/env python3
# Login, optionally seed one KV-v2 object, export every entry safely, and revoke the short-lived token.
import argparse
import base64
import json
import os
import re
import shlex
import sys
import time
import urllib.error
import urllib.request
import urllib.parse


def main():
    parser = argparse.ArgumentParser(description="Load the project KV bundle without printing raw values")
    parser.add_argument("--seed", metavar="JSON_FILE")
    parser.add_argument("--production", action="store_true")
    args = parser.parse_args()
    if args.seed and args.production:
        raise ValueError("Production deployment uses a read-only member; seed separately with admin")
    address = os.environ["VAULT_ADDR"].rstrip("/")
    if not address.startswith(("http://", "https://")):
        raise ValueError("VAULT_ADDR must use http:// or https://")
    token = None

    def request(path, data=None):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["X-Vault-Token"] = token
        body = None if data is None else json.dumps(data).encode()
        req = urllib.request.Request(address + "/v1/" + path, body, headers)
        with urllib.request.urlopen(req, timeout=10) as response:
            payload = response.read()
            return json.loads(payload) if payload else {}

    def validate(data):
        if not isinstance(data, dict) or not data:
            raise ValueError("KV bundle must be a nonempty object")
        for key, value in data.items():
            if (not re.fullmatch(r"[A-Z_][A-Z0-9_]*", key)
                    or re.match(r"(VAULT_|COMPOSE_|DOCKER_|BASH|LD_|PYTHON)", key)
                    or key in {"PATH", "IFS", "ENV", "SHELLOPTS", "HOME", "TOKEN", "SECRET_SOURCE", "RUNTIME_SECRETS_REQUIRED", "SUPABASE_RUNTIME_TOKEN", "SUPABASE_RUNTIME_SECRETS_URL"}
                    or not isinstance(value, str) or "\0" in value):
                raise ValueError("Bundle contains an unsafe variable name or non-string/NUL value")

    for attempt in range(30):
        try:
            status = request("sys/seal-status")
            break
        except (OSError, urllib.error.URLError):
            if attempt == 29:
                raise RuntimeError("Vault is unreachable; check VAULT_ADDR / SSH tunnel") from None
            time.sleep(1)
    if not status["initialized"] or status["sealed"]:
        raise RuntimeError("Vault needs initialization/unsealing on EC2: bash vault/init.sh")
    try:
        auth = request("auth/approle/login", {
            "role_id": os.environ["VAULT_ROLE_ID"],
            "secret_id": os.environ["VAULT_SECRET_ID"],
        })["auth"]
        token = auth["client_token"]
        if args.production and (
            "member" not in auth.get("policies", [])
            or set(auth.get("policies", [])) - {"member", "default"}
        ):
            raise ValueError("EC2 .env must use the read-only member AppRole")
        if args.seed:
            with open(args.seed) as source:
                data = json.load(source)
            validate(data)
            request("secret/data/ft_transcendence", {"data": data})
        data = request("secret/data/ft_transcendence")["data"]["data"]
        validate(data)
        if not all(data.get(key) for key in ("DATABASE_URL", "JWT_SECRET", "GEMINI_API_KEY")):
            raise ValueError("Bundle requires DATABASE_URL, JWT_SECRET and GEMINI_API_KEY")
        if args.production:
            origins = [data.get("FRONTEND_URL", ""), *data.get("CORS_ORIGINS", "").split(",")]
            for origin in origins:
                parsed = urllib.parse.urlsplit(origin.strip())
                if parsed.scheme != "https" or not parsed.netloc or parsed.path or "*" in origin:
                    raise ValueError("Production KV bundle requires explicit HTTPS FRONTEND_URL and CORS_ORIGINS")
            for key in ("TOTP_ENCRYPTION_KEY", "EMAIL_OUTBOX_ENCRYPTION_KEY"):
                if key == "EMAIL_OUTBOX_ENCRYPTION_KEY" and not data.get("RESEND_API_KEY"):
                    continue
                try:
                    valid = len(base64.b64decode(data.get(key, ""), altchars=b"-_", validate=True)) == 32
                except (ValueError, TypeError):
                    valid = False
                if not valid:
                    raise ValueError(f"Production KV bundle requires a valid {key}")
    finally:
        if token:
            request("auth/token/revoke-self", {})
    for key, value in data.items():
        print("export " + key + "=" + shlex.quote(value))


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as error:
        path = urllib.parse.urlsplit(error.url).path
        if error.code == 404 and path == "/v1/secret/data/ft_transcendence":
            sys.exit(
                "Vault login succeeded, but secret/ft_transcendence is missing. "
                "Use admin credentials in .env and seed it first: "
                "bash scripts/run_project.sh --seed /path/to/your/secrets.json -d"
            )
        sys.exit(f"Vault HTTP {error.code} at {path}: check credentials, policy and mount configuration")
    except Exception as error:
        sys.exit(f"Vault startup failed: {error}")
