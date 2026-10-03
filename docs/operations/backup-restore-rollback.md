# Database backup, restore, and rollback

Coditent production data is stored in managed PostgreSQL. Run backups from a restricted operator host with PostgreSQL client tools whose major version matches the source and restore target. The scripts verify this before proceeding, never read repository `.env` files, and do not print connection strings.

## Backup

Set `DATABASE_URL` from the deployment secret manager and run:

```bash
DATABASE_URL='<managed-postgresql-url>' scripts/database-backup.sh /secure/backups
```

The result is a PostgreSQL custom-format archive plus a SHA-256 checksum. Store both in encrypted, access-controlled object storage with retention and immutability appropriate to the environment. This database archive does not include Supabase Storage objects; enable provider bucket versioning/backup separately for `candidate-cvs`, `company-logos`, and `user-avatars`.

## Restore drill

Restore only into a newly created, isolated target. The explicit confirmation variable prevents accidental execution:

```bash
RESTORE_DATABASE_URL='<empty-restore-target>' \
ALLOW_DATABASE_RESTORE=YES \
scripts/database-restore.sh /secure/backups/coditent-YYYYMMDDTHHMMSSZ.dump
```

Then point a disposable API instance at the restored target with `APP_ENV=test`, run `alembic current`, `/ready`, and the critical candidate-to-hire smoke test. `scripts/test-backup-restore.sh` performs an automated marker-table round trip against two disposable databases and is run in CI.

## Migration-compatible rollback

1. Stop new writes and record the deployed commit and Alembic revision.
2. Take and verify a fresh backup before any rollback.
3. Prefer rolling the application forward with a corrective migration. Do not run Alembic downgrade in production unless the specific migration downgrade has been tested against a restored copy.
4. If application rollback is compatible with the current schema, deploy the previous tested image digest without changing the database.
5. If schema restoration is necessary, create a new database, restore the pre-migration archive there, verify migrations/readiness, then switch the secret-managed connection during an approved maintenance window.
6. Preserve the failed database for investigation; never overwrite the only recoverable copy.

Production restore and storage-provider recovery remain external operator actions and must not be reported as completed without drill evidence from the target environment.
