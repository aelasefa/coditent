# CODITENT project usage

The launcher reads the complete application bundle from Vault KV v2 at `secret/ft_transcendence`, exports it for Compose, logs in with AppRole, revokes its short-lived token, then builds and starts the project. Keep the root `.env` limited to the four Vault settings in `.env.example`.

## Administrator: first setup

Use an administrator workstation or the Vault host. The scripts need Bash, Python 3, Docker Compose, and access to Vault.

```bash
cp .env.example .env
chmod 600 .env
bash vault/init.sh
```

For an existing Vault, enter its original distinct unseal keys when prompted. Initialization prints the `admin` and `member` AppRole credentials. Put the admin Role ID and Secret ID in your private `.env`. Store the unseal keys off the machine and protect `.vault/`; do not use the root token for normal work.

Create a private JSON file with the complete project environment bundle. These keys are required:

```json
{
  "DATABASE_URL": "your-database-url",
  "JWT_SECRET": "your-random-signing-key-of-at-least-32-characters",
  "GEMINI_API_KEY": "your-provider-key"
}
```

Add every other value the project uses, including OAuth credentials, Supabase service credentials, encryption keys, email provider credentials, and non-secret application configuration such as production callback URLs. Use a real frontend Supabase publishable key only when using the browser Supabase integration. Preserve existing encryption keys when updating the bundle.

Seed or replace the whole KV object with the admin credentials:

```bash
chmod 600 /secure/path/project-secrets.json
bash scripts/run_project.sh --seed /secure/path/project-secrets.json -d
```

Seeding replaces the whole object. Include every value you need afterward. The JSON file stays local and is gitignored when saved under `.vault/`.

## Everyday local startup

Make sure Vault is running and unsealed, and the private `.env` has the admin credentials. Then run:

```bash
bash scripts/run_project.sh -d
```

The script fetches the bundle and starts Compose. The API runs migrations at startup. Open `http://localhost:3001`; API readiness is at `http://localhost:3001/ready` through the proxy, or `http://localhost:8001/ready` directly.

Vault seals after a restart. Unseal it before starting the app:

```bash
bash vault/init.sh
```

The script asks for enough distinct keys for that Vault's threshold. Do not delete the Vault volume to recover from a seal or login error; it contains the stored project secrets.

## Teammate setup

Get `member` Role ID and Secret ID from the administrator through a secure channel. Teammates use read-only access. With the SSH tunnel open in one terminal, copy the teammate example and start the app in another:

```bash
cp .env.teammate.example .env
chmod 600 .env
ssh -N -L 18200:127.0.0.1:8200 ubuntu@YOUR_VAULT_HOST
```

Set the member credentials in `.env`, keeping `VAULT_ADDR=http://127.0.0.1:18200`, then run:

```bash
bash scripts/run_project_teammate.sh -d
```

Do not start a fresh local Vault for this shared setup. The tunnel's local port `18200` avoids colliding with the Compose Vault port `8200`.

## Useful checks

```bash
docker compose ps
curl -fsS http://localhost:3001/ready
curl -fsS http://localhost:8200/v1/sys/health
```

If Vault health works but startup reports a missing secret path, ask an admin to seed `secret/ft_transcendence`. Never paste `.env`, Secret IDs, unseal keys, database URLs, or secret bundle contents into chat or Git.
