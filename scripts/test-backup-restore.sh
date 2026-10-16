#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" || -z "${RESTORE_DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL and RESTORE_DATABASE_URL are required" >&2
  exit 2
fi
source_url="${DATABASE_URL/postgresql+asyncpg:\/\//postgresql:\/\/}"
restore_url="${RESTORE_DATABASE_URL/postgresql+asyncpg:\/\//postgresql:\/\/}"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

psql "$source_url" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
CREATE TABLE IF NOT EXISTS backup_restore_probe (
  id integer PRIMARY KEY,
  value text NOT NULL
);
INSERT INTO backup_restore_probe (id, value)
VALUES (1, 'coditent-backup-ok')
ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value;
SQL

archive="$("$(dirname "$0")/database-backup.sh" "$tmp_dir")"
ALLOW_DATABASE_RESTORE=YES "$(dirname "$0")/database-restore.sh" "$archive" >/dev/null
value="$(psql "$restore_url" -v ON_ERROR_STOP=1 -Atc "SELECT value FROM backup_restore_probe WHERE id=1")"
if [[ "$value" != "coditent-backup-ok" ]]; then
  echo "Restored probe did not match" >&2
  exit 1
fi
echo "Backup and restore drill passed"
