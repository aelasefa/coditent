#!/usr/bin/env bash
# Use member credentials in .env; Vault enforces read-only access regardless of entry point.
set -euo pipefail
exec bash "$(dirname "$0")/run_project.sh" "$@"
