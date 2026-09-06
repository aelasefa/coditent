#!/usr/bin/env bash
# ============================================================
# Coditent Ansible Deployment Helper
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMMAND="${1:-deploy}"
ENVIRONMENT="${2:-production}"
INVENTORY="inventory/hosts.ini"

function print_usage() {
    echo "Usage: $0 [command] [environment]"
    echo ""
    echo "Commands:"
    echo "  deploy      Deploy the application (default)"
    echo "  setup       Provision server (Docker, Nginx, UFW, dependencies)"
    echo "  restart     Restart application services"
    echo "  rollback    Rollback to a specific git commit (requires -e rollback_commit=...)"
    echo "  check       Run syntax checks on all playbooks"
    echo "  ping        Ping all inventory hosts"
    echo ""
    echo "Environments:"
    echo "  production  (default)"
    echo "  staging"
    echo ""
    echo "Examples:"
    echo "  $0 deploy production"
    echo "  $0 setup production"
    echo "  $0 check"
}

case "$COMMAND" in
    deploy)
        echo "--> Running deployment playbook on [$ENVIRONMENT]..."
        ansible-playbook -i "$INVENTORY" playbooks/deploy.yml --limit "$ENVIRONMENT" "${@:3}"
        ;;
    setup)
        echo "--> Provisioning host server for [$ENVIRONMENT]..."
        ansible-playbook -i "$INVENTORY" playbooks/setup.yml --limit "$ENVIRONMENT" "${@:3}"
        ;;
    restart)
        echo "--> Restarting application containers on [$ENVIRONMENT]..."
        ansible-playbook -i "$INVENTORY" playbooks/restart.yml --limit "$ENVIRONMENT" "${@:3}"
        ;;
    rollback)
        echo "--> Running rollback playbook on [$ENVIRONMENT]..."
        ansible-playbook -i "$INVENTORY" playbooks/rollback.yml --limit "$ENVIRONMENT" "${@:3}"
        ;;
    check)
        echo "--> Checking playbook syntax..."
        ansible-playbook -i "$INVENTORY" playbooks/setup.yml --syntax-check
        ansible-playbook -i "$INVENTORY" playbooks/deploy.yml --syntax-check
        ansible-playbook -i "$INVENTORY" playbooks/rollback.yml --syntax-check
        ansible-playbook -i "$INVENTORY" playbooks/restart.yml --syntax-check
        echo "All playbooks passed syntax check!"
        ;;
    ping)
        echo "--> Pinging hosts in inventory..."
        ansible -i "$INVENTORY" all:!local -m ping
        ;;
    help|--help|-h)
        print_usage
        ;;
    *)
        echo "Error: Unknown command '$COMMAND'"
        print_usage
        exit 1
        ;;
esac
