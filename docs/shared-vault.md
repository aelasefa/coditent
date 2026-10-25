# Shared HashiCorp Vault

Prerequisites: Bash, Python 3, Docker Engine and Docker Compose. The application
still uses Supabase PostgreSQL/storage, but HashiCorp Vault supplies its secrets.

## Administrator: initialize and seed on the Vault host

```bash
cp .env.example .env
chmod 600 .env
bash vault/init.sh
```

For an existing Vault, supply its original distinct unseal keys. For a new Vault,
bootstrap material is saved in `.vault/bootstrap.json`; move the unseal material
to a secure off-host location after setup. The script prints admin and member
AppRole credentials. Put admin credentials in your `.env`; distribute member
credentials securely. Do not paste credentials into chat or commit them.

Create a private JSON object outside Git containing environment-variable names
and string values. Required entries: `DATABASE_URL`, `JWT_SECRET` (32+ characters),
and `GEMINI_API_KEY`. Include OAuth pairs, Supabase service credentials, encryption
keys, email credentials, and configuration such as `FRONTEND_URL`, `CORS_ORIGINS`,
`NEXT_PUBLIC_SUPABASE_URL`, and the public Supabase publishable key as applicable.
Never substitute a service-role key for a browser publishable key.

```bash
chmod 600 /path/to/secrets.json
bash scripts/run_project.sh --seed /path/to/secrets.json -d
```

Seeding replaces the complete KV object, so include every value you want to keep.
Keep existing encryption keys unless performing an explicit data/key migration.
Subsequent runs only need `bash scripts/run_project.sh -d`.

## Teammates

```bash
cp .env.teammate.example .env
chmod 600 .env
ssh -N -L 18200:127.0.0.1:8200 ubuntu@YOUR_VAULT_HOST
```

Keep that tunnel open. Put member credentials in `.env`, leave
`VAULT_ADDR=http://127.0.0.1:18200`, and run in another terminal:

```bash
bash scripts/run_project_teammate.sh -d
```

The local Compose stack also defines Vault on port 8200; the separate tunnel
port 18200 avoids collisions. Secrets come from the address in `.env`. Do not
initialize a new local Vault when you intend to use the shared one.

## EC2 before the first merge

Provision the Vault service and these scripts on EC2 before enabling deployment.
Initialize/unseal that host's Vault, then seed its production bundle with admin
credentials. Local Vault state is not uploaded by Git or GitHub Actions.
Production must include explicit HTTPS `FRONTEND_URL` and `CORS_ORIGINS`, a valid
`TOTP_ENCRYPTION_KEY`, and `EMAIL_OUTBOX_ENCRYPTION_KEY` if email is enabled.
Use production OAuth callback URLs and provider credentials.

Switch `/opt/coditent/.env` to member credentials and localhost Vault access:

```bash
cd /opt/coditent
bash -c 'set -euo pipefail; source scripts/vault-env.sh; vault_load_env --production'
```

A successful check prints no secrets. The main-branch workflow builds an immutable
API image and deploys through SSM. Its deploy script checks Vault before changing
the release image or ingress; it then pulls and starts the backend services.
Production keeps the existing Vercel frontend and host Nginx architecture.
The image identifier is managed by the deployment script, not supplied as a secret.

A restart seals Vault. Run `bash vault/init.sh` interactively and provide the
original keys before retrying deployment. The workflow never initializes Vault,
uses root tokens, or stores unseal keys. Use a secure administrative process to
rotate exposed AppRole Secret IDs and provider/database credentials before release.
