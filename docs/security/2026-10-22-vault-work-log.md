# Vault Integration Work Log — 2026-10-22

## Work completed

- Replaced the local Vault development-mode setup with a file-backed Vault service and persistent `vault_data` volume in Docker Compose.
- Added Vault health checks and startup dependencies so the API, worker, and AI dispatcher wait for Vault and Redis.
- Updated the API configuration and Vault client to authenticate through AppRole and load application secrets from `secret/data/coditent`. The API fails closed when Vault is required but unavailable.
- Added the `coditent-app` read policy and limited admin read/edit policies.
- Added `scripts/run_project.sh` to start Vault first, wait for it to be initialized and unsealed, and check the AppRole settings before starting the full project. Its status message distinguishes an initialized, sealed Vault from one that has never been initialized.
- Updated `scripts/vault_init_secrets.py` to support a protected token file, skip Vault bootstrap values and non-secret config, and print secret names rather than values.
- Updated `.env.example`, `.gitignore`, README guidance, and the Vault runbook with initialization, unseal, AppRole, migration, and restart instructions. Added `sed7el.txt` to `.gitignore` because it may contain initialization credentials.

## Runtime status

- Docker images build successfully. The Vault and Redis containers have reported healthy.
- The API, worker, and dispatcher have restarted during startup attempts. The latest API logs show HTTP 400 from `POST /v1/auth/approle/login`; Vault is reachable, but it rejects the AppRole credentials currently passed to the API.
- The AppRole auth method, policy, and role were recreated after a Vault volume reset. A successful API login has not yet been confirmed. The fresh Vault's `secret/coditent` data also needs to be verified or imported before the API can finish loading its settings.
- The project is not yet confirmed running end to end. No automated tests were run during this work.

## Commit

- `6507e293` — `WIP: Vault-backed secrets; more work needed`
- The commit is on branch `security` and has not been pushed.

## Follow-up

1. Check that the current `VAULT_ROLE_ID` and `VAULT_SECRET_ID` in `.env` match the current `coditent-app` AppRole; keep the Secret ID private.
2. Confirm AppRole login succeeds, then confirm `secret/coditent` contains the required application secrets.
3. Recreate the API, worker, and dispatcher and inspect their logs until the API health check passes.
4. Rotate Vault and provider credentials that were exposed in chat or terminal output. Do not include credential values in future logs or work notes.
