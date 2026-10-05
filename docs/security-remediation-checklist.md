# Coditent security, reliability, and product remediation checklist

Branch: `codex/security-review-remediation`

Audit baseline: `3880510632fba213331e2bc10411870dde2a6b09`

Current migration head: `y1a2b3c4d5e6`

## Status legend

- `FIXED_VERIFIED`: repository implementation and deterministic regression evidence are complete.
- `EXTERNAL_PENDING`: feasible repository implementation is complete, but a named provider/production action remains.
- `PARTIAL`: repository work remains; it is not counted as resolved.
- `BLOCKED`: authoritative input or permission is missing and no safe substitute can prove completion.

The referenced review Markdown, evidence ZIP, `en.subject.md`, and `CODITENT PROGRAM.md` were not present in the attachment, working tree, or locally available history. This checklist maps the complete S01–S18/B01–B14 text supplied by the user. The exact school point calculation remains blocked on the missing subject/program files; implemented product requirements are recorded independently below.

## Security findings

| ID | Status | Implementation evidence | Regression evidence | External action |
|---|---|---|---|---|
| S01 | EXTERNAL_PENDING | Placeholder-only examples, secret validation, Gitleaks CI/pre-commit, independent JWT/TOTP/email keys, auth-version session invalidation; rotation runbook in `docs/security/secret-rotation.md` | `test_secret_configuration.py`, `test_production_boundary.py`, CI secret scan | Rotate database, JWT, Gemini, Resend, and historical admin credentials; decide and coordinate shared Git-history rewrite |
| S02 | FIXED_VERIFIED | `routers/auth.py` binds name/password/OTP/email to an opaque registration attempt and rotates the whole row under lock | Concurrent/re-registration cases in `test_email_otp.py` | None |
| S03 | EXTERNAL_PENDING | Shared auth completion enforces local MFA for password/OAuth; atomic MFA challenges and trusted-device revocation | `test_two_factor.py`, `test_oauth_popup.py`, `test_passwords.py` | Google/LinkedIn sandbox smoke test |
| S04 | FIXED_VERIFIED | Purpose-specific access/MFA/trusted/socket credentials; access validation verifies subject, purpose, auth version, account/session state; single-use socket tickets | `test_two_factor.py`, `test_socket_tickets.py`, recruitment socket tests | None |
| S05 | EXTERNAL_PENDING | Immutable owner-bound `CVAsset`, server-derived application snapshot, ownership checks before download/storage/AI | `test_cv_asset_lifecycle.py`, `test_cv_auth.py`, `test_recruiter_candidate_data.py` | Authorized Supabase Storage/RLS smoke test |
| S06 | FIXED_VERIFIED | Recruitment sockets revalidate candidate, responsible HR, stage, account, and session; Redis fan-out revocation/read events; bounded clients | chat realtime/access suites, reassignment/stage/token cases | Multi-host production soak remains operational verification |
| S07 | FIXED_VERIFIED | Short event-scoped DB sessions, no session held while awaiting socket input, heartbeat/expiry/rate/backpressure controls | `test_chat_realtime.py`, `test_recruitment_read_events.py` | None |
| S08 | EXTERNAL_PENDING | Production settings require HTTPS/Secure cookies/explicit origins; direct API/Redis ports loopback-only; one proxy ingress; readiness-gated deploy | `test_production_boundary.py`, Compose/Ansible checks | Verify actual public ingress, redirects, origins, and closed security-group ports |
| S09 | EXTERNAL_PENDING | Checked-in Vault root credential removed; production secret variables are injected; ingress/WAF guidance targets actual proxy | config/deployment tests | Provision production secret manager and verify WAF JSON rules with legitimate traffic |
| S10 | EXTERNAL_PENDING | Authenticated Next.js proxy and Python AI routes, shared Redis quotas/concurrency/global budget, bounded I/O, timeouts, durable queue, server entitlements | AI job/control, match, entitlement, and route tests | Verify provider quotas/billing alerts and selected model in authorized account |
| S11 | EXTERNAL_PENDING | Stable provider subject uniqueness, issuer/audience/email validation, browser-bound single-use state/handoff, PKCE/nonce where supported, explicit collision behavior | `test_oauth_popup.py` | Provider console redirect/origin and sandbox linking smoke tests |
| S12 | FIXED_VERIFIED | Server logout, cookie attributes, CSRF on cookie mutations, auth-version invalidation after password/recovery/deactivation, trusted-device revocation | password, recovery, token, OAuth tests | None |
| S13 | FIXED_VERIFIED | Streaming upload caps, signatures, ZIP/page/pixel/text/time bounds, off-event-loop storage/parser/email operations | upload/parser/logo/CV suites | Process-level parser sandbox is optional defense in depth |
| S14 | FIXED_VERIFIED | Route-template metrics and bounded unmatched label; request failures recorded | `test_observability.py` | None |
| S15 | EXTERNAL_PENDING | Recursive structured redaction; no JWT/token/OTP/password/email/CV/exception text; safe correlation IDs; raw access logs disabled | observability and production-boundary tests | Verify production sink retention, access, and deletion controls |
| S16 | EXTERNAL_PENDING | One 12–128/lower/upper/number/symbol policy across registration/invites/change/recovery; live UI indicators; Argon2id plus safe bcrypt migration; encrypted TOTP; replay-safe challenges/codes | `test_passwords.py`, `test_two_factor.py`, invitation/recovery tests | Provision and rotate protected TOTP/outbox keys |
| S17 | EXTERNAL_PENDING | Patched supported Next/React, hashed Python locks, Google Gen AI SDK, configurable model; advisory checks in CI | web lint/type/build/audit; backend imports/tests | Re-run official advisory/provider smoke checks at release time |
| S18 | EXTERNAL_PENDING | Pinned tested commit deploy, strict known-host verification, non-root/cap-drop images, declared Ansible collections | deployment/non-root/Ansible tests | Authorized production DB role/RLS/Storage verification and deployed digest check |

