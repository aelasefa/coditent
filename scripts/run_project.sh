#!/usr/bin/env bash
set -euo pipefail

compose=(docker compose)
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
    echo "  sudo docker compose exec -it vault vault operator unseal" >&2
  else
    echo "Vault is running but not ready. Initialize it only if it has never been initialized:" >&2
    echo "  sudo docker compose exec -it vault vault operator init" >&2
    echo "Then unseal it using the required distinct unseal keys:" >&2
    echo "  sudo docker compose exec -it vault vault operator unseal" >&2
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

"${compose[@]}" up --build -d
