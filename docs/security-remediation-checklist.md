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
| S13 | AUDITING | CV/logo upload routes, parser/storage/screening services, `apps/api/app/services/upload_limits.py` | Uploads now stop at MAX+1 while reading, route-level signature/container checks reject spoofed files, DOCX ZIP expansion/entry/ratio and PDF page limits are bounded, image dimensions/pixels are bounded, extraction text/time limits are applied, and document/storage work runs off the event loop. Blocking email calls are the remaining repository item in this finding. | CV upload 36 passed; logo 16 passed; route bounds 5 passed; upload reader 2 passed | Stronger process-level parser sandbox remains a deployment hardening option |
| S14 | FIXED_VERIFIED | `apps/api/app/observability.py`, `apps/api/tests/test_observability.py` | Metrics now use resolved route templates (or one `<unmatched>` bucket), normalize methods, and record failures in `finally`; request logs share the same bounded labels. | `test_route_labels_use_templates_and_bound_unmatched_paths`; `test_metrics_record_failures_under_the_route_template` | None |
| S15 | EXTERNAL_PENDING | `apps/api/app/observability.py`, `apps/api/app/main.py`, `apps/api/app/tasks.py`, AI/screening/email/invitation services, `docker-compose.yml`, `apps/api/start_api.sh`, `nginx/nginx.conf` | Recursive structured-log redaction covers credentials, tokens, cookies, OTPs, emails, CV text, connection passwords, JWTs, and secret query parameters. Raw provider/exception/model text was removed from logs, job state, and invitation responses; 500s expose only a correlation ID. Uvicorn raw access logs are disabled at both launch points and Nginx excludes query/referrer data. | `test_structured_and_free_form_secrets_are_redacted`; metrics tests; match-scoring no-secret fallback regression — 16 focused tests passed; runtime random token URL logged only as `<unmatched>` | Production log-retention, sink access controls, and deletion verification |
| S16 | AUDITING | TBD | Central password policy, Argon2id, encrypted MFA | TBD | Protected encryption key provisioning |
| S17 | AUDITING | TBD | Patched/locked dependencies and Google Gen AI SDK | TBD | Official advisory/provider smoke checks |
| S18 | AUDITING | TBD | Trusted deploy provenance/non-root/RLS boundaries | TBD | Authorized production database/Storage checks |

## Functional findings

| ID | Status | Affected files | Fix/evidence | Regression test | External dependency |
|---|---|---|---|---|---|
| B01 | FIXED_VERIFIED | `apps/api/app/services/match_scoring.py`, `apps/api/app/services/recommendation_jobs.py`, `apps/api/app/routers/recommendations.py`, schemas/models, `apps/web/src/lib/api.ts` | GET is now read-only and returns stable pagination metadata. Explicit POST initialization inserts all active offers with `ON CONFLICT DO NOTHING`; single-offer creation and scored-result writes are also conflict-safe. Frontend initializes explicitly and follows every 50-row page, so matches beyond 20 and newly published offers remain discoverable. Only real candidate accounts can access the flow. | `test_initialization_and_all_offsets_cover_more_than_twenty_matches`; `test_concurrent_initializers_are_conflict_safe`; full offline match suite — 15 passed; frontend typecheck and OpenAPI contract passed | None |
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
| B14 | FIXED_VERIFIED | `apps/api/app/routers/candidates.py`, `apps/api/tests/test_upload_routes.py` | `NoExtractableTextError` is caught before its `ValueError` base class and returns the documented `422` / `CV_NO_TEXT` response. | `test_no_text_cv_route_returns_documented_422` | None |

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
- 2026-10-01: `docker compose exec -T api python -m pytest tests/test_observability.py tests/test_match_scoring.py -q` -> `16 passed` (65 deprecation warnings; zero skips). `aiosqlite` was installed ephemerally in the running test container because it was absent from the image.
- 2026-10-01: `docker compose exec -T api python -m pytest tests/test_match_scoring.py -q` -> `15 passed` (126 deprecation warnings; zero skips), including 27-row pagination, a newly published offer, repeat initialization, and two concurrent initializers. Frontend `tsc --noEmit` and the live OpenAPI recommendation contract passed.
- 2026-10-01: host isolated upload/parser suites -> CV `36 passed`, logo `16 passed`, route bounds `5 passed` (3 deprecation warnings), bounded reader `2 passed`; compileall and diff-check passed.
