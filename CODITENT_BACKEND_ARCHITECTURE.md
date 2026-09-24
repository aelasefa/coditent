# CODITENT Backend Architecture

> Read-only audit of the repository as found. No code was changed to produce this document.
> Evidence format is `path:lines`. Claims without a citation are labeled UNCERTAIN.

## 1. Backend executive overview

- **Framework:** FastAPI (unpinned in `apps/api/requirements.txt:1-22`), **Python 3.12** (`apps/api/Dockerfile:1`, CI `setup-python 3.12` in `.github/workflows/deploy.yml:52-55,87-89`).
- **Entry point:** `apps/api/app/main.py` — builds `FastAPI(title="CODITENT API", version="1.0.0")` (`main.py:17-21`), no lifespan handlers.
- **How it starts:** `docker-compose.yml:23-25` runs `sh -c "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8001"`; fallback `CMD` in `apps/api/Dockerfile:19`. Healthcheck polls `http://localhost:8001/health` (`docker-compose.yml:27-34`).
- **Database:** Supabase-hosted PostgreSQL only. SQLAlchemy 2 async (`asyncpg`) via `apps/api/app/database.py:36-47` (PgBouncer-safe: `statement_cache_size=0`, `pool_pre_ping=True`). Local DB markers are rejected at startup (`app/database.py:9-33`, `app/config.py:47-54`).
- **ORM:** SQLAlchemy `DeclarativeBase` (`app/database.py:50-56`), per-request `AsyncSession` (`get_db`).
- **Authentication:** custom JWT (HS256, `python-jose`), **not Supabase Auth**. `get_current_user` (`app/dependencies.py:20-48`): `HTTPBearer(auto_error=False)` first, HttpOnly `access_token` cookie fallback, `sub`→UUID→DB row lookup. Authority is `public.users`, never `auth.users`.
- **Supabase integration:** Postgres hosting + Storage only. Python `supabase` client used solely by `app/services/cv_storage.py:6`. No Supabase Auth usage for app users.
- **Redis:** `redis:7-alpine` (`docker-compose.yml`), lazy sync/async clients (`app/cache.py:12-23`). Uses: Celery broker+backend, recommendation result cache, recommendation job-status keys.
- **Celery:** `Celery("coditent")`, JSON serialization (`app/tasks.py:15-20`). Worker: `celery -A app.tasks worker` (`docker-compose.yml:52-59`). Two tasks: `recommendations.generate`, `applications.screen`.
- **AI provider:** Google Gemini only, model `gemini-3-flash-preview` in all three backend call sites (`services/ai.py:14`, `services/cv_extraction.py:71-77`, `services/screening.py:26-27`). Key from `GEMINI_API_KEY` (name only, never logged).
- **File/CV storage:** Supabase Storage bucket `candidate-cvs`, path `{user_id}/{uuid}_{safe}.{ext}` (`services/cv_storage.py:9,24-25`).
- **Email provider:** Resend via stdlib `urllib` (`services/email.py:1-42`). Sends: OTP codes, company invites, employee invites. Nothing else emails.
- **WebSocket/realtime:** `WS /chat/recruitment/{application_id}/ws?token=JWT` (`routers/chat.py:433-529`), in-memory fan-out (single replica), 3 s polling fallback in frontend.
- **Deployment:** push to `main` → GitHub Actions (lint/build/test) → Ansible to EC2 `34.205.255.37` (`ansible/inventory/hosts.ini:2`, `.github/workflows/deploy.yml:77-120`). Backend served on `:8001` behind host nginx (`:80/443`).
- **Production services:** `coditent-api` (uvicorn), `coditent-worker` (celery), `coditent-redis`, `coditent-web` (Next.js `:3001`), Supabase Postgres, Resend, Gemini.
- **Configuration:** `pydantic-settings` (`app/config.py:5-38`), `.env` file, `extra="ignore"`. Frontend-safe vars are `NEXT_PUBLIC_*` only.

### Real architecture diagram

```
Browser (Next.js on Vercel :443 / local :3001)
  ↓  same-origin /api-proxy/* rewrite → backend (mixed-content avoidance)
FastAPI (:8001, uvicorn) — routers/*, CORS allow frontend origins
  ↓  HTTPBearer(JWT) or access_token cookie → get_current_user → public.users row
  ↓  require_* gates + can(role, action) matrix
  ├─→ Services (direct calls): screening, CV parse/extract, email, audit
  ├─→ PostgreSQL/Supabase via SQLAlchemy+asyncpg (RLS bypassed; FastAPI enforces)
  ├─→ Redis: recommendation cache + job keys; Celery broker/backend
  ├─→ Celery worker: recommendations.generate, applications.screen (Gemini)
  ├─→ Supabase Storage: candidate-cvs bucket (service-role key, backend only)
  ├─→ Resend: OTP + invitation emails (nothing else)
  └─→ Gemini gemini-3-flash-preview: ranking, screening, CV extraction
       (Bio generation is frontend-only: apps/web/src/app/api/ai/generate-bio/route.ts)
```

## 2. Project structure

| PATH | PURPOSE | USED BY | IMPORTANT DEPENDENCIES |
|---|---|---|---|
| `apps/api/app/main.py` | App factory: routers, CORS, rate-limit, metrics, `/health`, `/metrics`, `/protected` | uvicorn, deploy healthcheck | `app/routers/*`, `app/config.py`, `slowapi` |
| `apps/api/app/config.py` | `Settings` (pydantic-settings, `.env`) | everything via `settings` | env names only — see §31 |
| `apps/api/app/database.py` | Async engine (PgBouncer-safe), sessions, Supabase-only guard | all routers, tasks, tests | `sqlalchemy[asyncio]`, `asyncpg` |
| `apps/api/app/models.py` | All ORM tables (320 lines) | routers, services, tasks | `app/database.py:Base` |
| `apps/api/app/schemas.py` | Pydantic request/response models | routers (validation, `response_model`) | pydantic |
| `apps/api/app/routers/` | 12 routers, each mounted with prefix in `main.py:45-56` | HTTP layer only | `app/dependencies.py`, `app/core/permissions.py` |
| `apps/api/app/dependencies.py` | `get_current_user`, `require_*` gates, pagination | every protected endpoint | `HTTPBearer`, `app/utils/jwt.py` |
| `apps/api/app/core/permissions.py` | `can(role, action)` matrix + `VALID_COMPANY_ROLES` | routers, mirrored in `web/src/lib/permissions.ts` | none |
| `apps/api/app/core/audit.py` | `log_audit()` → `AdminActivityLog` | offer/company/application/invitation writes | own DB commit (failure swallowed) |
| `apps/api/app/utils/jwt.py` | `create_access_token`, `verify_token` (HS256, exp) | auth router, chat WS, tests | `python-jose`, `settings.secret_key` |
| `apps/api/app/services/` | `ai.py` (ranking), `screening.py`, `cv_parser.py`, `cv_extraction.py`, `cv_storage.py`, `email.py`, `email_verification.py`, `oauth_service.py`, `recruitment_chat.py`, `admin_seed.py`, `recommendation_jobs.py` | routers, tasks | Gemini SDK, Supabase client, Resend |
| `apps/api/app/tasks.py` | Celery app + 2 tasks + per-job event-loop/engine.dispose pattern | worker process | Celery, Redis, `app.database:engine` |
| `apps/api/app/cache.py` | Lazy sync/async Redis singletons | routers, tasks | `redis` |
| `apps/api/app/observability.py` | structlog loggers, Prometheus metrics | `main.py`, services | `structlog`, `prometheus-client` |
| `apps/api/app/limiter.py` | slowapi `Limiter` (per-IP) | auth OTP/register/login, others | `slowapi` |
| `apps/api/alembic/` | 15 version files, async env, empty `sqlalchemy.url` (injected) | container start (`alembic upgrade head`) | `app.models:Base` |
| `apps/api/tests/` | 8 suites (live-DB + offline unit mix) | CI (import check only), manual runs | `httpx`, live `localhost:8001` + DB session |
| `apps/api/app/db.py` | Supabase admin client factory (backend-only) | `services/cv_storage.py` | `supabase` package, service-role key |
| `apps/web/src/lib/api.ts` | Axios client, base-URL resolution, Bearer injection, 401 redirect | all frontend pages | `coditent_token` localStorage |
| `apps/web/src/middleware.ts` | Edge route protection + role redirects + `?next=` | all page loads | Supabase cookie refresh only |
| `docker-compose.yml` | api/worker/redis/web services, ports, healthchecks | local dev + prod parity | — |
| `.github/workflows/deploy.yml` | CI (lint/build/imports) + CD (Ansible on push to `main`) | releases | secrets: `DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`, `EC2_SSH_KEY`, `EC2_HOST` |
| `ansible/` | EC2 provisioning/deploy/rollback, nginx, env templates | production ops | `inventory/hosts.ini:2` → `34.205.255.37` |
| `apps/web/next.config.mjs` | `/api-proxy/:path*` rewrite → backend; image hosts `media.licdn.com`, `lh3.googleusercontent.com` | prod mixed-content avoidance | `NEXT_PUBLIC_API_URL` at build time |

