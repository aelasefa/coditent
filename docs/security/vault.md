# CODITENT Vault runbook

The backend reads credentials only from the KV v2 document `secret/data/coditent`. Compose does not pass the root `.env` file into API/worker containers. The Vault server stores data in the `vault_data` Docker volume; it is not running in dev mode. Vault is exposed only on host loopback at `127.0.0.1:8200`.

## First run

1. Copy `.env.example` to `.env`. Keep only nonsecret settings, the public Supabase browser URL/key, `VAULT_ADDR`, and the limited app-role values described below. Do not put a Vault root token or application secrets in `.env`.
2. Start only Vault:

   ```sh
   docker compose up -d vault
   ```

3. Initialize it once, and save the printed unseal keys and initial root token in a secure password manager. Do not put these values in `.env` or share the root token with app administrators.

   ```sh
   docker compose exec vault vault operator init
   ```

4. Unseal using the number of keys required by the initialization output. Repeat the command with a different key each time:

   ```sh
   docker compose exec vault vault operator unseal
   ```

5. Open `http://127.0.0.1:8200/ui/`, sign in with the initial root token, enable a KV v2 secrets engine mounted at `secret` if needed, and add the app values at `secret/coditent`. Required values include `DATABASE_URL`, `JWT_SECRET`, and `GEMINI_API_KEY`; add the Supabase service key, encryption keys, OAuth credentials, and Resend key when those integrations are used. `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are public browser configuration and remain in `.env` for the Next.js build.
6. Log the Vault CLI in as the administrator, enable AppRole, and create the limited runtime role. These commands execute the Vault CLI inside the running Vault container:

   ```sh
   docker compose exec -it vault vault login
   docker compose exec vault vault secrets enable -path=secret kv-v2
   docker compose exec vault vault auth enable approle
   docker compose exec vault vault policy write coditent-app /vault/policies/coditent-app.hcl
   docker compose exec vault vault policy write coditent-admin-read /vault/policies/coditent-admin-read.hcl
   docker compose exec vault vault policy write coditent-admin-edit /vault/policies/coditent-admin-edit.hcl
   docker compose exec vault vault write auth/approle/role/coditent-app token_policies=coditent-app token_ttl=1h token_max_ttl=4h secret_id_ttl=0 secret_id_num_uses=0
   docker compose exec vault vault read -field=role_id auth/approle/role/coditent-app/role-id
   docker compose exec vault vault write -f -field=secret_id auth/approle/role/coditent-app/secret-id
   ```

   Put the returned Role ID and Secret ID into `VAULT_ROLE_ID` and `VAULT_SECRET_ID` in `.env`. The AppRole policy only reads the app document; it cannot write secrets, manage Vault, or create tokens.
7. Start all services in order with:

   ```sh
   ./scripts/run_project.sh
   ```

   The launcher starts Vault and waits for it to be initialized and unsealed before running `docker compose up --build -d`. On later Vault restarts, unseal it first. The data remains in the Docker volume.

## Give an administrator a limited token

Use the read policy for an admin who should only view CODITENT's shared secret document, or the edit policy for one who may view and change values there. Neither policy grants delete, root, auth, policy, or mount-management permissions.

```sh
vault token create -policy=coditent-admin-read -ttl=24h
# or
vault token create -policy=coditent-admin-edit -ttl=24h
```

Give the resulting token to that person through your approved secure channel. They can sign into the Vault UI or use `VAULT_ADDR` and `VAULT_TOKEN` with the Vault CLI. Do not give them the initial root token or the app's AppRole Secret ID. For smaller access scopes, make a separate policy for the exact secret path that person needs.

## Move existing `.env` values into Vault

If `.env` still contains old application values, use the migration helper once while signed in with an administrator token that can write `secret/data/coditent`:

```sh
export VAULT_TOKEN='<temporary-admin-token>'
docker compose run --rm --no-deps \
  -e VAULT_ADDR=http://vault:8200 -e VAULT_TOKEN \
  -v "$PWD/.env:/tmp/coditent.env:ro" \
  -v "$PWD/scripts/vault_init_secrets.py:/tmp/vault_init_secrets.py:ro" \
  api python /tmp/vault_init_secrets.py --env-file /tmp/coditent.env
unset VAULT_TOKEN
```

It skips Vault bootstrap credentials and prints key names only. Verify the values in Vault, then remove application secrets from `.env`. Rotate any credentials that have been shared outside their intended secret store.

## Restart behavior

Vault file storage survives container replacement as long as the `vault_data` volume is preserved. A restart leaves Vault sealed unless an auto-unseal mechanism is configured; the operator must unseal it before app containers can start. Back up the Vault volume and the unseal/recovery material separately. Never run `docker compose down -v` unless deleting Vault data is intentional.
