# HashiCorp Vault secrets

The Compose launcher logs into HashiCorp Vault using AppRole, reads the complete
KV v2 object at `secret/ft_transcendence`, exports its entries, and revokes its
short-lived login token before starting application containers. The backend uses
`SECRET_SOURCE=environment`; the old Supabase Edge Function is not used by this flow.

Follow [setup and deployment instructions](../shared-vault.md).

The root `.env` holds only `VAULT_ADDR`, `VAULT_PORT`, `VAULT_ROLE_ID`, and
`VAULT_SECRET_ID`. Admin can read/write the project object; member can only read.
EC2 must use member credentials. `.env` and `.vault/` are gitignored. Root tokens
are for bootstrap only and `vault/init.sh` revokes its bootstrap token on success.

The file backend is persistent but single-node. Back up the Docker volume and
keep unseal keys off-host. Restarting Vault seals it: unseal interactively before
deployment, or configure auto-unseal separately. Never delete the volume to fix
a seal or authentication error. Port 8200 binds only to host loopback; remote
clients use an SSH tunnel. Docker administrators can inspect container secrets.
