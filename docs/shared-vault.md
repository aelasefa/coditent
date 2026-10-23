# Shared HashiCorp Vault Guide for Teammates

CODITENT uses a central, shared HashiCorp Vault instance running on a private server (accessible via Tailscale / VPN) to provide all runtime secrets (`DATABASE_URL`, `JWT_SECRET`, API keys, etc.) to backend containers (`api`, `worker`, `ai-dispatcher`).

---

## 1. What Teammates Need to Know

- **Never run `vault operator init`:** The shared Vault is already initialized and unsealed on the dedicated server.
- **You do NOT need unseal keys:** The server manages unsealing automatically upon boot via a systemd unit.
- **No local Vault container needed:** Docker Compose leaves the local `vault` container disabled by default (it is behind the `local-vault` profile). You do not need to store, manage, or run Vault on your local machine.

---

## 2. Setting Up Your Local Environment

1. **Connect to the Network:**
   Ensure you are connected to the team Tailscale network (or VPN) so that the Vault server IP is reachable from your workstation:
   ```bash
   curl -I http://<TAILSCALE_IP>:8200/v1/sys/health
   ```
   (You should receive an HTTP 200 response).

2. **Configure `.env`:**
   Copy `.env.teammate.example` to `.env`:
   ```bash
   cp .env.teammate.example .env
   ```

3. **Get Your Credentials:**
   Request your AppRole credentials from the Vault administrator:
   - `VAULT_ADDR`: The Tailscale URL of the shared Vault server (e.g. `http://100.x.y.z:8200`).
   - `VAULT_ROLE_ID`: The shared `coditent-app` Role ID.
   - `VAULT_SECRET_ID`: Your unique AppRole Secret ID issued by the administrator.

   Fill these three values into your `.env` file along with the project's public Supabase frontend keys.

---

## 3. Running the Project

Start the application services using the teammate runner script:

```bash
./scripts/run_project_teammate.sh
```

Alternatively, `./scripts/run_project.sh` will automatically detect that `VAULT_ADDR` points to an external shared Vault, verify health and credentials, and boot the application stack without starting a local Vault container.