## Functional findings

| ID | Status | Implementation evidence | Regression evidence | External action |
|---|---|---|---|---|
| B01 | FIXED_VERIFIED | Read-only pagination; explicit idempotent initialization; conflict-safe all-offer/new-offer scoring | `test_match_scoring.py` (>20, offsets, concurrency) | None |
| B02 | FIXED_VERIFIED | Typed `CompanyOut`; owner assigned only after user flush; repair logic avoids ambiguous ownership | company invitation/admin tests | Review any ambiguous legacy owner rows manually |
| B03 | FIXED_VERIFIED | Current `COMPANY_USER` membership/roles used consistently; legacy recruiter role read-only compatibility | RBAC/request/company tests | None |
| B04 | FIXED_VERIFIED | Offers close instead of erasing recruitment history; inactive/expired rejection; unique concurrent application handling | offer/application lifecycle tests | Retention policy approval for production timelines |
| B05 | FIXED_VERIFIED | Transition graph, required interview evidence, row lock/version conflicts, terminal states, structured interview feedback | interview/application tests | None |
| B06 | EXTERNAL_PENDING | Correct JPEG CID assets; encrypted durable invitation/recovery/registration/email-change outbox with atomic domain intent, code expiry, supersession, leases, retries, idempotency, and visible state | `test_email_outbox.py`, `test_async_email_routes.py`, invitation/recovery/OTP tests | Configure and smoke-test outbox key/Resend in the deployment secret manager |
| B07 | EXTERNAL_PENDING | Upload-first/commit-reference/cleanup-old ordering for CV/logo/avatar; immutable application CV snapshots | asset lifecycle/logo/avatar tests | Authorized Storage failure smoke test |
| B08 | FIXED_VERIFIED | Transactional AI outbox, atomic claims, leases, bounded retry, crash recovery, fingerprints/stale rejection, shared validated contracts | `test_ai_jobs.py`, screening/match suites | None |
| B09 | FIXED_VERIFIED | Stable cursor pagination beyond 100, Redis cross-process fan-out/read receipts, direct/recruitment separation and one application conversation | chat history/realtime/no-duplicate/read suites | None |
| B10 | FIXED_VERIFIED | Bounded Pydantic create/patch schemas and explicit responses; full offer fields/lifecycle exposed; frontend types aligned | OpenAPI/typecheck and offer tests | Automated generated client remains optional |
| B11 | FIXED_VERIFIED | Separate live/ready; DB/Redis/worker/dispatcher checks; helpers fail closed; CI starts disposable PostgreSQL/Redis and runs API files | health/deployment tests and workflow inspection | Public production readiness smoke at deploy |
| B12 | EXTERNAL_PENDING | Declared Ansible collections; guarded checksum backup/restore scripts; migration-safe rollback runbook; CI round-trip drill | local PostgreSQL 18 drill: `Backup and restore drill passed`; shell syntax/Ansible CI | Run and record a restore drill in authorized production-like infrastructure and separately verify Storage recovery |
| B13 | FIXED_VERIFIED | Current roles in stats, paginated/admin joins, scan-based Redis invalidation, consolidated locks/assets, real isolated fixtures, API CI | admin/deployment/test suites | None |
| B14 | FIXED_VERIFIED | `NoExtractableTextError` precedes `ValueError`, returning `422 CV_NO_TEXT`; partial company patches preserved | `test_upload_routes.py`, company tests | None |

