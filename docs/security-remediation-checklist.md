# Coditent security and product remediation checklist

Branch: `codex/security-review-remediation`

Audit baseline: `3880510632fba213331e2bc10411870dde2a6b09`

Re-audit target at start: `b7219a5cd99fefb801e64683c55a07c163796ead`

## Status legend

- `AUDITING`: current behavior is being rechecked against the finding.
- `FIXED_VERIFIED`: implementation and deterministic regression evidence are complete.
- `ALREADY_FIXED_VERIFIED`: current branch already contained the complete fix and it was reverified.
- `EXTERNAL_PENDING`: repository implementation is complete, but a provider/dashboard/production action remains.
- `BLOCKED`: required evidence or authority is unavailable and no further safe repository work is possible.

## Missing review inputs

The task references `Coditent_Backend_Security_Review.md`, `Coditent_Review_Evidence.zip`,
`en.subject.md`, and `CODITENT PROGRAM.md`. They were not present in the supplied attachment,
working tree, Git history available locally, or publicly discoverable under those filenames at
the start of the remediation. Work proceeds from the complete S01-S18/B01-B14 descriptions in
the supplied task. Exact report evidence mappings and the final school-module selection remain
pending those files.

## Security findings

| ID | Status | Affected files | Fix/evidence | Regression test | External dependency |
|---|---|---|---|---|---|
| S01 | AUDITING | TBD | Historical secrets and rotation/session invalidation | TBD | Credential rotation and any shared-history rewrite |
| S02 | FIXED_VERIFIED | `apps/api/app/routers/auth.py`, `apps/api/app/schemas.py`, `apps/web/src/lib/api.ts`, registration/verification pages | Registration returns an opaque attempt UUID; re-registration atomically rotates id, name, password hash, OTP, expiry, attempts, and timestamps under the email row lock. Verify/resend require matching id+email, so stale codes and attempt IDs cannot cross bundles. Email failure rolls the complete rotation back. | `test_reregister_rotates_the_complete_attempt_bundle`; `test_concurrent_registration_attempts_never_mix_identity_bundle` — 2 passed in API container; frontend `tsc --noEmit` passed | None |
| S03 | AUDITING | TBD | MFA completion across password/OAuth | TBD | OAuth provider sandbox smoke tests |
| S04 | AUDITING | TBD | Token purpose and socket tickets | TBD | None expected |
| S05 | AUDITING | TBD | Owner-bound immutable CV references | TBD | Authorized Storage/RLS verification |
| S06 | AUDITING | TBD | Live chat authorization revocation | TBD | Multi-instance test infrastructure |
| S07 | AUDITING | TBD | Short database lifetime and socket bounds | TBD | Multi-instance test infrastructure |
| S08 | AUDITING | TBD | Production ingress/cookies/origins/ports | TBD | Production ingress verification |
| S09 | AUDITING | TBD | Vault/root credential and WAF boundary | TBD | Production secret manager/WAF verification |
| S10 | AUDITING | TBD | Authenticated and budgeted AI routes | TBD | Provider quota/billing verification |
| S11 | AUDITING | TBD | Safe OAuth identity linking/state/PKCE/nonce | TBD | Provider configuration verification |
| S12 | AUDITING | TBD | Sessions/logout/revocation/CSRF | TBD | None expected |
| S13 | AUDITING | TBD | Bounded uploads/parsing and async blocking work | TBD | Sandbox resource tests |
| S14 | AUDITING | TBD | Bounded metrics labels | TBD | None expected |
| S15 | AUDITING | TBD | Sensitive-data log redaction | TBD | Retention/access policy verification |
| S16 | AUDITING | TBD | Central password policy, Argon2id, encrypted MFA | TBD | Protected encryption key provisioning |
| S17 | AUDITING | TBD | Patched/locked dependencies and Google Gen AI SDK | TBD | Official advisory/provider smoke checks |
| S18 | AUDITING | TBD | Trusted deploy provenance/non-root/RLS boundaries | TBD | Authorized production database/Storage checks |

## Functional findings

| ID | Status | Affected files | Fix/evidence | Regression test | External dependency |
|---|---|---|---|---|---|
| B01 | AUDITING | TBD | Recommendation pagination/idempotency/fresh offers | TBD | None expected |
| B02 | AUDITING | TBD | `CompanyOut` serialization and owner assignment | TBD | Ambiguous legacy owner rows require operator review |
| B03 | AUDITING | TBD | Current company membership/legacy request flow | TBD | Product decision if legacy flow is retired |
| B04 | AUDITING | TBD | Offer close/delete retention and application conflicts | TBD | Retention-policy approval |
| B05 | AUDITING | TBD | Authorized stage transitions/evidence/concurrency | TBD | Workflow-policy approval |
| B06 | AUDITING | TBD | Email MIME/compression and reliable delivery state | TBD | Provider delivery smoke tests |
| B07 | AUDITING | TBD | Failure-safe CV/logo replacement and snapshots | TBD | Authorized Storage tests |
| B08 | AUDITING | TBD | Durable background jobs/stale-result rejection | TBD | Worker crash integration environment |
| B09 | AUDITING | TBD | Cursor chat history and multi-process routing | TBD | Redis multi-instance integration environment |
| B10 | AUDITING | TBD | Typed bounded schemas and offer fields/contracts | TBD | OpenAPI client generation decision |
| B11 | AUDITING | TBD | Liveness/readiness/deploy verification | TBD | Production smoke verification |
| B12 | AUDITING | TBD | Ansible dependencies/backup/restore/rollback | TBD | Authorized restore target |
| B13 | AUDITING | TBD | Admin data queries, Redis invalidation, repo/test hygiene | TBD | None expected |
| B14 | AUDITING | TBD | Correct `CV_NO_TEXT` exception ordering | TBD | None expected |

## Product and school workstreams

| Workstream | Status | Evidence/tests | External dependency |
|---|---|---|---|
| Practical assessments | AUDITING | Existing assessment surface is being inventoried | Isolated runner if submitted code is executed |
| Practice missions and validated skills | AUDITING | TBD | Isolated runner if submitted code is executed |
| Interview scheduling and feedback | AUDITING | TBD | Calendar integration only if later authorized/configured |
| Notifications and preferences | AUDITING | TBD | Push/email provider production verification |
| Account recovery | AUDITING | TBD | Email provider production verification |
| Data export/deletion/retention | AUDITING | TBD | Final retention policy approval |
| Subscription/entitlements | AUDITING | TBD | Payment/provider configuration; no fabricated payments |
| Institution membership/licensing | AUDITING | TBD | Institution contract/configuration verification |
| School module plan (minimum 14 points) | BLOCKED | Requires the missing school subject/program files for an authoritative selection | Attach `en.subject.md` and `CODITENT PROGRAM.md` |

## Validation log

Commands and results are appended here as fixes land. Passing tests with skips are recorded with
their skip counts and are never treated as verification of the skipped behavior.

- 2026-10-01: `docker compose exec -T api python -m pytest tests/test_email_otp.py -q -k 'reregister_rotates or concurrent_registration_attempts'` -> `2 passed, 18 deselected`.
- 2026-10-01: `apps/web/node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json` -> passed.
