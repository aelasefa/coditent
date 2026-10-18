# CODITENT selected-module submission

Validated against the supplied **ft_transcendence subject v21.2** (`en.subject.pdf`, SHA-256 `7d1df8037f5222914f1fb842739993b366a3111ebeddce0ff16ffbab0659cbd5`). Last synchronized with the repository on **2026-10-16**.

## Score

| Result | Points |
|---|---:|
| Required minimum | 14 |
| Raw implemented modules | **22** |
| Maximum counted bonus | 5 |
| **Official counted score** | **19 / 19** |
| Raw buffer above the cap | **3** |

The project claims only the 16 modules below. Alternative framework minors, OAuth, accessibility, extra-browser compatibility, notifications, monitoring, gaming, blockchain, AI-category, and custom modules are excluded from this score. OAuth can be added only after a real configured-provider login is demonstrated; it is not included in the 22 raw points.

“Owner” means the primary evaluation and demonstration lead, chosen from the dominant repository history for the cited implementation. The code remains a team project.

## Selected modules

| ID | Selected module | Points | Owner | Why it qualifies | Primary evidence | Live demonstration |
|---|---|---:|---|---|---|---|
| W01 | Frontend + backend frameworks | 2 | mohammedelmahf | Next.js/React render the product UI and FastAPI exposes the domain API; neither is a decorative wrapper. | `apps/web/package.json`, `apps/api/app/main.py` | Start Compose, open the Next.js UI, call `/docs`, then perform one UI action that persists through FastAPI. |
| W04 | Realtime features | 2 | mohammedelmahf | Socket tickets, Redis cross-process fan-out, ordered events, heartbeat authorization, reconnect recovery, and revocation are implemented. | `apps/api/app/services/chat_realtime.py`, `apps/api/app/services/socket_tickets.py`, `apps/web/src/hooks/use-recruitment-chat-socket.ts`, `apps/api/tests/test_chat_realtime.py` | Open candidate and recruiter sessions, exchange messages, confirm immediate delivery/order/read state, disconnect one client, reconnect, and show recovered history. |
| W05 | User interaction | 2 | mohammedelmahf | Users have profiles, friend request/accept/remove flows, presence, and direct/recruitment chat. | `apps/api/app/routers/friends.py`, `apps/api/app/routers/chat.py`, `apps/web/src/app/dashboard/friends/page.tsx` | Send and accept a friend request, open the profile, exchange messages, and remove the friendship. |
| W07 | ORM | 1 | mohammedelmahf | SQLAlchemy 2 models and async sessions own relational access; Alembic maintains PostgreSQL schema history. | `apps/api/app/models.py`, `apps/api/app/database.py`, `apps/api/alembic/versions/` | Show one model/query path, run `alembic current`, and run a PostgreSQL integrity test. |
| W10 | Server-side rendering | 1 | mohammedelmahf | Public category pages fetch offer data and metadata on the Next.js server. | `apps/web/src/app/offers/[category]/page.tsx`, `apps/web/src/lib/offer-category.ts` | Disable JavaScript or use `curl` and show an offer title/company already present in returned HTML. |
| W11 | Progressive Web App | 1 | mohammedelmahf | Install manifest, icons, service-worker registration, versioned caching, and a dedicated offline route are present. | `apps/web/public/manifest.webmanifest`, `apps/web/public/sw.js`, `apps/web/src/components/pwa-registration.tsx` | Inspect the manifest/service worker, install the app, cache a public page, go offline, and show the offline experience. |
| W12 | Custom design system | 1 | Ilyas El Asefar | Shared tokens, typography, icon rules, focus states, and more than ten reusable UI components are used across role surfaces. | `apps/web/src/app/globals.css`, `apps/web/src/components/ui/` | Show the token definitions and the same Button, Dialog, Input, Tabs, Toast, Skeleton, Badge, and navigation primitives across candidate/company/admin pages. |
| W13 | Advanced search | 1 | mohammedelmahf | Opportunity discovery combines text, field, region, type and work-mode filtering with sorting and pagination. | `apps/web/src/lib/discover-search.ts`, `apps/web/src/components/candidate/filter-bar.tsx`, `apps/web/tests/discover-search.test.mts` | Apply several filters, change sort order, move between result pages, clear the search, and show the URL/state remains coherent. |
| W14 | File upload and management | 1 | mohammedelmahf | Avatar, CV, and logo workflows validate type, size and content on client/server, use private storage, display progress, support download/preview where applicable, replacement, and deletion. | `apps/web/src/lib/file-validation.ts`, `apps/api/app/routers/candidates.py`, `apps/api/app/services/cv_storage.py`, `apps/api/tests/test_upload_limits.py` | Upload a valid PDF CV, reject an invalid or oversized file, download it through authorization, replace it, then delete it. Repeat the visible flow for an image asset. |
| U01 | Standard user management | 2 | mohammedelmahf | Users edit profiles, manage avatars with fallbacks, maintain friends, view profiles, and observe bounded multi-tab presence. | `apps/web/src/app/dashboard/profile/page.tsx`, `apps/api/app/routers/friends.py`, `apps/web/src/components/candidate/candidate-presence.tsx` | Edit and reload a profile, upload/remove an avatar, open a friend profile, and show online/offline status using two sessions. |
| U04 | Advanced permissions | 2 | mohammedelmahf | Platform roles and company roles expose distinct views/actions; administrators manage users while protected operations enforce server-side permission checks. User deletion uses retention-safe deactivation/anonymization. | `apps/api/app/core/permissions.py`, `apps/api/app/routers/admin.py`, `apps/api/tests/test_rbac.py`, `apps/api/tests/test_admin_lifecycle.py` | Compare candidate/company/admin navigation, attempt the same action with allowed and denied roles, change a company role, and deactivate a user. |
| U05 | Organization system | 2 | mohammedelmahf | Companies can be created, viewed, edited and retention-safely archived; owners/admins add, remove and re-role members; organization actions are role-scoped. | `apps/api/app/routers/companies.py`, `apps/api/app/routers/invitations.py`, `apps/web/src/app/company/team/page.tsx` | Create/invite a company owner, edit company details, invite and re-role a member, deny a forbidden member action, remove the member, and archive the company. |
| U06 | Complete two-factor authentication | 1 | mohammedelmahf | TOTP enrollment, encrypted secrets, login challenge, one-time recovery codes, trusted devices, disable flow, replay protection, and session/socket revocation are implemented. | `apps/api/app/routers/two_factor.py`, `apps/api/app/services/two_factor.py`, `apps/web/src/components/security/two-factor-security.tsx`, `apps/api/tests/test_two_factor.py` | Enroll with a real authenticator, save recovery codes, log out/in through the challenge, reject a replayed code, use one recovery code once, then disable 2FA. |
| D04 | Health/status and backup/disaster recovery | 1 | mohammedelmahf | Liveness and dependency readiness, a public status page, encrypted offsite backup automation, retention, and restore tooling are implemented. | `apps/api/app/health.py`, `apps/web/src/app/status/page.tsx`, `ansible/roles/coditent/tasks/backups.yml`, `scripts/test-backup-restore.sh` | Show healthy Compose services and `/ready`, stop one dependency to show failure, restore it, inspect a backup object/checksum, and complete a disposable restore drill. |
| N02 | Data export/import | 1 | mohammedelmahf | Authenticated exports support JSON, CSV and XML; JSON profile imports are schema-checked, size-limited, field-whitelisted, and applied atomically. | `apps/api/app/services/privacy.py`, `apps/api/app/routers/auth.py`, `apps/web/src/components/security/account-data-controls.tsx` | Export all three formats, inspect readable content, modify an allowed JSON profile field, import it, reload the profile, then reject malformed/oversized input. |
| N03 | GDPR-oriented data lifecycle | 1 | mohammedelmahf | Users can request readable data, confirm deletion with current credentials, cancel during a seven-day grace period, remove private files, anonymize retained integrity rows, and receive durable operation emails. This is a product module claim, not legal certification. | `apps/api/app/services/privacy.py`, `apps/api/app/services/email_outbox.py`, `apps/api/tests/test_account_data_lifecycle.py` | Schedule deletion, show the execution date, cancel it, reschedule in a disposable account, run the deletion worker, and show files/direct identity removed, retained rows anonymized, login denied, and confirmation delivery recorded. |

