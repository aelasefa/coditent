#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${VAULT_ADDR:-}" && -n "${TAILSCALE_IP:-}" ]]; then
  VAULT_ADDR="http://${TAILSCALE_IP}:8200"
fi
VAULT_ADDR="${VAULT_ADDR:-http://127.0.0.1:8200}"
export VAULT_ADDR

if [[ -z "${VAULT_TOKEN:-}" ]]; then
  echo "ERROR: VAULT_TOKEN environment variable is required to bootstrap Vault." >&2
  echo "Export the administrator token in your shell, then run this script." >&2
  exit 1
fi

echo "Verifying Vault connectivity at $VAULT_ADDR..." >&2
http_code="$(curl --connect-timeout 5 --max-time 10 -s -o /dev/null -w "%{http_code}" "$VAULT_ADDR/v1/sys/health" 2>/dev/null || echo "000")"
if [[ ! "$http_code" =~ ^(200|429|472|473)$ ]]; then
  echo "ERROR: Vault is not healthy at $VAULT_ADDR (HTTP $http_code)." >&2
  echo "Make sure Vault is initialized and unsealed first." >&2
  exit 1
fi

# Pass the token to curl through its config input, not its command-line arguments.
vault_api() {
  local method="$1"
  local endpoint="$2"
  shift 2
  curl --silent --show-error --fail \
    --config <(printf '%s' "$VAULT_TOKEN" | python3 -c 'import json,sys; print("header = " + json.dumps("X-Vault-Token: " + sys.stdin.read()))') \
    -X "$method" "$@" "$VAULT_ADDR/v1/$endpoint"
}

echo "1. Checking/enabling KV v2 secrets engine at secret/..." >&2
mounts="$(vault_api GET "sys/mounts")"
has_secret="$(printf '%s' "$mounts" | python3 -c 'import json,sys; print("yes" if "secret/" in json.load(sys.stdin) else "no")')"
if [[ "$has_secret" != "yes" ]]; then
  echo "Enabling KV v2 at secret/..." >&2
  vault_api POST "sys/mounts/secret" \
    -H "Content-Type: application/json" \
    -d '{"type":"kv","options":{"version":"2"}}' >/dev/null
fi

echo "2. Writing coditent-app read-only policy..." >&2
policy_payload="$(python3 -c 'import json; print(json.dumps({"policy": "path \"secret/data/ft_transcendence\" {\n  capabilities = [\"read\"]\n}\n"}))')"
vault_api PUT "sys/policies/acl/coditent-app" \
  -H "Content-Type: application/json" \
  -d "$policy_payload" >/dev/null

echo "3. Checking/enabling AppRole auth..." >&2
auth_mounts="$(vault_api GET "sys/auth")"
has_approle="$(printf '%s' "$auth_mounts" | python3 -c 'import json,sys; print("yes" if "approle/" in json.load(sys.stdin) else "no")')"
if [[ "$has_approle" != "yes" ]]; then
  vault_api POST "sys/auth/approle" \
    -H "Content-Type: application/json" \
    -d '{"type":"approle"}' >/dev/null
fi

echo "4. Configuring coditent-app AppRole..." >&2
vault_api POST "auth/approle/role/coditent-app" \
  -H "Content-Type: application/json" \
  -d '{"token_policies":["coditent-app"],"token_ttl":"1h","token_max_ttl":"4h","secret_id_ttl":"0","secret_id_num_uses":"0"}' >/dev/null

role_id_response="$(vault_api GET "auth/approle/role/coditent-app/role-id")"
role_id="$(printf '%s' "$role_id_response" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("data",{}).get("role_id", ""))')"
if [[ -z "$role_id" ]]; then
  echo "ERROR: Vault did not return a role ID." >&2
  exit 1
fi

# This is the only credential the bootstrap script prints.
printf '%s\n' "$role_id"