## 3. Database architecture

Conventions: UUID PKs (`default=uuid4`), `created_at default=utcnow` (naive datetimes throughout). **No `ondelete` unless noted** — most FKs are `NO ACTION`: deleting a referenced row is blocked or orphans.

- **`users`** (`models.py:61-88`): identity for candidates, company users, platform admins. Cols: `id` UUID PK; `email` String UNIQUE NOT NULL; `password_hash` NOT NULL; `role` Enum(`UserRole`) default CANDIDATE; `is_approved` Bool default False; `full_name` NOT NULL; `oauth_provider` String(30) NULL; `oauth_id` String(120) NULL (no unique — duplicate OAuth link possible); `avatar_url` NULL; `company_id` FK→`companies.id` NULL no-delete; `company_role` free-text String NULL (validated by `VALID_COMPANY_ROLES`, not DB enum); `created_at`. Indexes `ix_users_email`, `ix_users_role`. Rels: `company` M2O, `profile` 1-1, `offers` 1-M (via `Offer.recruiter_id`), `recommendations` 1-M. Used by: everything.
- **`candidate_profiles`** (`models.py:91-115`): 1-1 CV extension. `id` PK, `user_id` FK→users UNIQUE NOT NULL (no ondelete — deleting a user orphans/blocks profile). All content cols NULL: `city, phone, headline(120), bio(Text), field_of_study, university, study_level(Enum), skills(Text), years_of_experience(Int), linkedin_url, portfolio_url, languages, cv_url, desired_opportunity_type, desired_location, overall_score(Int), validated_skills(Text)`, `updated_at` NULL. Used by: `routers/candidates.py`, `auth.py` (creation), `services/{recommendation_jobs,ai,screening}.py`.
- **`offers`** (`models.py:118-164`, table `offers`, app calls them opportunities): `id` PK; `recruiter_id` FK→users NOT NULL (legacy owner); `title, company(free text), region, field, type(Enum OfferType), description, requirements` NOT NULL; `company_id, created_by, responsible_hr_id` FKs NULL no-delete; `location, work_mode, required_skills, required_experience, education_requirements, salary_min/max, deadline` NULL; `opportunity_status` free String default `"active"` (NOT the `OfferStatus` enum); `active` Bool default True; `posted_at`. Indexes on `recruiter_id`, `company_id`. Rels: `recruiter/responsible_hr/company_obj` M2O, `recommendations/applications` 1-M. Used by: offers/applications/recommendations/assessments/admin routers, screening, chat.
- **`saved_recommendations`** (`models.py:167-183`): cached candidate↔offer AI match. `id` PK; `candidate_id, offer_id` FKs NOT NULL no-delete; `ai_score` Int NOT NULL; `ai_reasoning` Text NOT NULL; `created_at`. UNIQUE `(candidate_id, offer_id)` (`uq_saved_recommendations_candidate_offer`); indexes on both FKs. Used by: recommendations router/service.
- **`companies`** (`models.py:192-213`): tenant. `id` PK; `name` UNIQUE NOT NULL; `status` free String default `"active"` (not `CompanyStatus` enum); `owner_id` FK→users NULL no-delete; `logo_url, industry, location, website, company_size, contact_email, contact_phone, region, description` NULL; `created_at`. Index + unique on `name`. Rels: `recruiters` 1-M users, `owner` M2O. Used by: companies/invitations/offers/requests/chat/admin routers.
- **`candidate_requests`** (`models.py:216-233`): company→candidate outreach. `id` PK; `candidate_id` FK→users CASCADE NOT NULL; `company_id` FK→companies CASCADE NOT NULL; `recruiter_id` FK→users SET NULL NULL; `message` NULL; `status` Enum(`RequestStatus`) default pending; `created_at`. No `(candidate,company)` unique — duplicates possible. Used by: requests + chat routers.
- **`chat_messages`** (`models.py:236-258`): `id` PK; `sender_id, receiver_id` FK→users CASCADE NOT NULL; `application_id` FK→applications CASCADE NULL; `content` Text NOT NULL; `created_at`. Indexes on all three FKs. No conversation table — one application = one logical conversation. Used by: chat router, recruitment_chat service.
- **`applications`** (`models.py:261-285`): `id` PK; `candidate_id` FK→users CASCADE NOT NULL; `opportunity_id` FK→offers CASCADE NOT NULL; `company_id` FK→companies NULL no-delete; `status` free String default `"applied"` (not `ApplicationStatus` enum); `cv_url, cover_letter` NULL; `ai_score` NULL Int; `ai_report` NULL Text; `ai_status` String default `"pending"`; timestamps. UNIQUE `(candidate_id, opportunity_id)` (`uq_applications_candidate_opportunity`); indexes on all three FKs. Used by: applications/assessments/chat routers, screening, tasks.
- **`assessments`** (`models.py:288-307`): `id` PK; `application_id` FK→applications CASCADE NOT NULL; `candidate_id` FK→users CASCADE NOT NULL; `created_by` FK→users NULL no-delete; `title` NOT NULL; `description` NULL; `status` free String default `"pending"`; `score` NULL; `report` NULL; `created_at`. Multiple per application allowed by design. Used by: assessments router (read-only).
- **`admin_activity_logs`** (`models.py:310-320`): append-only audit. `id` PK; `action` String(80); `admin_id` FK→users no-delete; `admin_email` NOT NULL (denormalized); `target_user_id` UUID NULL **no FK** (can dangle); `target_user_email` NULL; `details` NULL; `created_at`. No indexes. Used by: `core/audit.py`, admin/audit routers.
- **DB-only tables (raw SQL, no ORM model):** `company_invitations` (id PK, email, company_name, contact_name/role NULL, token_hash UNIQUE, status default pending, invited_by FK→users NULL, company_id FK→companies NULL, expires_at, created_at, accepted_at/revoked_at NULL); `employee_invitations` (same + company_id NOT NULL CASCADE, role NOT NULL); `pending_registrations` (id PK, email UNIQUE, full_name, password_hash, otp_hash, otp_expires_at, otp_attempts default 0, last_otp_sent_at, created_at). Used by: invitations router, auth OTP endpoints.
- Dead migration trace: `friendships` + `users.last_seen` created then dropped (`f9e1d2c3b4a5`, `a1b2c3d4e5f6`).

