#!/usr/bin/env bash
set -euo pipefail

KEY_FILE="/root/.vault-unseal-keys"
VAULT_ADDR="${VAULT_ADDR:-}"
if [[ -z "$VAULT_ADDR" && -n "${TAILSCALE_IP:-}" ]]; then
  VAULT_ADDR="http://${TAILSCALE_IP}:8200"
fi
VAULT_ADDR="${VAULT_ADDR:-http://127.0.0.1:8200}"
export VAULT_ADDR

# Verify key file existence and strict permissions
if [[ ! -f "$KEY_FILE" ]]; then
  echo "ERROR: Unseal key file $KEY_FILE does not exist." >&2
  exit 1
fi

# Check file permissions (must be 600 or 400, owned by root)
file_perms="$(stat -c "%a" "$KEY_FILE" 2>/dev/null || stat -f "%Lp" "$KEY_FILE" 2>/dev/null || true)"
file_owner="$(stat -c "%u" "$KEY_FILE" 2>/dev/null || stat -f "%u" "$KEY_FILE" 2>/dev/null || true)"

if [[ "$file_owner" != "0" ]]; then
  echo "ERROR: Unseal key file $KEY_FILE must be owned by root (uid 0)." >&2
  exit 1
fi

if [[ "$file_perms" != "600" && "$file_perms" != "400" ]]; then
  echo "ERROR: Unseal key file $KEY_FILE permissions must be 600 or 400 (current: $file_perms)." >&2
  exit 1
fi

echo "Waiting for Vault at $VAULT_ADDR to respond..."
max_retries=30
vault_ready=false

for i in $(seq 1 "$max_retries"); do
  http_code="$(curl --connect-timeout 5 --max-time 10 -s -o /dev/null -w "%{http_code}" "$VAULT_ADDR/v1/sys/health" 2>/dev/null || echo "000")"
  # Any recognized Vault status code: 200 (healthy), 429, 472, 473, 503 (sealed), 501 (uninitialized)
  if [[ "$http_code" =~ ^(200|429|472|473|501|503)$ ]]; then
    vault_ready=true
    break
  fi
  sleep 2
done

if [[ "$vault_ready" != "true" ]]; then
  echo "ERROR: Vault at $VAULT_ADDR failed to respond after $((max_retries * 2)) seconds." >&2
  exit 1
fi

# Check status via curl to avoid dependency on host vault binary if absent
health_json="$(curl --connect-timeout 5 --max-time 10 -s "$VAULT_ADDR/v1/sys/health" 2>/dev/null || true)"
is_sealed="$(printf '%s' "$health_json" | python3 -c 'import json,sys; data=json.load(sys.stdin); print("true" if data.get("sealed") is True else "false")' 2>/dev/null || echo "unknown")"

if [[ "$is_sealed" == "false" ]]; then
  echo "Vault is already unsealed and active."
  exit 0
fi

echo "Vault is sealed. Reading unseal keys and unsealing..."

# Read keys from file into array without printing them
mapfile -t keys < <(grep -v '^[[:space:]]*#' "$KEY_FILE" | grep -v '^[[:space:]]*$')

if [[ "${#keys[@]}" -lt 3 ]]; then
  echo "ERROR: Key file $KEY_FILE has fewer than 3 keys (found ${#keys[@]})." >&2
  exit 1
fi

# Apply the first 3 keys using Vault CLI inside the container or on host
for key_index in 0 1 2; do
  current_key="${keys[$key_index]}"
  # Attempt via docker compose exec if container is running, or host vault binary, or direct API
  response="$(printf '%s' "$current_key" | python3 -c 'import json,sys; print(json.dumps({"key":sys.stdin.read()}))' | curl --connect-timeout 5 --max-time 10 -s -X POST --data-binary @- "$VAULT_ADDR/v1/sys/unseal" 2>/dev/null || true)"
  unsealed="$(printf '%s' "$response" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("true" if d.get("sealed") is False else "false")' 2>/dev/null || echo "false")"

  if [[ "$unsealed" == "true" ]]; then
    echo "Vault unsealed successfully."
    exit 0
  fi
done

# Final health verification
final_code="$(curl --connect-timeout 5 --max-time 10 -s -o /dev/null -w "%{http_code}" "$VAULT_ADDR/v1/sys/health" 2>/dev/null || echo "000")"
if [[ "$final_code" =~ ^(200|429|472|473)$ ]]; then
  echo "Vault successfully unsealed and active."
  exit 0
else
  echo "ERROR: Vault unseal failed. Final health status code: $final_code" >&2
  exit 1
fi
