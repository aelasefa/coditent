# Coditent Ansible Automation

Automated server provisioning, application deployment, environment management, and health checks for the Coditent talent workflow platform.

---

## Architecture Overview

```
ansible/
├── ansible.cfg                          # Global Ansible defaults & SSH pipelining
├── requirements.yml                     # Ansible Galaxy collection dependencies
├── deploy.sh                            # Local CLI wrapper script
├── vault.example.yml                    # Template for encrypting credentials
├── inventory/
│   ├── hosts.ini                        # Target servers (production, staging, local)
│   └── group_vars/
│       ├── all.yml                      # Shared application configurations & defaults
│       ├── production.yml               # Production environment variables
│       └── staging.yml                  # Staging environment variables
├── playbooks/
│   ├── setup.yml                        # Server bootstrap: installs Docker, Nginx, UFW, dependencies
│   ├── deploy.yml                       # Deployment: pulls code, renders envs, starts containers, verifies health
│   ├── rollback.yml                     # Rollback: reverts to a specific commit or tag
│   └── restart.yml                      # Restarts application containers cleanly
└── roles/
    ├── common/                          # Base OS update, security, UFW firewall rules
    ├── docker/                          # Official Docker CE & Docker Compose plugin setup
    ├── nginx/                           # Host reverse proxy for port 80/443 routing
    └── coditent/                        # Application sync, env generation, Docker Compose lifecycle, healthchecks
```

---

## Prerequisites

1. **Ansible 2.15+** installed on your control machine:
   ```bash
   sudo apt update && sudo apt install -y ansible
   ```
2. **Install Galaxy Collections**:
   ```bash
   ansible-galaxy collection install -r ansible/requirements.yml
   ```
3. **SSH Access**:
   Ensure you have SSH key access to the target host (e.g., AWS EC2 instance):
   ```bash
   ssh -i ~/.ssh/your-key.pem ubuntu@34.205.255.37
   ```

---

## 1. Quick Start using CLI Wrapper

Use the `./ansible/deploy.sh` helper script:

```bash
# Verify playbook syntax
./ansible/deploy.sh check

# Test connection to servers
./ansible/deploy.sh ping

# Provision a brand new server (Docker, Nginx, UFW)
./ansible/deploy.sh setup production

# Deploy application updates
./ansible/deploy.sh deploy production

# Restart containers
./ansible/deploy.sh restart production
```

---

## 2. Server Provisioning (One-Time Setup)

To bootstrap a brand new Ubuntu VPS / EC2 instance from scratch:

```bash
ansible-playbook -i ansible/inventory/hosts.ini ansible/playbooks/setup.yml
```

This automates:
- System package updates & baseline utilities (`curl`, `git`, `htop`, etc.)
- UFW firewall configuration (allowing SSH port 22, HTTP 80, HTTPS 443)
- Docker CE & Docker Compose v2 plugin installation
- Adding the deployment user (`ubuntu`) to the `docker` group
- Nginx reverse proxy configuration forwarding `/health` to API and `/` to Next.js Web

---

## 3. Application Deployment

To deploy latest changes from Git, rebuild containers, and verify health:

```bash
ansible-playbook -i ansible/inventory/hosts.ini ansible/playbooks/deploy.yml
```

### Deploying a specific branch:
```bash
ansible-playbook -i ansible/inventory/hosts.ini ansible/playbooks/deploy.yml -e "repo_branch=develop"
```

### Passing credentials directly or from CI:
```bash
ansible-playbook -i ansible/inventory/hosts.ini ansible/playbooks/deploy.yml \
  -e "database_url=postgresql+asyncpg://... supabase_url=https://... supabase_service_key=sb_secret_..."
```

---

## 4. Managing Secrets with Ansible Vault

To keep sensitive production keys (Supabase keys, JWT secret, Gemini API key) encrypted in version control:

1. **Create an encrypted vault file**:
   ```bash
   ansible-vault create ansible/inventory/group_vars/production/vault.yml
   ```
   (Use `ansible/vault.example.yml` as reference for keys).

2. **Edit the encrypted vault**:
   ```bash
   ansible-vault edit ansible/inventory/group_vars/production/vault.yml
   ```

3. **Deploy using Vault**:
   ```bash
   ansible-playbook -i ansible/inventory/hosts.ini ansible/playbooks/deploy.yml --ask-vault-pass
   ```
   Or with a vault password file:
   ```bash
   ansible-playbook -i ansible/inventory/hosts.ini ansible/playbooks/deploy.yml --vault-password-file ~/.vault_pass
   ```

---

## 5. Rollbacks & Restarts

### Rollback to a previous commit:
```bash
ansible-playbook -i ansible/inventory/hosts.ini ansible/playbooks/rollback.yml -e "rollback_commit=a37397fb"
```

### Restart services without rebuilding:
```bash
ansible-playbook -i ansible/inventory/hosts.ini ansible/playbooks/restart.yml
```

---

## 6. GitHub Actions CI/CD Integration

In `.github/workflows/deploy.yml`, the deployment stage runs Ansible automatically upon pushes to `main`:

```yaml
- name: Run Ansible Deploy Playbook
  run: |
    ansible-playbook -i ansible/inventory/hosts.ini ansible/playbooks/deploy.yml \
      -e "ansible_host=${{ secrets.EC2_HOST }} ansible_user=${{ secrets.EC2_USER }}" \
      -e "repo_branch=${{ github.ref_name }}"
```
