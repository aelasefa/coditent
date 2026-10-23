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

if [[ -z "$vault_addr" ]]; then
  echo "ERROR: VAULT_ADDR is not set in environment or .env." >&2
  echo "Please set VAULT_ADDR to the shared Vault URL (e.g. over Tailscale)." >&2
  exit 1
fi

if [[ -z "$vault_role_id" || -z "$vault_secret_id" ]]; then
  echo "ERROR: VAULT_ROLE_ID and VAULT_SECRET_ID must be set in .env." >&2
  echo "Please obtain your AppRole credentials from the Vault administrator." >&2
  exit 1
fi

echo "Connecting to shared Vault at $vault_addr..."

# Check shared Vault reachability and health
http_code="$(curl --connect-timeout 5 --max-time 10 -s -o /dev/null -w "%{http_code}" "$vault_addr/v1/sys/health" 2>/dev/null || echo "000")"

case "$http_code" in
  200|429|472|473)
    echo "Shared Vault is reachable and healthy."
    ;;
  503)
    echo "ERROR: Shared Vault at $vault_addr is sealed (HTTP 503)." >&2
    echo "Please contact the Vault administrator to unseal the server." >&2
    exit 1
    ;;
  *)
    echo "ERROR: Cannot reach shared Vault at $vault_addr (HTTP status $http_code)." >&2
    echo "Ensure your Tailscale/VPN connection is active and contact the Vault administrator." >&2
    exit 1
    ;;
esac

echo "Starting Coditent application containers..."
docker compose up --build -d
