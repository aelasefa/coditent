#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 2
fi
if ! command -v pg_dump >/dev/null 2>&1 || ! command -v pg_restore >/dev/null 2>&1; then
  echo "PostgreSQL client tools (pg_dump and pg_restore) are required" >&2
  exit 2
fi

backup_dir="${1:-./backups}"
mkdir -p "$backup_dir"
backup_dir="$(cd "$backup_dir" && pwd -P)"
umask 077
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="$backup_dir/coditent-$timestamp.dump"
database_url="${DATABASE_URL/postgresql+asyncpg:\/\//postgresql:\/\/}"
client_major="$(pg_dump --version | sed -E 's/.* ([0-9]+)(\..*)?$/\1/')"
server_version_num="$(psql "$database_url" -Atc 'SHOW server_version_num')"
server_major="$((server_version_num / 10000))"
if [[ "$client_major" != "$server_major" && "${ALLOW_PG_CLIENT_VERSION_MISMATCH:-}" != "YES" ]]; then
  echo "pg_dump major $client_major does not match source PostgreSQL major $server_major" >&2
  echo "Install the matching PostgreSQL client or explicitly set ALLOW_PG_CLIENT_VERSION_MISMATCH=YES" >&2
  exit 2
fi

pg_dump --dbname="$database_url" --format=custom --compress=9 \
  --no-owner --no-privileges --file="$archive"
pg_restore --list "$archive" >/dev/null
sha256sum "$archive" > "$archive.sha256"
printf '%s\n' "$archive"
