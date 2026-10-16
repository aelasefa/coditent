# Secret rotation and historical exposure runbook

This runbook intentionally contains variable names and placeholders only. Do
not paste credential values into issues, chat, logs, pull requests, or command
history.

Removing a value from the current tree does not revoke it or remove it from Git
history. Treat every credential found in the audit baseline or an earlier
commit as compromised until its provider confirms revocation.

## Immediate containment

1. Restrict production deployment access and preserve an audit record of who
   performed each rotation.
2. Rotate credentials in the provider dashboard first, store each replacement
   in the approved CI/host secret store, deploy, verify, and then revoke the old
   credential. Use overlapping validity only where the provider supports it.
3. Never validate an old credential by using it. Confirm revocation through the
   provider dashboard or audit log.
4. Invalidate active application sessions after signing-key, password, or
   factor changes. The session-registry deployment step must precede revoking
   an old signing key.

## Provider checklist

| Secret | Provider action | Repository/runtime name | Evidence to retain |
| --- | --- | --- | --- |
| PostgreSQL | Create a replacement database password/role with least privilege, update pooled and migration URLs, smoke-test, then revoke the old role/password. | `DATABASE_URL` | Provider audit event, deployment ID, connection and migration checks |
| JWT signing key | Generate at least 32 random bytes in the secret manager, deploy it as the active key, invalidate existing sessions, then remove the previous verification key after the maximum token lifetime. | `JWT_SECRET` | Secret version IDs, deployment ID, rejected-old-session test |
| TOTP encryption key | Generate a Fernet key with `Fernet.generate_key()`. Back up the active key in the secret manager before migration. Rotate only through a migration that decrypts with the old key and encrypts with the new key; never replace it in place while factors exist. | `TOTP_ENCRYPTION_KEY` | Secret version IDs, migrated-factor count, successful TOTP test, old-key retirement record |
| Email-outbox encryption key | Generate an independent Fernet key. Rotate with a dual-key migration: stop producers, drain/re-encrypt pending rows, deploy the new key, verify one sandbox delivery, then retire the old secret version. Never replace it while pending/retry rows remain. | `EMAIL_OUTBOX_ENCRYPTION_KEY` | Secret version IDs, pending-row count before/after, re-encryption audit, sandbox delivery ID |
| Gemini | Create a new restricted API key, set API/application restrictions and quotas, deploy, verify the configured model, then revoke the prior key. | `GEMINI_API_KEY` | Key ID, restrictions, quota evidence, provider audit event |
| Resend | Create a new sending key scoped to the verified domain, deploy and send an authorized sandbox message, then revoke the old key. | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Key ID, domain status, sandbox delivery event |
| Platform admin | Reset through the protected administrative recovery procedure, require the shared password policy and MFA, and revoke all sessions. Never seed a reusable production password. | deployment-specific admin account; no committed value | Account audit event, MFA enrollment, session-revocation event |
| Supabase service role | Rotate from the Supabase dashboard, update backend-only stores, deploy, verify Storage/DB paths, then revoke the old key. | `SUPABASE_SERVICE_KEY` | Project audit log and deployment ID |

## Git history remediation (coordinated maintenance)

History rewriting is a separate, disruptive operation and is not performed by
normal remediation commits. Schedule a maintenance window with all repository
collaborators, identify affected object IDs without copying secret contents,
create a protected backup, use `git filter-repo` with reviewed path/replacement
rules, and force-update every affected branch and tag. Invalidate old clones and
forks, require fresh clones, then run a full-history secret scan with redacted
output. Provider rotation is required even after a successful rewrite.

## Verification and rollback

- Verify the application starts with placeholders absent and injected values
  present only in the runtime secret store.
- Verify old sessions and old provider credential IDs are rejected without
  printing their values.
- If deployment fails, restore the previous application image while keeping
  newly issued credentials active; do not re-enable a compromised credential.
- Record external rotations as complete only with provider/dashboard evidence.