## Product and school workstreams

| Workstream | Status | Evidence | External action |
|---|---|---|---|
| Practice missions | FIXED_VERIFIED | Admin authoring/review UI and API, field/level attempts/progress, evidence-backed validated skills; `test_social_missions.py` | None |
| Interview scheduling/feedback | FIXED_VERIFIED | Versioned scheduling plus per-interviewer structured private feedback UI/API; `test_interview_feedback.py` | Calendar integration only if later authorized |
| Notifications/preferences | FIXED_VERIFIED | Durable owner-scoped notifications, unread/read-all/pagination, server-enforced preferences, candidate/company UI; `test_notifications.py` | Push/email notifications are not claimed |
| Account recovery | EXTERNAL_PENDING | Enumeration-resistant single-use hashed reset token, central password rules, session invalidation, UI; `test_account_recovery.py` | Configure and smoke-test email provider/outbox key |
| Data export/deletion/retention | EXTERNAL_PENDING | Reauthenticated JSON export; cancelable seven-day durable deletion; storage-first retry then anonymization; UI; `test_account_data_lifecycle.py` | Approve final legal retention periods and verify Storage deletion in authorized environment |
| Subscription/entitlements | FIXED_VERIFIED | Server plan/status/expiry, locked offer/member limits, pending invites reserve seats, owner/admin UI; `test_entitlements.py` | No payment collection claimed |
| Institution membership/licensing | FIXED_VERIFIED | Institution/admin/student/advisor memberships, locked seats, expiry/status/plan controls, admin UI; `test_institutions.py` | No contract or payment claimed |
| Friends/presence/avatar | FIXED_VERIFIED | Symmetric add/remove/list, bounded presence, secure private avatar upload/progress; social/avatar tests | None |
| Admin user/org lifecycle | FIXED_VERIFIED | Candidate-only creation, edit/deactivate, archive organization preserving history, session invalidation; admin tests | None |
| School module plan (minimum 14 points) | BLOCKED | Product capabilities above are implemented, but an authoritative point selection cannot be calculated without the referenced subject/program files | Attach `en.subject.md` and `CODITENT PROGRAM.md` |

## Validation log

- Registration race regressions: `2 passed`; password upgrade/change: `2 passed`.
- Upload/parser/logo/CV suites: 36 + 16 + 5 + 2 focused cases passed; owner-bound CV broad set passed.
- AI/CV/match focused broad run: `75 passed`.
- Admin/MFA/invitation/avatar focused run: `18 passed`; durable email outbox set: `8 passed`.
- Entitlement/recovery/email set: `5 passed`; notifications: `3 passed`.
- Recruitment access/message/read subset after Redis loop isolation fix: `4 passed`.
- Interview feedback: `2 passed`; account privacy + interview: `5 passed`; institutions: `2 passed`.
- Practice mission authoring/review: `3 passed`; durable expiring email delivery/route set: `6 passed`.
- Frontend: repeated `npx tsc --noEmit` passed; ESLint reports `0 errors, 21 pre-existing warnings`.
- Migrations applied through `z1a2b3c4d5e6 (head)` on the configured development database.
- Disposable PostgreSQL 18 backup/restore drill: `Backup and restore drill passed` with checksum validation.
- `python -m compileall` and `git diff --check` pass after each workstream.

## Required release configuration/actions

Set only through the deployment secret manager, using generated values: `DATABASE_URL`, `JWT_SECRET`, `TOTP_ENCRYPTION_KEY`, `EMAIL_OUTBOX_ENCRYPTION_KEY`, `GEMINI_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, OAuth client secrets, Supabase URL/service key, Redis URL, and production HTTPS origins. Follow `docs/security/secret-rotation.md` and `docs/operations/backup-restore-rollback.md`. Do not reuse historical values or place them in tracked files.

Run the end-to-end role, invitation, hiring, stage, chat, privacy, and recovery checks in `docs/operations/manual-hiring-e2e.md` against the exact release commit.
