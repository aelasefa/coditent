#!/usr/bin/env bash
set -euo pipefail

archive="${1:-}"
if [[ -z "$archive" || ! -f "$archive" ]]; then
  echo "Usage: $0 /absolute/path/to/backup.dump" >&2
  exit 2
fi
if [[ "${ALLOW_DATABASE_RESTORE:-}" != "YES" ]]; then
  echo "Set ALLOW_DATABASE_RESTORE=YES after verifying the target database" >&2
  exit 2
fi
if [[ -z "${RESTORE_DATABASE_URL:-}" ]]; then
  echo "RESTORE_DATABASE_URL is required and must name the restore target" >&2
  exit 2
fi
if ! command -v pg_restore >/dev/null 2>&1; then
  echo "pg_restore is required" >&2
  exit 2
fi

archive="$(cd "$(dirname "$archive")" && pwd -P)/$(basename "$archive")"
if [[ -f "$archive.sha256" ]]; then
  (cd "$(dirname "$archive")" && sha256sum --check "$(basename "$archive").sha256")
fi
pg_restore --list "$archive" >/dev/null
restore_url="${RESTORE_DATABASE_URL/postgresql+asyncpg:\/\//postgresql:\/\/}"
client_major="$(pg_restore --version | sed -E 's/.* ([0-9]+)(\..*)?$/\1/')"
target_version_num="$(psql "$restore_url" -Atc 'SHOW server_version_num')"
target_major="$((target_version_num / 10000))"
if [[ "$client_major" != "$target_major" && "${ALLOW_PG_CLIENT_VERSION_MISMATCH:-}" != "YES" ]]; then
  echo "pg_restore major $client_major does not match target PostgreSQL major $target_major" >&2
  exit 2
fi

pg_restore --dbname="$restore_url" --clean --if-exists --no-owner \
  --no-privileges --exit-on-error "$archive"
psql "$restore_url" -v ON_ERROR_STOP=1 -c "SELECT 1" >/dev/null
echo "Restore completed and target connection verified"