## Arithmetic

```text
Major modules: W01 2 + W04 2 + W05 2 + U01 2 + U04 2 + U05 2 = 12
Minor modules: W07 + W10 + W11 + W12 + W13 + W14 + U06 + D04 + N02 + N03 = 10
Raw total: 12 + 10 = 22
Official result: min(22, 14 required + 5 bonus) = 19 / 19
Uncounted raw buffer: 22 - 19 = 3
```

## Evaluation sequence

Use this order so later modules reuse established state:

1. Run `docker compose up --build`; show all six required services healthy and `/ready` successful.
2. Register and verify a candidate; log in and complete the profile.
3. Demonstrate SSR, PWA, design system, search, and file management.
4. Create/invite a company and compare OWNER, HR/RECRUITER, candidate, and platform-admin permissions.
5. Publish an offer, apply, screen, schedule an interview, and move through stages.
6. Use two simultaneous sessions for friend, presence, recruitment chat, ordering, reconnect, and revocation behavior.
7. Enroll and exercise 2FA including recovery and disable.
8. Export/import data, then demonstrate the cancelable deletion lifecycle with a disposable account.
9. Show status/readiness, the backup job, and the disposable restore drill.
10. End with the score arithmetic: **22 raw, 19/19 counted, 3-point buffer**.

## Required provider evidence

Source and local tests do not prove external configuration. For full live evidence, the evaluation environment must provide:

- trusted TLS and working DNS for `coditent.app`;
- Resend delivery from the configured `notifications@coditent.app` identity;
- Supabase private bucket upload/download/delete access;
- Google Gemini responses for the AI-supported hiring workflow;
- two concurrent browser sessions for realtime behavior; and
- the configured offsite backup bucket and restore credentials.

If one of these is unavailable, describe it as missing external proof. Do not replace it with a mocked success.

## Unclaimed implementation

- **OAuth (U03):** implemented and tested locally, but excluded until a real Google or LinkedIn authorization/callback is completed.
- **Accessibility (A01):** many accessible primitives and keyboard behaviors exist, but complete WCAG 2.1 AA and assistive-technology proof are not claimed.
- **Extra browsers (A04):** not claimed without full feature passes in two browsers beyond mandatory Chrome.
- **Notifications (W08):** useful notifications exist, but the subject’s complete create/update/delete coverage is not claimed.
- **AI-category modules:** Gemini supports product workflows, but the implementation does not meet the subject’s streaming LLM, continuously learning recommendation, full RAG, or AI moderation definitions.
- **Monitoring, game, blockchain, and custom modules:** not claimed.
