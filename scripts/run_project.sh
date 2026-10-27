#!/usr/bin/env bash
# Fetch the complete Vault bundle, optionally seed it, then build and start the project.
set -euo pipefail
set +x
cd "$(dirname "$0")/.."
source scripts/vault-env.sh
if [[ ${1:-} == --seed ]]; then
  vault_load_env --seed "${2:?Usage: bash scripts/run_project.sh --seed /secure/secrets.json}"
  shift 2
else
  vault_load_env
fi
docker compose up --build "$@"
