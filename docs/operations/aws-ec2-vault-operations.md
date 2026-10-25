# DevOps handoff: Vault on AWS EC2

This project uses two separate secret stores after rollout: each developer machine and the EC2 host have their own Vault data volume. GitHub Actions transfers neither Vault data nor credentials. Initialize and seed EC2 Vault before the first application deployment.

## Deployment layout

- GitHub Actions builds the API image, tags it with the tested commit, and pushes it to Amazon ECR.
- GitHub Actions uses its OIDC role to ask AWS Systems Manager to run the deploy script on the EC2 instance. It does not SSH into the host or send application secrets.
- EC2 pulls the immutable API image from ECR and starts the API, worker, dispatcher, Redis, and Vault with Docker Compose.
- HashiCorp Vault uses pinned image `hashicorp/vault:1.21.4`, the persistent Docker volume `vault_data`, and the host-only binding `127.0.0.1:${VAULT_PORT:-8200}:8200`.
- Vault's listener uses HTTP on the private Docker host loopback. Keep EC2 security-group rules from exposing TCP 8200 publicly. Teammates access it through SSH local forwarding.
- Production frontend hosting remains Vercel; host Nginx serves the production API ingress.

## One-time EC2 provisioning

1. Ensure EC2 has Docker Engine, Docker Compose, Git, Python 3, and `curl`. Attach an instance role with permission to authenticate to ECR and receive the deployment command through SSM. Configure GitHub OIDC trust, `AWS_DEPLOY_ROLE_ARN`, `AWS_REGION`, `ECR_REPOSITORY`, `EC2_INSTANCE_ID`, and `PUBLIC_BASE_URL` as required by `.github/workflows/deploy.yml`.
2. Check out the project at `/opt/coditent`. Create `/opt/coditent/.env` with mode `0600` and only:

   ```dotenv
   VAULT_ADDR=http://127.0.0.1:8200
   VAULT_PORT=8200
   VAULT_ROLE_ID=
   VAULT_SECRET_ID=
   ```

3. Start the Vault service and initialize it once:

   ```bash
   cd /opt/coditent
   chmod 600 .env
   bash vault/init.sh
   ```

   Store every generated unseal key and the bootstrap recovery material in an approved off-host secure backup. The configured example uses Shamir unseal. After a Vault restart, supply the required distinct original keys with `bash vault/init.sh`. Do not remove `vault_data` to fix a sealed Vault.

4. Seed the production KV object using admin credentials and a protected JSON bundle on the host:

   ```bash
   bash scripts/run_project.sh --seed /secure/path/production-secrets.json -d
   ```

   Use production HTTPS `FRONTEND_URL` and `CORS_ORIGINS`, registered production OAuth callbacks, valid `TOTP_ENCRYPTION_KEY`, and `EMAIL_OUTBOX_ENCRYPTION_KEY` when email is enabled. Keep the same database, JWT, TOTP, and email-encryption keys across releases unless running a planned rotation or data migration.

5. Change `/opt/coditent/.env` to the generated **member** Role ID and Secret ID. EC2 deploys read-only; do not leave admin or root credentials in the runtime environment. Verify the member preflight:

   ```bash
   cd /opt/coditent
   bash -c 'set -euo pipefail; source scripts/vault-env.sh; vault_load_env --production'
   ```

   A successful check validates Vault initialization/unseal, member policy, required secret path, production HTTPS origins, and encryption keys. It does not print secret values.

## Merge and deployment behavior

On a push to `main`, the workflow builds and pushes the immutable API image, then sends the tested commit and image URI through SSM. The EC2 deploy script performs the Vault member preflight before changing the active image or reconciling the host ingress. It then pulls the tested image, starts the backend Compose services, and checks `http://127.0.0.1:8001/ready`. GitHub Actions also verifies the public HTTPS readiness and unauthenticated write boundaries.

Before the first production rollout, confirm EC2 Vault is already seeded and the member preflight above passes. Local `.vault/` data is not copied to AWS. A sealed or unseeded EC2 Vault causes deployment to stop before activating the new image.

## Operations and recovery

- Vault API and UI are host-loopback only. For secure administration from a teammate workstation, tunnel to EC2: `ssh -N -L 18200:127.0.0.1:8200 ubuntu@YOUR_EC2_HOST`; set the workstation `.env` address to `http://127.0.0.1:18200`.
- Protect the EC2 `.env`, production seed file, `vault_data` backups, unseal material, and any Vault server output. Never log secrets or put them in GitHub workflow YAML.
- Back up the persistent Vault volume with a documented, tested restore procedure. A single file-backed Vault instance is not highly available.
- For `Vault needs initialization/unsealing`, run `vault status` and unseal with the original keys. For HTTP 404 at the KV read, check whether `secret/ft_transcendence` was seeded. For permission denied, verify that EC2's `.env` uses the member AppRole and that the role has the `member` policy.
- Rotate the member Secret ID and any credential exposed in chat, logs, or an unprotected file. Follow the incident's credential-specific rotation procedure; preserve data-encryption keys until dependent encrypted data is migrated.
