# Dedicated Shared HashiCorp Vault Server Setup

This guide provides the exact step-by-step instructions to set up an always-on shared HashiCorp Vault server on an Ubuntu/Debian host connected via Tailscale.

---

## Prerequisites
- A dedicated Linux VM or server with root/sudo access.
- Static or stable private Tailscale IP assigned to the host.

---

## Step 1: Install Docker and Tailscale on the Server

1. **Install Docker Engine & Compose plugin:**
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo systemctl enable --now docker
   ```

2. **Install and connect Tailscale:**
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up
   ```
   Retrieve the Tailscale IP of the server:
   ```bash
   tailscale ip -4
   # Example output: 100.115.92.45
   ```

---

## Step 2: Copy Server Files to the Host

Create a directory on the server (e.g. `/opt/coditent-vault`) and copy the contents of `deploy/vault-server/` into it:

```bash
sudo mkdir -p /opt/coditent-vault/config
sudo cp deploy/vault-server/docker-compose.yml /opt/coditent-vault/
sudo cp deploy/vault-server/config/vault.hcl /opt/coditent-vault/config/
sudo cp deploy/vault-server/unseal-on-boot.sh /opt/coditent-vault/
sudo cp deploy/vault-server/bootstrap-vault.sh /opt/coditent-vault/
sudo chmod +x /opt/coditent-vault/*.sh
```

Create a root-owned `.env` file in `/opt/coditent-vault` specifying the Tailscale IP. The systemd unit reads this file so the unseal script contacts the interface that Compose publishes:
```bash
echo "TAILSCALE_IP=$(tailscale ip -4)" | sudo tee /opt/coditent-vault/.env
sudo chown root:root /opt/coditent-vault/.env
sudo chmod 644 /opt/coditent-vault/.env
```

---

## Step 3: Start Vault Container

From `/opt/coditent-vault`, start the container:
```bash
cd /opt/coditent-vault
docker compose up -d
```
Verify the container is running:
```bash
docker compose ps
```

---

## Step 4: Initialize Vault (`vault operator init`)

Run `vault operator init` inside the container:
```bash
docker compose exec vault vault operator init -address=http://127.0.0.1:8200
```
Vault will output 5 unseal keys and 1 Initial Root Token:
> **IMPORTANT SECURITY RULES:**
> - Store the 5 unseal keys and the root token **OFFLINE** in a secure password manager (e.g. 1Password / Bitwarden).
> - **NEVER** commit unseal keys or the root token to git.
> - **NEVER** paste them in team chats or unencrypted tickets.

---

## Step 5: Configure Unseal Keys File on the Server

On the server, write the first 3 unseal keys into `/root/.vault-unseal-keys`, one key per line:

```bash
sudo bash -c 'cat > /root/.vault-unseal-keys <<EOF
<UNSEAL_KEY_1>
<UNSEAL_KEY_2>
<UNSEAL_KEY_3>
EOF'

sudo chmod 600 /root/.vault-unseal-keys
sudo chown root:root /root/.vault-unseal-keys
```

Test manual unseal with the script:
```bash
sudo /opt/coditent-vault/unseal-on-boot.sh
```
It should report: `Vault unsealed successfully.`

---

## Step 6: Install the Systemd Auto-Unseal Unit

Install and enable the systemd service so Vault is automatically unsealed whenever the server boots:

```bash
sudo cp deploy/vault-server/vault-unseal.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable vault-unseal.service
sudo systemctl start vault-unseal.service
sudo systemctl status vault-unseal.service
```

---

## Step 7: Bootstrap AppRole and Policies

From the server, export the address and your root token in your shell session, then run the bootstrap script. The script prints only the AppRole Role ID; keep the token out of command arguments and logs:

```bash
export VAULT_TOKEN="<YOUR_ROOT_TOKEN>"
export VAULT_ADDR="http://$(tailscale ip -4):8200"
/opt/coditent-vault/bootstrap-vault.sh
unset VAULT_TOKEN
unset VAULT_ADDR
```

The script will:
1. Enable the `kv-v2` secrets engine at `secret/`.
2. Write the `coditent-app` policy (read-only on `secret/data/ft_transcendence`).
3. Enable AppRole authentication.
4. Create the `coditent-app` role (`token_ttl=1h`, `token_max_ttl=4h`).
5. Print the `VAULT_ROLE_ID`.

Save the printed `VAULT_ROLE_ID` to share with teammates.

---

## Step 8: Populate Secrets from Admin Workstation

From your administrator workstation (connected to Tailscale), run `scripts/vault_init_secrets.py` pointing to the server's Tailscale address with newly rotated secrets:

```bash
export VAULT_ADDR="http://<SERVER_TAILSCALE_IP>:8200"
export VAULT_TOKEN="<YOUR_ROOT_TOKEN>"

# Run the secret initializer (using a local temporary env file with newly generated values)
python3 scripts/vault_init_secrets.py --env-file /path/to/rotated-secrets.env

unset VAULT_TOKEN
```

---

## Step 9: Generate Teammate AppRole Credentials

From an administrator workstation connected to Tailscale with the Vault CLI installed, generate one unique Secret ID per teammate. Do not run `docker compose exec` from the workstation; the Vault container exists only on the server.

```bash
export VAULT_ADDR="http://<SERVER_TAILSCALE_IP>:8200"
export VAULT_TOKEN="<YOUR_ROOT_TOKEN>"

vault write -f auth/approle/role/coditent-app/secret-id

unset VAULT_TOKEN
```

Provide each teammate securely with:
- `VAULT_ADDR=http://<SERVER_TAILSCALE_IP>:8200`
- `VAULT_ROLE_ID=<SHARED_ROLE_ID>`
- `VAULT_SECRET_ID=<UNIQUE_SECRET_ID_FOR_TEAMMATE>`
