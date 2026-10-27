#!/usr/bin/env bash
# Start the monitoring stack only after loading its administrator credential from Vault.
set -euo pipefail
set +x

cd "$(dirname "$0")/.."
source scripts/vault-env.sh
vault_load_env

grafana_password=${GF_SECURITY_ADMIN_PASSWORD:-}
if (( ${#grafana_password} < 16 )); then
  echo "GF_SECURITY_ADMIN_PASSWORD must contain at least 16 characters." >&2
  exit 1
fi

if (( $# == 0 )); then
  set -- up -d
fi

docker compose -f monitoring/compose.yml "$@"
