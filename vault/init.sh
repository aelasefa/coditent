#!/usr/bin/env bash
# Run once on the Vault host; reruns unseal/reuse state without rotating AppRole credentials.
set -euo pipefail
set +x
cd "$(dirname "$0")/.."
umask 077
mkdir -p .vault
chmod 700 .vault
set -a
source .env
set +a
TOKEN=""
v() { docker compose -f docker-compose.yml exec -T -e VAULT_TOKEN="$TOKEN" vault vault "$@"; }
unseal() {
  docker compose -f docker-compose.yml exec -T vault sh -c 'IFS= read -r key; vault operator unseal "$key" >/dev/null'
}
j() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
docker compose -f docker-compose.yml up -d --no-deps vault
for ((attempt=0; attempt<30; attempt++)); do
  if STATUS=$(v status -format=json 2>/dev/null); then break; fi
  [[ -n $STATUS ]] && break
  sleep 1
done
if [[ -z $STATUS ]]; then
  echo 'Vault did not start. Container diagnostics:' >&2
  docker compose -f docker-compose.yml ps -a vault >&2
  docker compose -f docker-compose.yml logs --tail=30 vault >&2
  exit 1
fi
if [[ $(j 'd["initialized"]' <<< "$STATUS") == False ]]; then
  v operator init -key-shares=1 -key-threshold=1 -format=json > .vault/bootstrap.json
fi
if [[ $(j 'd["sealed"]' <<< "$STATUS") == True && -s .vault/bootstrap.json ]]; then
  j 'd["unseal_keys_b64"][0]' < .vault/bootstrap.json | unseal
fi
while true; do
  STATUS=$(v status -format=json) || [[ $? == 2 ]]
  [[ $(j 'd["sealed"]' <<< "$STATUS") == False ]] && break
  printf 'Vault is sealed: %s of %s distinct keys supplied.\n' \
    "$(j 'd["progress"]' <<< "$STATUS")" "$(j 'd["t"]' <<< "$STATUS")" >&2
  if [[ ! -t 0 ]]; then
    echo 'Run this script interactively on the Vault host with the original unseal keys.' >&2
    exit 1
  fi
  read -rsp 'Next distinct unseal key: ' KEY; echo
  printf '%s\n' "$KEY" | unseal
  unset KEY
done
if [[ -f .vault/configured ]]; then
  cat .vault/roles.env
  exit
fi
if [[ -s .vault/bootstrap.json ]]; then
  TOKEN=$(j 'd.get("root_token", "")' < .vault/bootstrap.json)
fi
if [[ -z $TOKEN ]]; then read -rsp 'Bootstrap root token: ' TOKEN; echo; fi
MOUNTS=$(v secrets list -format=json)
if [[ $(j '"secret/" in d' <<< "$MOUNTS") == False ]]; then
  v secrets enable -path=secret kv-v2
else
  [[ $(j 'd["secret/"]["type"] == "kv" and d["secret/"]["options"].get("version") == "2"' <<< "$MOUNTS") == True ]]
fi
AUTH=$(v auth list -format=json)
if [[ $(j '"approle/" in d' <<< "$AUTH") == False ]]; then v auth enable approle; fi
for role in admin member; do
  caps='"read"'
  [[ $role == admin ]] && caps='"create", "read", "update", "delete"'
  v policy write "$role" - <<EOF
path "secret/data/ft_transcendence" {
  capabilities = [$caps]
}
EOF
  v write "auth/approle/role/$role" token_policies="$role" \
    token_ttl=5m token_max_ttl=10m secret_id_ttl=0 secret_id_num_uses=0 >/dev/null
done
: > .vault/roles.env.tmp
for role in admin member; do
  {
    printf '\n# %s\n' "$role"
    printf 'VAULT_ROLE_ID=%s\n' "$(v read -field=role_id "auth/approle/role/$role/role-id")"
    printf 'VAULT_SECRET_ID=%s\n' "$(v write -f -field=secret_id "auth/approle/role/$role/secret-id")"
  } >> .vault/roles.env.tmp
done
mv .vault/roles.env.tmp .vault/roles.env
v token revoke -self >/dev/null
unset TOKEN
if [[ -f .vault/bootstrap.json ]]; then
  python3 - <<'CLEAN'
import json
from pathlib import Path
p = Path('.vault/bootstrap.json')
d = json.loads(p.read_text())
d.pop('root_token', None)
p.write_text(json.dumps(d))
CLEAN
fi
touch .vault/configured
cat .vault/roles.env
printf '\nCopy the appropriate credentials into .env; then seed using: bash scripts/run_project.sh --seed /secure/secrets.json -d\n'
