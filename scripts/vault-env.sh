#!/usr/bin/env bash
# Shared bootstrap for local startup and the existing immutable-image production deployment.
vault_load_env() {
  local vault_exports
  set +x
  set -a
  source .env
  set +a
  : "${VAULT_ADDR:?Set VAULT_ADDR in .env}" "${VAULT_ROLE_ID:?Set VAULT_ROLE_ID in .env}" "${VAULT_SECRET_ID:?Set VAULT_SECRET_ID in .env}"
  docker compose -f docker-compose.yml up -d --no-deps vault
  vault_exports=$(python3 scripts/vault-env.py "$@") || return
  eval "$vault_exports"
  unset vault_exports
}