### ER diagram (real FKs; `*` nullable, `C` cascade, `N` set-null, `-` no action)

```
users --< users? no; companies.owner_id(*,-) points INTO users
companies --< users.company_id(*,-)            [members]
users --< candidate_profiles.user_id(1-1 UNIQUE,-)
users --< offers.recruiter_id(-), .created_by(*,-), .responsible_hr_id(*,-)
companies --< offers.company_id(*,-)
users + offers --< saved_recommendations [UQ pair] (-,-)
users(C) + companies(C) --< candidate_requests ; users --< requests.recruiter_id(*,N)
users(C) + offers(C) --< applications [UQ pair] ; companies --< applications.company_id(*,-)
applications(C) + users(C) --< assessments ; users --< assessments.created_by(*,-)
users(C) + users(C) + applications(C) --< chat_messages
users --< admin_activity_logs.admin_id(-)   [target_user_id: no FK]
[raw SQL] users/companies --< company_invitations ; companies(C)/users --< employee_invitations
[isolated] pending_registrations (no FKs)
```

### Flags
- **Orphan risks:** every `-` FK above (users.company_id, all offers FKs, profile.user_id, saved_recommendations, owner_id, applications.company_id, assessments.created_by, logs.admin_id).
- **Nullable ownership:** offers.company_id/created_by/responsible_hr_id, applications.company_id, companies.owner_id, users.company_id.
- **Dangerous cascades:** deleting a User/Offer cascades applications → assessments + application chat messages; deleting a User wipes all sent/received chat messages and requests. No soft-delete anywhere.
- **Uniqueness enforced:** users.email, companies.name, candidate_profiles.user_id, both UQ pairs, token_hashes, pending_registrations.email. **Missing:** oauth(provider,id), candidate_requests pair, free-text status/role columns (DB can't constrain them).
- **Drift:** invitation/OTP tables have no ORM relationships; audit `target_user_id` dangling possible.

## 4. Authentication flow

- **Authority is `public.users`, not Supabase `auth.users`.** `get_current_user` parses `sub`→UUID and loads the DB row (`dependencies.py:20-48`); role/company checks read the row, never the JWT `role` claim. Supabase is Postgres hosting + Storage; `middleware.ts:78-82` only refreshes Supabase cookies.
- **JWT** (`app/utils/jwt.py:8-23`): HS256, claims `{sub, email, role}`, 60 min default (`config.py:22`). Signature + expiry verified; errors → `ValueError` → 401.
- **Bearer-first, cookie fallback** (`dependencies.py:26-32`): `HTTPBearer(auto_error=False)`; else HttpOnly `access_token` cookie. Missing → 401 "Missing bearer token". **Known quirk:** backend sets the cookie only on SSO flows (`auth.py:153-161`); email login returns token JSON only, so the cookie fallback normally fires just for SSO users. Frontend also uses a *different* cookie name (`coditent_token`, `web/src/lib/constants.ts:1`) read by edge middleware — backend ignores it.
- **REGISTER** (`POST /auth/register`, 202): validate → verified-email 400 if user exists → CANDIDATE-only enforced twice (schema `Literal["CANDIDATE"]` `schemas.py:27` + check `auth.py:396-397`) → pending row (OTP sha256) → OTP email → `{detail,email,expires_in_seconds}`. **No user, no token.** Mail failure deletes the row → 502. Rate 10/min + per-email 60 s cooldown + 409 race guard.
- **VERIFY** (`POST /auth/verify-email`): row `FOR UPDATE` → generic 400 if missing → expired/attempts(5)→ row deleted + 400 → wrong code increments → success creates `User(CANDIDATE, approved)` + `CandidateProfile`, deletes row, returns `TokenResponse`. Concurrent verifies serialize on the lock; unique email backstops.
- **RESEND** (`POST /auth/resend-verification`, 5/min): new OTP invalidates old, attempts reset, cooldown 429 with `retry_after_seconds`; mail failure rolls back to old code (502).
- **LOGIN** (`POST /auth/login`, 5/min): bcrypt check → 401; legacy unapproved RECRUITER → 403; returns `TokenResponse`, sets no cookie.
- **No logout endpoint** (frontend clears storage, `web/src/lib/auth.ts:22-29`). **No token refresh** (no `refresh_token` anywhere; interceptor only logs out on 401). **No password reset** (only seed flag in `admin_seed.py:17,48`).
- **SSO** (`/auth/sso/*`): authorize redirect with signed state → callback exchanges code server-side, verifies email, existing user linked by email (+profile backfill), new email → onboarding cookie → `POST /oauth/complete-registration` (candidate-only roles). Ends with the same CODITENT JWT + HttpOnly cookie. OAuth never creates company roles.
- **Frontend:** login routes by `user.role` (`(auth)/login/page.tsx:42-68`); register → `/verify-email?email=`; verify → token → `/profile`. Axios injects `Authorization: Bearer <localStorage>` (`lib/api.ts:55-64`, `withCredentials:true`); WS uses `?token=` (`lib/api.ts:541-548`). **No frontend user-ID trust found**: candidate/company/receiver IDs are derived server-side (`applications.py:122-123`, `chat.py:66,377-404`, `offers.py:57-69`); remaining client IDs are validated + gated.

## 5. User types and RBAC

- **Platform roles** (`models.py:11-16`): `CANDIDATE`, `COMPANY_USER`, `PLATFORM_ADMIN`, legacy `RECRUITER` / `ADMIN` ("do not create", still readable).
- **Company roles** (`models.py:31-36`, stored as free String validated by `VALID_COMPANY_ROLES`): `OWNER ADMIN HR RECRUITER HIRING_MANAGER`.
- **Real matrix** (`app/core/permissions.py:18-33`, mirrored in `web/src/lib/permissions.ts:3-20`):

| Action | OWNER | ADMIN | HR | RECRUITER | HIRING_MANAGER |
|---|---|---|---|---|---|
| view_company | ✓ | ✓ | ✓ | ✓ | ✓ |
| edit_company | ✓ | ✓ | — | — | — |
| invite_employees | ✓ | ✓ | — | — | — |
| change_employee_roles | ✓ | ✓ | — | — | — |
| remove_employees | ✓ | ✓ | — | — | — |
| create_offers | ✓ | ✓ | ✓ | ✓ | — |
| edit_offers | ✓ | ✓ | ✓ | ✓ | ✓ |
| delete_offers | ✓ | ✓ | — | — | — |
| view_applications | ✓ | ✓ | ✓ | ✓ | ✓ |
| evaluate_candidates | ✓ | ✓ | ✓ | ✓ | ✓ |
| move_recruitment_stage | ✓ | ✓ | ✓ | ✓ | ✓ |
| view_assessments | ✓ | ✓ | ✓ | ✓ | ✓ |
| company_analytics | ✓ | ✓ | ✓ | ✓ | ✓ |
| manage_subscription | ✓ | — | — | — | — |

Write paths double-gate (dependency + `can()`). **401** = unauthenticated only. **403** = wrong role/scope/approval. **404** = miss *or deliberate isolation* (same "not found" to avoid leaks): cross-company (`companies.py:109-110,124-125,138-139`; `offers.py:150,182`), cross-candidate (`applications.py:87-88`; `assessments.py:56-61`; `chat.py:213-214,217` with explicit 404-vs-403 docstring), cross-company invites (`invitations.py:400-401,427-428`).

## 6. Company flow

- No public company registration. Entry is (a) **platform invite**: `POST /invites/company/invite` (`require_platform_admin`, `invitations.py:119-169`) — one live pending/email guard, 7-day expiry, branded email with `/company/invite/accept?token=`, returns URL + `email_sent` flag; or (b) legacy authenticated `POST /companies` (`require_recruiter`, sets caller OWNER, `companies.py:55-87`).
- **Accept** (`POST /invites/company/accept`, public, `invitations.py:267-300`): token → pending check → lazy-expire → email-taken check → one commit creates `Company(active)` + `User(COMPANY_USER/OWNER/approved)` + marks accepted. Old `/invite/company` page redirects to the canonical accept page.
- **States:** `pending → accepted | revoked | expired` (resend revokes old + inserts new row). Validate endpoint is public with lazy-expire (`GET /invites/company-invitations/validate`).
- **Employees** (FLOW B, `POST /invites/employee/invite`, OWNER/ADMIN + `can(invite_employees)`): roles restricted to ADMIN/HR/RECRUITER/HIRING_MANAGER (OWNER rejected), no self-invite, no same-company member, no live duplicate; 72 h expiry; email best-effort. Accept paths: new-user (`/employee/accept`, email-taken → use existing flow) and existing-user (`/accept-existing`, invite email must match account, same-company/another-company blocked, CANDIDATE→COMPANY_USER conversion, role from invite never client).
- **Team ops:** role change (not OWNER, roles restricted), remove (not self/OWNER), all same-company scoped (`companies.py:159-207`).
- **Ownership:** `companies.owner_id` set at creation; transfer NOT IMPLEMENTED (no endpoint).

## 7. Offer/job flow

- **CREATE** `POST /offers` (`offers.py:49`): `require_company_member` + `can(create_offers)`; `company_id` forced from caller; `POST` invalid without membership. DB: insert; busts `recommendations:*` Redis (`offers.py:37`); audit `OFFER_CREATED`.
- **READ** `GET /offers` public (active only); `GET /offers/mine` own company; `GET /offers/{id}` role-branched (admin/candidate wide, company scoped).
- **UPDATE** `PUT /offers/{id}`: admin wide, company + `can(edit_offers)` scoped; audit. No PATCH semantics (full `OfferCreate`).
- **DELETE** `DELETE /offers/{id}` 204: + `can(delete_offers)`; audit. Blocked by child rows (no cascade) or orphans depend on DB behavior — UNCERTAIN which; no soft-delete.
- **ACTIVATE/DEACTIVATE** `PATCH /offers/{id}/toggle` (any member, no `can()` check — RISK, see §22): flips `active`, busts cache, no audit.
- `responsible_hr_id` defaults to creator (`offers.py:58`); reassignable by OWNER/ADMIN only to same-company `COMPANY_USER` (`offers.py:103-129`); drives recruitment-chat access. `recruiter_id` is the legacy owner FK, still NOT NULL.
- **Discovery→apply→visible:** candidate `GET /offers` → `POST /applications` → recruiter `GET /applications` (company join).

## 8. Candidate profile flow

- Registration creates empty `CandidateProfile` row (verify endpoint + SSO sync, `auth.py:520-541`, `_sync_existing_sso_user`).
- Edit: `PUT /candidates/profile` partial `ProfileUpdate` (city/phone/headline/bio/field/university/study_level/skills/exp/linkedin/portfolio).
- Fields consumed by **recommendations**: headline, field, university, level, city, skills, years, bio[:300] (`services/ai.py:46-61`). By **screening**: same + name + CV excerpt ≤4000 chars (`services/screening.py:33-58`). By **recruiter display**: embedded `{full_name,email}` (+`skills` read client-side where present).
- CV text is *not* stored on the profile; only `cv_url` pointer persists.

## 9. CV flow

- `POST /candidates/cv` (201): `require_candidate` → extension+content-type allowlist (pdf/docx, octet-stream tolerated) + magic bytes (`%PDF`, `PK\x03\x04`) + empty-file reject + **5 MB cap with 413** (`services/cv_parser.py:7-40`, `candidates.py:93-98`) → best-effort delete of previous file → Supabase `candidate-cvs` upload at `{uid}/{uuid}_{safe}.{ext}` → `profile.cv_url` set. Authenticated candidate only; ownership via path prefix (`assert_owns_path`).
- `GET /cv/meta`, `GET /cv` (attachment stream), `DELETE /cv` (204, clears DB even on storage miss), all same guards.
- `POST /cv/parse`: downloads own CV → `extract_text` (`pypdf`/`python-docx`, <20 chars → `CV_NO_TEXT`, scanned PDFs unsupported, cap 20000 chars) → Gemini structured extract (`temperature 0.1`, 8192-token budget after truncation incidents, 30 s timeout × 2 attempts, `finish_reason` check) → validated/normalized schema `{skills,years,study_level,city,phone,linkedin,portfolio,university}` → returns `{extracted,warnings,has_cv,meta}`; **persists nothing**.
- **Suggest-don't-overwrite** is enforced server-side by parse being read-only (docstrings `candidates.py:199`, `cv_extraction.py:278`) and client-side by manual form application. Error map: 400 file errors, 422 no-text, 502 AI, 504 timeout.

## 10. Recommendation engine

`POST /recommendations/generate {field,region,type}` → cache lookup (`recommendations:{candidate}:{sha256(criteria)}`) → hit returns instantly `{cached:true}`; miss writes `job:{id}=pending` (TTL 3600) + `generate_recommendations_task.delay` → frontend polls `GET /recommendations/jobs/{id}` (ownership-checked) → worker: fresh loop + `engine.dispose()` → up to 30 active offers filtered by type/field ilike/region ilike → Gemini ranks (French prompt, JSON array ≤10 `{offer_id,score,reasoning}`, temp 0.2, 1000 tokens, no explicit timeout) → validation (fences, JSON list, typed items) → empty/invalid triggers **heuristic fallback** (base 50 + field 25 + city 20 + skill hits, French "fallback applied" reasoning) → **upsert** per matched offer (out-of-criteria scores preserved; only inactive-offer rows pruned; empty match set deletes nothing) → result cached 900 s → job `completed{result}` (any exception → `failed{error}`). `GET /recommendations` returns ranked `SavedRecommendation`s and auto-inserts `score=0` "en attente" placeholders for unscored active offers. Scores persist in DB (no regen on refresh); NOT recalculated automatically (only new Generate; offer create/toggle busts the result cache so next Generate rescans). Failure states `pending/running/completed/failed` are explicit in Redis; UI shows retry banner on failed/timeout.

## 11. Application flow

- `POST /applications {opportunity_id,cv_url?,cover_letter?}` (`applications.py:101-128`): CANDIDATE only (403 else) → UUID + offer-exists checks → duplicate check → **409? No — 400 "Already applied"** → `company_id` derived from offer → insert + audit + queue screening task (failure swallowed). Unique backstop `uq_applications_candidate_opportunity`; concurrent double-submit serializes on the constraint (second gets 400, verified live).
- Re-apply on rejected/withdrawn: NOT IMPLEMENTED as distinct flow (same 400; no withdraw endpoint).

## 12. AI application screening (separate from recommendations)

- Trigger: creation auto-queue (`applications.py:128`) + manual `POST /applications/{id}/screen` (COMPANY_USER + `can(evaluate_candidates)`, same-company; PLATFORM_ADMIN; CANDIDATE 403; `processing` short-circuits; resets to pending + requeues).
- Task `applications.screen` (`tasks.py:90-125`): fresh loop + dispose → row `processing` → `screen_application()` → `completed` (`ai_score`, `ai_report` JSON `{summary, strengths[], gaps[]}`, validated 0-100 + non-empty summary) or `failed` (score/report nulled). Never writes zeros.
- Inputs: profile snapshot + CV excerpt ≤4000 chars (best-effort) + offer fields ≤1500 chars (`services/screening.py:33-137`); English prompt, temp 0.2, 2000 tokens, 120 s timeout.
- Returned in company list/detail (`ai_score/ai_report/ai_status/candidate`) and candidate detail (`ai_status` only).

## 13. Recruitment pipeline

- Backend has **no stage state machine** — `applications.status` is a free String; the only enforced rule is the 7-value allowlist on PATCH (`under_review, shortlisted, assessment_required, assessment_completed, interview, accepted, rejected`, `applications.py:166`). Arbitrary jumping (applied→accepted, accepted→applied) is possible; no guards, no required sequencing.
- Per transition (all via `PATCH /applications/{id}`, CANDIDATE always 403): auth = PLATFORM_ADMIN wide or COMPANY_USER + `can(move_recruitment_stage)` + same-company (404 otherwise); DB = status update; side effects = audit (`APPLICATION_STATUS_CHANGED`, or `CANDIDATE_SHORTLISTED`/`CANDIDATE_REJECTED`) + `RECRUITMENT_CHAT_ENABLED` audit when crossing into chat-enabled stages. No notifications, no assessment side effects.
- Chat unlock is stage-derived (`shortlisted, assessment_*, interview, accepted` per `recruitment_chat.py:25-40`), not event-driven.

## 14. Assessment flow

- Model + read-only `GET /assessments`, `GET /assessments/{id}` (role/company/ownership scoped, sparse `{id,status[,score]}`).
- **NOT IMPLEMENTED:** create, assign, submit answers, scoring, status updates, delete, deadlines, questions, attempts. `status/score/report` columns exist but no writer found in `app/`. UI tabs render whatever the sparse payloads contain.

## 15. Interview flow

- **Only the `interview` status string exists.** No scheduling, slots, location/link, interviewer, feedback, reschedule, cancel, or notifications anywhere in backend or migrations. Explicitly NOT IMPLEMENTED.

## 16. Recruitment chat

- Rule as implemented: candidate owns application + stage chat-enabled; responsible HR (`offer.responsible_hr_id → created_by → recruiter_id`) + same company + `can(view_applications)`; everyone else denied (404 cross-candidate, 403 wrong-HR — documented in `chat.py:197-234`).
- Flow: stage gate → `GET /recruitment` (enabled-only list; HR filtered to own) → `GET /recruitment/{app}` (context + ≤100 messages, `[]` if disabled) → `POST` (receiver derived server-side, 2000-char cap) → WS or 3 s polling.
- WS `/recruitment/{app}/ws?token=` (`chat.py:433-529`): JWT from query, full viewer re-check + per-message re-auth, `ready/message/error` frames, close codes 4401/4403/4404, in-memory fan-out (single replica; comment flags Redis pub/sub need at `chat.py:413-421`).
- Persistence: `chat_messages` rows (≤100 asc reads). **No unread state, no read receipts, no typing, no attachments.**
- Legacy general chat (`POST /send`, `GET /with/{uid}` with no peer check — RISK §22, `GET /conversations`) is gated only by accepted `CandidateRequest` on send.

## 17. Notification system

- No notification table, channel, or hook for product events. Only surfaces: `AdminActivityLog` audit writes (not user-facing), `chat_enabled` flags, WS `ready` frames, invitation/OTP emails.
- Event matrix (all verified by grep): application submitted / stage changed / shortlisted / assessment / interview / hired / rejected / chat message / screening done → **in-app ✗, email ✗, realtime ✗** (audit log only). Invitations → **email ✓** (Resend; best-effort except OTP register which 502-rollbacks). OTP → **email ✓**.

## 18. Celery + Redis

- `Celery("coditent", broker=backend=redis_url)`, JSON only, no explicit queues/retries/timeouts (`tasks.py:15-20`). Tasks: `recommendations.generate(job_id,candidate_id,criteria)`, `applications.screen(application_id)`. No beat/scheduler — no periodic jobs (no expired-row cleanup; lazy expiry everywhere).
- **Event-loop fix (why dispose):** fork-pool children inherit the parent loop; SQLAlchemy/asyncpg connections bind to the creating loop, so every job after the first per worker failed ("Future attached to a different loop"). Each task now builds a fresh loop, `engine.dispose()` first, closes loop after (`tasks.py:42-52,96-99`). Same pattern is why tests call `engine.dispose()`.
- Redis keys: `recommendations:{candidate}:{sha}` (result, 900 s), `job:{id}` (status, 3600 s). No stampede lock (concurrent generates duplicate work, last-write-wins).

## 19. AI architecture

| Feature | Provider/model | Service | Trigger | Input | Output/validation | Storage | Fallback | Failure |
|---|---|---|---|---|---|---|---|---|
| Offer ranking | Gemini `gemini-3-flash-preview` | `services/ai.py` | Celery via generate | profile + criteria + ≤30 offers | JSON array ≤10, fenced/typed checks | `SavedRecommendation` upsert | heuristic 50+field/city/skills | `[]` → fallback; never surfaces error |
| App screening | same model | `services/screening.py` | Celery on apply + manual retry | profile + CV≤4000ch + offer≤1500ch | single JSON `{score 0-100, summary, strengths, gaps}`, strict | `Application.ai_*` + status | none (failure recorded) | `ai_status=failed`, retryable |
| CV extraction | same model (lazy) | `services/cv_extraction.py` | `POST /cv/parse` | CV text ≤12000 (retry 6000) | exact-keys object, canonicalized | none (response only) | none | typed errors → 422/502/504 |
| Bio drafting | same model via REST | **frontend** `web/.../generate-bio/route.ts` | profile form button | skills+profile fields | ≤500ch trim, ≥8-word quality gate, 1 retry | none (fills form) | none | mapped 502 messages |

## 20. API inventory

Grouped map (auth/roles/side effects per endpoint; evidence in subagent reports above):

- **Auth** (`/auth`): `GET sso/providers`, `GET sso/{provider}/start`, `GET sso/{provider}/callback`, `POST oauth/complete-registration`, `POST register`→202, `POST verify-email`→TokenResponse, `POST resend-verification`→202, `POST login`, `PUT me/avatar`, `GET me`. No logout/refresh/reset endpoints.
- **Candidates** (`/candidates`): `GET/PUT profile`, `POST/GET(meta,download)/DELETE cv`, `POST cv/parse` — all `require_candidate`, own-scope.
- **Companies** (`/companies`): public list/get; `POST` (recruiter, becomes OWNER); `POST {id}/join` always 410; recruiters/members reads; `PATCH {id}` (edit_company); member role change/remove (admin); owner-only subscription read.
- **Invitations** (`/invites`): company invite/list/get/revoke/resend/validate/accept; employee invite/list/validate/revoke/resend/accept/accept-existing — as §6.
- **Offers** (`/offers`): public list; create/toggle (member; toggle lacks `can()`); mine; get (branched); put/delete (perm-gated); responsible-hr reassign (admin).
- **Applications** (`/applications`): list/get (3 role shapes)/create/screen-retry/status-patch — §11-13.
- **Recommendations** (`/recommendations`): generate/job-status/list — §10.
- **Assessments** (`/assessments`): two GETs only.
- **Chat** (`/chat`): send/with/conversations/recruitment×3/WS — §16.
- **Audit** (`GET /audit`): admin last-50 / company filtered-50 / others empty.
- **Admin** (`/admin`): recruiters pending/approve/reject, stats (9 fields), users, offers, activity (all paginated), impersonate (JWT + audit).
- **System:** `GET /health`, `GET /metrics` (Prometheus), `GET /protected` (auth probe).
- **Discrepancies:** none unregistered (all 12 routers mounted, `main.py:45-56`); no OpenAPI-but-missing-code found. OpenAPI itself not diffed against live (static review only).

## 21. Frontend ↔ backend contracts

- Transport: same-origin `/api-proxy/*` rewrite in prod (avoids mixed content), direct `:8001` locally (`lib/api.ts:15-26`); `withCredentials:true`; Bearer from `coditent_token`.
- **Known mismatches (proven, not fixed per instructions):** M1 `joinCompany`→always-410; M2 `updateCompany` partial→422 (`name` required); M3 OAuth response key `access_token` vs `TokenResponse.token` (client-side workaround); M4 register `RECRUITER` always rejected; M5 sparse candidate/admin shapes vs rich TS types; M6 unvalidated status strings → 400 + candidate 403 unguarded; M7 `recruiter_id` legacy-role check rejects current HR ids; M8 `updateRequestStatus` 403 for PLATFORM_ADMIN (legacy `ADMIN` check); M9 admin lists silently first-page-only; M10 WS token reads hardcoded `"coditent_token"` vs `AUTH_TOKEN_KEY`.
- Verified OK: register/verify/resend/login/me/avatar, profile×2, all CV paths, offers list/create/toggle, recommendations trio, admin stats/users/offers/pending/approve/reject/activity/impersonate, companies list/get/create, requests trio, all invite paths, applications get/list/screen/status, assessments, audit, all chat paths + WS path.
- Backend without frontend caller: SSO pages (partial), `GET /offers/mine`, offer PUT/DELETE, member PATCH/DELETE, `POST /applications` (no `createApplication` helper), WS reliance.

## 22. Security audit

- **OK:** JWT verify+expiry+DB user check; Bearer-first+cookie; role/company checks from DB row; 404-isolation convention; invite token hashing + single-use + expiry + email-match + resend rotation; OTP hashing/attempts/cooldown/rollback; CV ownership + type/size validation; chat receiver derivation + per-message re-auth; no frontend ID trust on writes; secrets via env (names only in repo).
- **RISK:** toggle offer lacks `can()` (any member incl. read-only roles can flip active, `offers.py:130-147`); `GET /chat/with/{uid}` has no peer/relationship check (`chat.py:73-97` — any authenticated user can read any 1-1 thread by user ID); `POST /companies` allows any recruiter incl. legacy to found companies; `updateCompany` 422 forces full payloads (clients may over-post); `audit.py` company filter is substring match on `details` (`audit.py:31`); HttpOnly cookie + Bearer dual auth with mismatched frontend cookie name (confusing but not exploitable); WS token in URL query (logged by proxies; accepted tradeoff, worth noting); no rate limits on most routers (only auth OTP/login + global slowapi wiring — UNCERTAIN exact per-route coverage).
- **BUG (pre-existing, not fixed):** none newly introduced; `updateRequestStatus` PLATFORM_ADMIN 403 (M8) is arguably a bug.
- **NOT IMPLEMENTED:** password reset, token refresh/logout revocation, 2FA, RLS policies, E2E encryption, attachment scanning (CV content stored as-is), audit-log tamper protection.
- **NEEDS MANUAL VERIFICATION:** production CORS origins, Supabase bucket policies, Resend domain verification, actual RLS state in Supabase dashboard, secret rotation.

## 23. Supabase / RLS

- Usage is **Postgres hosting + Storage only**. Backend connects directly with SQLAlchemy+asyncpg using the pooled connection string; Supabase Auth is unused for app users; `supabase` Python package is instantiated only for Storage admin ops (`app/db.py`, `services/cv_storage.py`).
- **RLS is bypassed by design**: direct connections don't go through PostgREST, so RLS policies (if any) don't apply. No RLS policies found in repo (migrations contain no `CREATE POLICY`; unable to inspect live dashboard — flagged NEEDS MANUAL VERIFICATION).
- Enforcement split: **100% FastAPI authorization** (`require_*` + `can()` + 404-isolation). If anyone enables RLS later without `service_role` bypass, the app breaks; if someone exposes PostgREST directly, current code assumes no protection there.
- Public tables RLS status: indeterminable from repo — manual dashboard check required.

## 24. Cache architecture

| Key | Data | TTL | Created | Invalidated |
|---|---|---|---|---|
| `recommendations:{candidate}:{criteria-sha}` | ranked list JSON | 900 s | worker success | TTL expiry; overwrite on same-criteria rerun; **busted (`recommendations:*` delete) on offer create/toggle** (`offers.py:37`) |
| `job:{job_id}` | `{status, candidate_id, criteria, result?, error?}` | 3600 s | API pending → worker running/completed/failed | TTL only |
| (OTP/invite flows) | none in Redis | — | — | DB rows are the store |

Stale windows: new offer visible in Generate results only after cache bust (create/toggle) or 15-min expiry; same-criteria reruns within TTL return cached data without recompute; concurrent generates duplicate work (last write wins); `GET /recommendations` placeholders are DB rows, not cache.

## 25. Error handling

- Strategy: `HTTPException` with safe details + global `Exception→500` (`main.py:80-83`); slowapi 429; pydantic 422. Auth parse errors mapped (`jwt.py`).
- Map: **400** validation/business (bad UUID, missing fields, dupes, wrong transitions, invite states, OTP invalid/expired/attempts); **401** unauthenticated (no/bad/expired token, bad login, vanished user); **403** wrong role/scope/approval (incl. legacy-role rejections, candidate-mutating-recruiter-state, unapproved recruiter login); **404** miss-or-isolation; **409** OTP race + `POST /companies/join` is **410** Gone (not 409); **422** pydantic + CV-no-text; **429** slowapi + OTP cooldown payload; **500** unhandled; **502** upstream AI/mail/storage failures; **503** unconfigured SSO; **504** AI timeout.
- Generic-error spots: `GET /admin/activity` returns `[]` on DB error (masks failure); some 500s carry raw `str(exc)` in details (UNCERTAIN which reach clients — needs response inspection); `updateRequestStatus` 403 message is identical for candidate-vs-role (fine).

## 26. Deployment

- Flow: `git push main` → Actions CI (web lint+build with `NEXT_PUBLIC_API_URL=http://34.205.255.37`, api import check) → CD (Ansible: SSH via `EC2_SSH_KEY`, `repo_branch=main`, sync code, render env only if missing, `docker compose up -d --build`, health-gate `http://127.0.0.1:8001/health`) → `curl -f http://$EC2_HOST/health` verification (`.github/workflows/deploy.yml:14-120`).
- Backend host: EC2 `34.205.255.37` (also baked as frontend API default + WS fallback). Containers: api (`:8001`, `alembic upgrade head && uvicorn`), worker (celery), redis (`:6380`), web (`:3001→3000`, `NEXT_PUBLIC_API_URL` build-arg). Reverse proxy: host nginx `:80/443` (`roles/nginx`). **No zero-downtime**: compose rebuild restarts API (in-flight requests dropped; see §30 risks).
- Env loading: compose `env_file: apps/api/.env` + `environment:` overrides (`docker-compose.yml:7-20`); Ansible renders `.env` files only when absent (safe for secrets); secrets live in GH secrets + server files, never repo (names: `DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`, `SUPABASE_URL/SUPABASE_SERVICE_KEY`, `RESEND_API_KEY/RESEND_FROM_EMAIL`, `REDIS_URL`, `FRONTEND_URL`, `GOOGLE/LINKEDIN_*`).
- Migrations: automatic `alembic upgrade head` on api start (additive so far); rollback playbook exists (`ansible/playbooks/rollback.yml`) but no per-migration downgrade testing evident.
- Restart: `restart.yml` (compose restart + health gate). Rollback: `rollback.yml` (git revert-to-commit + redeploy). Metrics: `/metrics` Prometheus (`main.py:64-66`).

## 27. Test architecture

Suites (`apps/api/tests/`, pytest + httpx, mixed live-DB + offline):
- `test_company_invitations.py` — company invite/accept/ownership (live).
- `test_cv_auth.py` — Bearer + CV ownership (live).
- `test_cv_upload.py` — offline validators/parsers (no DB/AI/Supabase).
- `test_email_otp.py` — OTP unit (format/hash/expiry) + live flows with known-hash DB rows (no SMTP).
- `test_employee_invitations.py` — employee invite/accept/roles (live, fixed emails — non-idempotent, residue-sensitive).
- `test_rbac.py`, `test_security.py`, `test_recruitment_chat.py` — live RBAC/isolation/chat matrix (need seeds + localhost:8001; known flaky: shared asyncpg event-loop pollution).

Coverage: auth(login/JWT/cookie/OTP Happy+abuse) COVERED; RBAC matrix COVERED; company isolation COVERED (offers/apps/chat/invites); offers CRUD COVERED (live flows); applications + duplicate-UQ COVERED; AI screening (trigger/status/retry) PARTIAL (live-verified manually, no committed test); recommendations (generate/poll/upsert/cache) PARTIAL (same); CV upload/auth/parse COVERED (offline + live); chat (gates, HR scoping, WS) COVERED; assessments PARTIAL (read paths only — nothing else exists); invitations (both flows, states, resend/revoke) COVERED; admin (stats/users/offers/activity/impersonate) PARTIAL (happy paths); notifications NOT COVERED (nothing to cover — system absent).

## 28. Complete business flow (candidate)

| Step | Endpoint | Table | Job | Permission | Side effect |
|---|---|---|---|---|---|
| Register | `POST /auth/register` | `pending_registrations` insert | — | public | OTP email |
| Verify | `POST /auth/verify-email` | delete pending; insert `users`+`candidate_profiles` | — | public | JWT issued |
| Login | `POST /auth/login` | read `users` | — | public | JWT (no cookie) |
| Complete profile | `PUT /candidates/profile` | update `candidate_profiles` | — | own account | — |
| Upload CV | `POST /candidates/cv` | `profile.cv_url` set; Supabase object | — | own account | old file deleted |
| Confirm extraction | `POST /candidates/cv/parse` | none (read-only) | — | own account | none (client applies) |
| Discover | `GET /recommendations` | read/insert `saved_recommendations` | — | own rows | score-0 placeholders |
| Generate | `POST /recommendations/generate` | `job:{id}` Redis | `recommendations.generate` | own rows | cache + upsert on success |
| Poll | `GET /recommendations/jobs/{id}` | Redis read | — | owner-only | — |
| View offer | `GET /offers/{id}` | read `offers` | — | candidate-wide | — |
| Apply | `POST /applications` | insert `applications` (+UQ) | `applications.screen` queued | CANDIDATE | audit; chat locked |
| Screening | (task) | `applications.ai_*` | same | — | status completed/failed |
| HR sees candidate+score | `GET /applications` | read join | — | `view_applications`, same company | — |
| HR moves candidate | `PATCH /applications/{id}` | status update | — | `move_recruitment_stage`, same company | audit; chat may unlock |
| Chat | `GET/POST /recruitment/{app}` + WS | `chat_messages` | — | stage-gated, responsible HR | WS fan-out |
| Assessment | `GET /assessments` | read | — | scoped | — (assign/submit NOT IMPLEMENTED) |
| Interview | status string only | `applications.status` | — | same as moves | NOT IMPLEMENTED beyond string |
| Hired/rejected | `PATCH` → `accepted/rejected` | status update | — | same as moves | audit only, no notifications |

## 29. Company end-to-end flow

| Step | Endpoint | Table | Permission | Job/notification/side effect |
|---|---|---|---|---|
| Platform invites company | `POST /invites/company/invite` | `company_invitations` pending | PLATFORM_ADMIN | Resend email (best-effort flag) |
| Owner accepts | `POST /invites/company/accept` | `companies` + `users(COMPANY_USER/OWNER)` insert, invite accepted | public+token | one commit; audit |
| Owner invites HR | `POST /invites/employee/invite` | `employee_invitations` pending | OWNER/ADMIN + `invite_employees` | email best-effort |
| HR accepts | `/employee/accept[-existing]` | `users` insert/update | public/token or authed email-match | role from invite |
| Create offer | `POST /offers` | `offers` insert | member + `create_offers` | cache bust, audit |
| Assign responsible HR | `PATCH /offers/{id}/responsible-hr` | `offers.responsible_hr_id` | OWNER/ADMIN | prior HR loses chat implicitly |
| Publish | create active by default / `toggle` | `offers.active` | member (toggle lacks `can()`) | cache bust |
| Receive applications | `GET /applications` | read join | `view_applications` | — |
| AI screening | auto on apply + `POST .../screen` retry | `applications.ai_*` | `evaluate_candidates` | Celery task |
| Pipeline | `PATCH` stages | `applications.status` | `move_recruitment_stage` | audit, chat unlock |
| Chat | recruitment endpoints + WS | `chat_messages` | stage + responsible-HR | in-memory fan-out |
| Assessment/interview/hire | status strings + read-only assessment GETs | `applications.status` | same as moves | assignment/interview/scheduling NOT IMPLEMENTED |
| Company registration | — | — | — | NOT IMPLEMENTED as public flow (legacy `POST /companies` needs recruiter auth; `/join` is 410) |

## 30. Current backend health

BACKEND STATUS
===============

WORKING:
- Auth (register/OTP/verify/resend/login/SSO/linking), JWT+cookie, RBAC matrix, 404-isolation
- Both invitation flows (states, resend rotation, expiry, email-match, atomic accepts)
- Companies CRUD + team management + subscriptions read
- Offers full lifecycle, pipeline moves + audit, chat gating + WS + polling
- Recommendations generate/poll/upsert/cache + placeholders
- Application AI screening trigger/status/retry + CV upload/parse/delete
- Admin stats/users/offers/activity/impersonate, audit log, health/metrics, rate limits on auth

PARTIALLY IMPLEMENTED:
- Assessments (model + read-only GETs; no create/assign/submit/score flow)
- Legacy RECRUITER/ADMIN compat paths (work but drift from new model; M4/M7/M8 mismatches)
- Recruiter-lookup endpoint (`list_recruiters` effectively public to any authed user)
- `GET /offers/mine` exists but no frontend caller; `POST /applications` has no `createApplication` helper

NOT IMPLEMENTED:
- Password reset, token refresh/logout revocation, 2FA
- Interview scheduling/detail/feedback, assessment authoring/submission/scoring
- Notifications (in-app/email/push) for product events; unread counts; typing; attachments
- Public company self-registration; ownership transfer; org deletion
- Periodic jobs (no beat; expired-row cleanup is lazy)
- RLS policies (none in repo)

KNOWN BUGS (pre-existing, not fixed):
- B1: `PATCH /offers/{id}/toggle` skips `can()` — any company member can flip any own-company offer
- B2: `GET /chat/with/{uid}` has no peer/relationship check — any authed user can read any 1-1 thread by ID
- B3: `POST /companies` open to any recruiter (incl. legacy) — company-creation spam vector
- B4: `updateRequestStatus` 403s PLATFORM_ADMIN (legacy `ADMIN` string check)
- B5: `M2` partial update of company 422s (`CompanyCreate.name` required on PATCH)
- B6: `GET /admin/activity` returns `[]` on DB error, masking failure

SECURITY RISKS:
- R1: Supabase RLS bypassed by design — all enforcement in FastAPI; anyone enabling RLS or exposing PostgREST changes the model (verify dashboard state manually)
- R2: WS JWT in query string (proxy/CDN log exposure; accepted tradeoff, document)
- R3: `updateCompany` full-object PUT encourages over-posting (mitigated by server whitelist `companies.py:147`)
- R4: No rate limits outside auth/OTP paths (UNCERTAIN exact slowapi coverage per router — verify)
- R5: CV files stored as-is, no malware scanning
- R6: Downtime on every deploy (compose rebuild restarts API; in-flight requests dropped)

ARCHITECTURE RISKS:
- A1: Single-replica WS fan-out (in-memory dict; comment flags Redis pub/sub need)
- A2: No idempotency keys — retries rely on UQ constraints + locks (adequate today, brittle under new writers)
- A3: Invitation/OTP tables lack ORM models — raw SQL drift risk
- A4: Free-text status/role columns unenforceable at DB level
- A5: Naive datetimes everywhere (UTC by convention, not tz-aware)
- A6: Recommendation cache keyed by criteria — profile edits don't bust it (15-min staleness)

STALE/DEAD CODE:
- `friendships` migration remnants (created then dropped; no model/usage)
- `oauth_onboarding_*` cookie flow partially superseded? (still used — keep)
- Legacy `RECRUITER`/`ADMIN` branches, `/join` 410 stub, `recruiter_id` legacy FK, `opportunity_status` unused string, `OfferStatus`/`CompanyStatus` enums unused by columns
- Unused UI primitives removed in Phase 8; `three/gsap/ogl` remain unimported in `package.json`

FRONTEND/BACKEND CONTRACT MISMATCHES: M1–M10 (§21).

MISSING TESTS: screening/recommendations committed tests (live-verified only); notification tests (nothing to test); assessment write paths (don't exist); RLS tests (no policies); concurrency tests beyond OTP; frontend unit tests (no runner in `apps/web`).

PRODUCTION VS LOCAL DIFFERENCES: prod runs same images via Ansible; local overrides `FRONTEND_URL=http://localhost:3001`, `ACCESS_TOKEN_COOKIE_SECURE=false`; CI builds web with `NEXT_PUBLIC_API_URL=http://34.205.255.37` (build-time baked); Vercel frontend version may lag API (verify `/api-proxy/openapi.json` path counts when debugging 404s).

## 31. Developer cheat sheet

START BACKEND: `docker compose up -d api` (runs `alembic upgrade head` then uvicorn `:8001`)
START CELERY: `docker compose up -d worker` (never run tasks without it — jobs silently stay pending/failed)
RUN MIGRATIONS: `docker exec coditent-api alembic upgrade head` (additive only; never edit applied migrations)
RUN TESTS: `docker exec coditent-api pip install -q pytest httpx pytest-asyncio` (image lacks them) then `python -m pytest tests/test_email_otp.py` (add `docker cp` for new files — image has no bind mount)
CREATE MIGRATION: `docker exec coditent-api alembic revision -m "<what>"` (set `down_revision` to current head; verify with `alembic heads`)
CHECK OPENAPI: `curl localhost:8001/openapi.json | python3 -c ...` (compare path counts prod vs local)
CHECK REDIS: `docker exec coditent-redis redis-cli -n 0 keys 'recommendations:*'`, `'job:*'`
CHECK WORKER: `docker logs coditent-worker | grep -E "ai_job|screening_(started|completed|failed)"`
DEPLOY BACKEND: `git push origin main` (Actions CI → Ansible EC2 `34.205.255.37`); verify `curl http://34.205.255.37/health`
VIEW LOGS: `docker logs coditent-api | tail`, `docker logs coditent-worker | tail`
IMPORTANT TABLES: `users`, `candidate_profiles`, `companies`, `offers`, `applications`, `saved_recommendations`, `assessments`, `chat_messages`, `candidate_requests`, `admin_activity_logs`, `company_invitations`, `employee_invitations`, `pending_registrations`
IMPORTANT ROUTERS: `auth`, `dependencies`, `applications`, `invitations`, `recommendations`, `chat`, `companies`, `offers`
IMPORTANT SERVICES: `screening.py`, `recommendation_jobs.py`, `ai.py`, `cv_extraction.py`, `cv_storage.py`, `email_verification.py`, `oauth_service.py`, `recruitment_chat.py`
IMPORTANT TASKS: `recommendations.generate`, `applications.screen` (both need per-job `engine.dispose()`)
IMPORTANT ENV VARIABLES: `DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `REDIS_URL`, `FRONTEND_URL`, `GOOGLE/LINKEDIN_*`, `OTP_EXPIRE_MINUTES`, `OTP_MAX_ATTEMPTS`, `OTP_RESEND_COOLDOWN_SECONDS`
