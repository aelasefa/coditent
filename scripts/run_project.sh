#!/usr/bin/env bash
set -euo pipefail

# Read VAULT_ADDR, VAULT_ROLE_ID, and VAULT_SECRET_ID from environment or .env without printing values
vault_addr="${VAULT_ADDR:-}"
vault_role_id="${VAULT_ROLE_ID:-}"
vault_secret_id="${VAULT_SECRET_ID:-}"

get_env_val() {
  local key="$1"
  if [[ -f .env ]]; then
    python3 -c "
import os
val = ''
if os.path.exists('.env'):
    with open('.env') as f:
        for line in f:
            line = line.strip()
            if line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            if k.strip() == '$key':
                val = v.strip().strip('\"\'')
print(val, end='')
" 2>/dev/null || true
  fi
}

if [[ -z "$vault_addr" ]]; then
  vault_addr="$(get_env_val VAULT_ADDR)"
fi
if [[ -z "$vault_role_id" ]]; then
  vault_role_id="$(get_env_val VAULT_ROLE_ID)"
fi
if [[ -z "$vault_secret_id" ]]; then
  vault_secret_id="$(get_env_val VAULT_SECRET_ID)"
fi

# Detect shared vs local Vault mode
# If VAULT_ADDR is set and does NOT contain "vault:8200" or "127.0.0.1", treat as shared Vault
if [[ -n "$vault_addr" ]] && [[ "$vault_addr" != *"vault:8200"* ]] && [[ "$vault_addr" != *"127.0.0.1"* ]]; then
  echo "Using shared Vault at $vault_addr..."

  # Check reachability and status with /v1/sys/health
  # Vault sys/health HTTP codes:
  # 200: initialized, unsealed, and active
  # 429: unsealed and standby
  # 472: disaster recovery mode replication secondary and active
  # 473: performance standby
  # 503: sealed
  # 501: not initialized
  http_code="$(curl --connect-timeout 5 --max-time 10 -s -o /dev/null -w "%{http_code}" "$vault_addr/v1/sys/health" 2>/dev/null || echo "000")"

  case "$http_code" in
    200|429|472|473)
      echo "Shared Vault is healthy and unsealed."
      ;;
    503)
      echo "ERROR: Shared Vault at $vault_addr is sealed (HTTP 503)." >&2
      echo "Please contact the Vault administrator to unseal the server." >&2
      exit 1
      ;;
    *)
      echo "ERROR: Shared Vault at $vault_addr is unreachable or returned HTTP status $http_code." >&2
      echo "Please verify your network/VPN/Tailscale connection and contact the Vault administrator." >&2
      exit 1
      ;;
  esac

  if [[ -z "$vault_role_id" || -z "$vault_secret_id" ]]; then
    echo "ERROR: VAULT_ROLE_ID and VAULT_SECRET_ID must be set and non-empty in .env." >&2
    echo "Please obtain your AppRole credentials from the Vault administrator." >&2
    exit 1
  fi

  echo "Starting application containers..."
  docker compose up --build -d
  exit 0
fi

# ── Local Vault Flow ────────────────────────────────────────────────────────
compose=(docker compose --profile local-vault)
"${compose[@]}" up -d vault

container_id="$("${compose[@]}" ps -q vault)"
if [[ -z "$container_id" ]]; then
  echo "Vault container did not start." >&2
  exit 1
fi

echo "Waiting for Vault to be initialized and unsealed..."
for _ in $(seq 1 30); do
  state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
  if [[ "$state" == "healthy" ]]; then
    break
  fi
  if [[ "$state" == "unhealthy" ]]; then
    break
  fi
  sleep 2
done

if [[ "$state" != "healthy" ]]; then
  vault_status="$("${compose[@]}" exec -T vault vault status 2>/dev/null || true)"
  if printf '%s\n' "$vault_status" | grep -Eq '^Initialized[[:space:]]+true'; then
    echo "Vault is initialized but not ready, likely because it is sealed. Do not initialize it again." >&2
    echo "Unseal it by running this command with each required, distinct unseal key:" >&2
    echo "  docker compose --profile local-vault exec -it vault vault operator unseal" >&2
  else
    echo "Vault is running but not ready. Initialize it only if it has never been initialized:" >&2
    echo "  docker compose --profile local-vault exec -it vault vault operator init" >&2
    echo "Then unseal it using the required distinct unseal keys:" >&2
    echo "  docker compose --profile local-vault exec -it vault vault operator unseal" >&2
  fi
  echo "After Vault is healthy, configure its AppRole and secrets, then run this script again." >&2
  exit 1
fi

if ! "${compose[@]}" config --format json | python3 -c '
import json
import sys

try:
    environment = json.load(sys.stdin)["services"]["api"].get("environment", {})
except (KeyError, TypeError, json.JSONDecodeError):
    raise SystemExit(1)

required = ("VAULT_ROLE_ID", "VAULT_SECRET_ID")
raise SystemExit(0 if all(str(environment.get(name) or "").strip() for name in required) else 1)
'; then
  echo "Set VAULT_ROLE_ID and VAULT_SECRET_ID after creating the coditent-app AppRole." >&2
  exit 1
fi

VAULT_ADDR=http://vault:8200 "${compose[@]}" up --build -d
