*This project has been created as part of the 42 curriculum by aelasefa, mohammedelmahf, VYMNN47.*

# CODITENT — Talent Workflow Platform for Morocco

## Description

CODITENT connects candidates and company recruiters in one workspace. Candidates build recruiter-ready profiles (headline, bio, skills, experience, education, links, avatar, CV), discover offers through an AI recommendation engine, and apply. Company users (OWNER / ADMIN / HR / RECRUITER / HIRING_MANAGER) publish offers, review AI-screened applications, move candidates through a recruitment pipeline, and chat with shortlisted candidates. Platform admins approve accounts, moderate content, impersonate users for support, and audit activity.

## Project goals

- One workspace for the Moroccan job/internship market (French + English UI strings in AI prompts and fallbacks).
- Candidate side: onboarding, profile builder, CV upload + AI extraction, recommendations with transparent scores, applications, stage tracking, stage-gated chat.
- Company side: invitation-only membership, role-based permissions, offer lifecycle, AI application screening, pipeline management, company branding via logo, recruiter↔candidate chat.
- Platform side: admin moderation, audit log, health/metrics observability, reproducible Supabase-backed deployments.

## Key features

- Custom JWT auth (register + email OTP, login, Google/LinkedIn SSO), TOTP 2FA with 30-day trusted-device cookies, role routing, edge middleware protection.
- Invitation-only company system (platform→company invites, owner→employee invites, token hashing, expiry, resend rotation).
- Offer CRUD + responsible-HR assignment + activation toggle.
- Recommendations: Celery + Gemini ranking with deterministic heuristic fallback; per-offer match scoring with `pending → processing → completed | failed` lifecycle.
- Application AI screening (auto on apply + manual retry), scores shown to recruiters.
- Recruitment chat: stage-gated candidate↔responsible-HR conversations over REST + WebSocket, with polling fallback.
- Company logos: upload/replace/remove with validation, served via scoped stream, initials fallback everywhere.
- CV pipeline: upload, download, delete, AI parse (suggest-don't-overwrite).
- Admin: stats, users, offers, pending approvals, activity log, impersonation.
- Observability: structured logs, Prometheus `/metrics`, health checks, rate limits on auth paths.

---

## Table of contents

1. [Instructions](#instructions)
2. [Environment configuration](#environment-configuration)
3. [Technical stack](#technical-stack)
4. [Technical-choice justification](#technical-choice-justification)
5. [Architecture](#architecture)
6. [Project structure](#project-structure)
7. [Frontend architecture](#frontend-architecture)
8. [Backend architecture](#backend-architecture)
9. [How frontend and backend communicate](#how-frontend-and-backend-communicate)
10. [Database architecture](#database-architecture)
11. [ER diagram](#er-diagram)
12. [API documentation](#api-documentation)
13. [Authentication flow](#authentication-flow)
14. [Roles and permissions](#roles-and-permissions)
15. [Company + employee invitation flow](#company--employee-invitation-flow)
16. [Recruitment workflow](#recruitment-workflow)
17. [Chat system](#chat-system)
18. [AI architecture](#ai-architecture)
19. [Recommendation system](#recommendation-system)
20. [Assessments / practice missions](#assessments--practice-missions)
21. [Company logo](#company-logo)
22. [Running CODITENT](#running-coditent)
23. [Complete user flows](#complete-user-flows)
24. [Implemented features](#implemented-features)
25. [Planned / incomplete features](#planned--incomplete-features)
26. [42 Modules](#42-modules)
27. [Security architecture](#security-architecture)
28. [Testing](#testing)
29. [Common problems](#common-problems)
30. [Team information](#team-information)
31. [Individual contributions](#individual-contributions)
32. [Project management](#project-management)
33. [Resources](#resources)
34. [Explanation of AI usage](#explanation-of-ai-usage)
35. [Known limitations](#known-limitations)
36. [Developer learning guide](#developer-learning-guide)
37. [Questions I should be able to answer](#questions-i-should-be-able-to-answer)

---

## Instructions

### Prerequisites

- Docker + Docker Compose (recommended path).
- Node 20 + npm (frontend local dev / CI uses `npm ci`, `npm run lint`, `npm run build`).
- Python 3.12 (backend local dev / CI).
- An active **Supabase project** (sole persistent database — there is no local Postgres container, no SQLite).
- A Google Gemini API key (`GEMINI_API_KEY`).
- A Resend API key (required for OTP/invitation emails; invites still create without it but email is logged as warning).

### Environment configuration

Copy examples and fill real values. Never commit `.env` files (gitignored).

```bash
cp .env.example .env                    # root: Supabase + secrets (see table below)
cp apps/api/.env.example apps/api/.env  # backend: same DATABASE_URL + backend-only secrets
cp apps/web/.env.example apps/web/.env.local  # frontend: public vars only
```

| Variable | Used by | Purpose | Required | Secret? | Example |
| -------- | ------- | ------- | -------- | ------- | ------- |
| `DATABASE_URL` | API (`apps/api/app/database.py`, `alembic/env.py`) | Supabase Postgres connection (direct 5432 for migrations/dev; pooled 6543 for prod). `postgresql://` auto-upgraded to `postgresql+asyncpg://` | Yes | Yes | `postgresql+asyncpg://postgres.YOUR_PROJECT_REF:YOUR_DB_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres` |
| `SUPABASE_URL` | API (`apps/api/app/db.py`) | Supabase project URL for Storage admin client | Yes (storage) | No | `https://YOUR_PROJECT_REF.supabase.co` |
| `SUPABASE_SERVICE_KEY` | API only (`apps/api/app/db.py`, `services/cv_storage.py`, `services/company_logo.py`) | `sb_secret_...` service-role key for private buckets. Never `NEXT_PUBLIC_*` | Yes (uploads) | Yes | `sb_secret_YOUR_SERVICE_ROLE_KEY` |
| `NEXT_PUBLIC_SUPABASE_URL` | Web | Public Supabase URL (SSR cookie refresh only, `apps/web/src/utils/supabase/`) | Yes | No | `https://YOUR_PROJECT_REF.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Web | Publishable key for SSR session refresh. App users are NOT Supabase Auth users | Yes | No | `sb_publishable_YOUR_PUBLISHABLE_KEY` |
| `NEXT_PUBLIC_API_URL` | Web (`apps/web/src/lib/api.ts`, `next.config.mjs`, Docker build arg) | Backend base URL; `http://localhost:8001` locally | Yes | No | `http://localhost:8001` |
| `JWT_SECRET` | API (`apps/api/app/utils/jwt.py`, `app/config.py`) | HS256 signing secret, 60-min tokens | Yes | Yes | `change-me-to-a-random-32-char-secret` |
| `GEMINI_API_KEY` | API (`services/ai.py`, `services/screening.py`, `services/cv_extraction.py`); Web bio route (`apps/web/src/app/api/ai/generate-bio/route.ts`) | Google Gemini key, model `gemini-3-flash-preview` | Yes (AI) | Yes | `YOUR_GEMINI_API_KEY` |
| `REDIS_URL` | API + worker (`apps/api/app/cache.py`, `app/tasks.py`) | Redis for Celery broker/backend, rec cache, job keys | Yes | No | `redis://redis:6379/0` |
| `FRONTEND_URL` | API (`docker-compose.yml`, invite emails) | Builds invitation links `${FRONTEND_URL}/invite/...` | Yes | No | `http://localhost:3000` |
| `INVITATION_EXPIRATION_HOURS` | API (employee invites) | Employee invitation TTL (company invites use fixed 7 days in code) | No | No | `72` |
| `RESEND_API_KEY` | API (`apps/api/app/services/email.py`) | Resend key for OTP + invitation emails | For email | Yes | *(empty allowed; email logged as warning)* |
| `RESEND_FROM_EMAIL` / `RESEND_FROM_NAME` | API | Sender identity | For email | No | `coditent@yourdomain.com` / `CODITENT` |
| `OTP_EXPIRE_MINUTES` / `OTP_MAX_ATTEMPTS` / `OTP_RESEND_COOLDOWN_SECONDS` | API (auth OTP) | `10` / `5` / `60` defaults | No | No | `10` / `5` / `60` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | API (SSO) | Google OAuth; both-or-neither enforced in `app/config.py` | For SSO | Secret mixed | `http://localhost:8001/auth/sso/google/callback` |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` / `LINKEDIN_REDIRECT_URI` | API (SSO) | LinkedIn OAuth; both-or-neither enforced | For SSO | Secret mixed | `http://localhost:8001/auth/sso/linkedin/callback` |

### Run with Docker (single command)

```bash
git clone <repo> && cd coditent
cp .env.example .env
# fill .env with real Supabase DATABASE_URL + keys (see table above)
docker compose up --build
# web: http://localhost:3001  api: http://localhost:8001  docs: http://localhost:8001/docs
# `alembic upgrade head` runs automatically on api start against Supabase
```

### Local dev without Docker

```bash
# API — requires Supabase DATABASE_URL, no local DB needed
cd apps/api && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt
alembic upgrade head          # creates schema in Supabase
uvicorn app.main:app --reload --port 8001
# Web
cd apps/web && npm ci && npm run dev -- --port 3000
```

### Migrations

`alembic upgrade head` applies the full schema to Supabase (19 version files under `apps/api/alembic/versions/`). New schema change: `alembic revision --autogenerate -m "desc"` → commit → `alembic upgrade head` (locally + CI + prod). Rollback playbook exists (`ansible/playbooks/rollback.yml`) but per-migration downgrade testing is not evident — TO-VERIFY before relying on it.

---

## Technical stack

- **Frontend:** Next.js 14.2 (React 18, App Router, SSR), Tailwind CSS + CSS Modules, axios, `@tanstack/react-query`, `react-hook-form` + `zod`, `@supabase/ssr` (session refresh only).
- **Backend:** FastAPI (Python 3.12), SQLAlchemy 2 async (`asyncpg`) + Alembic, `python-jose` (JWT HS256), `passlib[bcrypt]`, `slowapi` (rate limits), `structlog` + `prometheus-client` (observability), Celery + Redis 7 (async jobs), `google-generativeai`, `supabase` (Storage admin only), `pypdf` / `python-docx` (CV text), Resend via stdlib `urllib` (email).
- **Database:** **Supabase PostgreSQL** — sole persistent store. No local Postgres container, no SQLite, no localhost fallback (rejected at startup in `apps/api/app/database.py:9-33` and `apps/api/app/config.py:47-56`).
- **Storage:** Supabase Storage, private buckets `candidate-cvs` and `company-logos` (backend service-role key only).
- **Infra:** Docker Compose (`api`, `worker`, `redis`, `web`, `proxy`, `vault`), host nginx `:80/443`, GitHub Actions CI/CD + Ansible to EC2, Vercel-ready frontend (`vercel.json`, `/api-proxy` rewrite).

## Technical-choice justification

- **FastAPI + Next.js:** previous module claim "Web Major: Framework front+back" (TO-VERIFY points); in practice FastAPI gives async SQLAlchemy + Pydantic validation + OpenAPI docs for free, Next.js App Router gives SSR + route groups + edge middleware for role redirects.
- **Supabase Postgres (not self-hosted):** zero DB ops, connection pooler for prod, Storage included so CVs/logos need no second vendor. Direct `asyncpg` (not PostgREST) keeps SQLAlchemy/Alembic workflow; RLS is bypassed by design and all authorization lives in FastAPI (`dependencies.py` + `core/permissions.py`) — see [Security](#security-architecture).
- **Custom JWT over Supabase Auth:** app identity predates/overlaps Supabase adoption; authority is `public.users` so roles/company membership are read from the DB row, never from token claims. Cost: no refresh/revocation, no password reset (both NOT IMPLEMENTED).
- **Celery + Redis:** recommendation ranking and application screening call Gemini with 120 s budgets — too slow for request/response. Jobs + polling keep the UI responsive; Redis doubles as result cache.
- **Gemini `gemini-3-flash-preview` single provider:** one SDK for ranking, screening, CV extraction; deterministic heuristic fallback only where a degraded answer is acceptable (bulk ranking), never where a fake score would mislead (screening, per-offer match).
- **No conversation table:** one `applications` row = one logical recruitment conversation (`chat_messages.application_id`), making duplicate conversations impossible by construction (`services/recruitment_chat.py:115-144`).

---

## Architecture

```mermaid
flowchart TD
    Browser[Browser] --> Web[Next.js 14 - apps/web - :3001 local]
    Web --> MW[middleware.ts - edge role redirects + Supabase cookie refresh]
    Web --> APIClient[lib/api.ts - axios + Bearer + /api-proxy fallback]
    APIClient --> ProxyRewrite[/api-proxy/:path* rewrite - next.config.mjs/]
    ProxyRewrite --> API[FastAPI - apps/api/app/main.py - :8001]
    API --> CORS[CORS - frontend origins + allow_credentials]
    API --> RL[slowapi - auth/OTP rate limits]
    API --> AuthZ[get_current_user - Bearer first + access_token cookie fallback]
    AuthZ --> Gates[require_* gates + can role,action matrix]
    Gates --> Routers[12 routers - auth/candidates/offers/recommendations/companies/requests/invites/applications/assessments/audit/chat/admin]
    Routers --> Services[Services: ai/screening/cv_parser/cv_extraction/cv_storage/company_logo/email/recruitment_chat/match_scoring/recommendation_jobs]
    Services --> PG[(Supabase Postgres - SQLAlchemy asyncpg - PgBouncer-safe)]
    Services --> CVStore[(Storage bucket candidate-cvs - private)]
    Services --> LogoStore[(Storage bucket company-logos - private)]
    Routers --> Redis[(Redis 7 - rec cache + job keys - app/cache.py)]
    Redis --> Worker[Celery worker - app/tasks.py]
    Worker --> Gemini[Gemini gemini-3-flash-preview - ranking/screening/extraction]
    Web --> BioAI[POST /api/ai/generate-bio - frontend-only Gemini REST]
    BioAI --> Gemini
    Routers --> WS[WS /chat/recruitment -app-/ws?token=JWT - in-memory fan-out]
    WS --> Browser
    Routers --> Resend[Resend email - OTP + invites only - services/email.py]
    API --> Metrics[GET /metrics Prometheus + structlog]
    API --> Vault[HashiCorp Vault - startup secret sync - best-effort]
```

Request lifecycle:

```text
Frontend request (lib/api.ts: Bearer from coditent_token, withCredentials)
    ↓  same-origin /api-proxy/* rewrite in prod (mixed-content avoidance)
Backend route (app/routers/*, prefix mounted in app/main.py:45-56)
    ↓  get_current_user (app/dependencies.py:20-48: Bearer→cookie→sub→UUID→users row)
Authorization (require_* gate + can(company_role, action) + same-company / same-candidate scoping; miss-or-foreign → 404 to avoid leaks)
    ↓  Pydantic validation (app/schemas.py; 422 on failure; sanitized text via app/utils/sanitizer.py)
Business logic (app/services/*; Celery enqueue for Gemini work)
    ↓  Database (AsyncSession per request from app/database.py:54-56)
Response (response_model) → Audit log (app/core/audit.py → admin_activity_logs, failure swallowed)
    ↓  Frontend (react-query cache update / invalidate, toasts, 401 → logout + ?next= redirect)
```

---

## Project structure

```text
CODITENT/
├── apps/
│   ├── api/                    # FastAPI backend
│   │   ├── app/
│   │   │   ├── main.py         # app factory, 12 routers, CORS, rate-limit, /health /metrics /protected
│   │   │   ├── config.py       # pydantic-settings, Supabase-only guard, OAuth both-or-neither
│   │   │   ├── database.py     # async engine (statement_cache_size=0), sessions, URL normalizer
│   │   │   ├── db.py           # Supabase admin client factory (backend-only)
│   │   │   ├── models.py       # 10 ORM tables
│   │   │   ├── schemas.py      # Pydantic DTOs (357 lines)
│   │   │   ├── dependencies.py # get_current_user + require_* gates + pagination
│   │   │   ├── core/permissions.py  # VALID_COMPANY_ROLES + PERMISSIONS matrix + can()
│   │   │   ├── core/audit.py   # log_audit() → admin_activity_logs
│   │   │   ├── core/vault.py   # Vault client (startup sync, best-effort)
│   │   │   ├── utils/jwt.py    # create/verify HS256 tokens, 60-min default
│   │   │   ├── utils/sanitizer.py   # input text sanitization for validators
│   │   │   ├── routers/        # 12 routers (89 route decorators)
│   │   │   ├── services/       # ai, screening, cv_*, company_logo, email, recruitment_chat, ...
│   │   │   ├── tasks.py        # Celery app + 3 tasks
│   │   │   ├── cache.py        # lazy sync/async Redis singletons
│   │   │   ├── limiter.py      # slowapi Limiter
│   │   │   └── observability.py# structlog + Prometheus metrics
│   │   ├── alembic/            # 19 migration versions, async env
│   │   ├── tests/              # 14 pytest suites (live-DB + offline mix)
│   │   ├── requirements.txt    # 22 deps
│   │   └── Dockerfile
│   ├── web/                    # Next.js frontend
│   │   ├── src/
│   │   │   ├── app/            # App Router pages (auth, admin, company, dashboard, offers, ...)
│   │   │   ├── components/     # admin, auth, candidate, company, landing, ui, onboarding, shell
│   │   │   ├── lib/            # api.ts (627 lines), auth.ts, permissions.ts, types.ts, ...
│   │   │   ├── utils/supabase/ # SSR/middleware Supabase clients (session refresh only)
│   │   │   └── middleware.ts   # edge protection + role redirects
│   │   ├── next.config.mjs     # /api-proxy rewrite, image hosts
│   │   └── package.json        # next 14.2.32, react 18.3.1, axios, react-query, zod
│   └── apps/web/               # nested legacy copy — TO-VERIFY (appears unused; do not rely on it)
├── docker-compose.yml          # api/worker/redis/web/proxy/vault
├── nginx/                      # reverse-proxy build
├── ansible/                    # EC2 provisioning/deploy/rollback, nginx role
├── .github/workflows/deploy.yml# CI (web lint+build, api imports) + CD (Ansible on push to main)
├── .env.example                # Supabase-only env template
├── SUPABASE.md / DESIGN.md / UX-CONTRACT.md / CODITENT_BACKEND_ARCHITECTURE.md
└── vercel.json
```

| Directory | Contains | Why it exists | Used by / connects to |
| --------- | -------- | ------------- | --------------------- |
| `apps/api/app/routers/` | 12 routers, 89 endpoints | HTTP layer only (no business logic) | Mounted by `main.py`; call `dependencies.py`, `core/permissions.py`, `services/*` |
| `apps/api/app/services/` | AI, screening, CV, logo, email, chat rules, jobs | Reusable business logic + external I/O | Routers + Celery tasks |
| `apps/api/app/core/` | permissions matrix, audit writer, vault | Centralized policy + side effects | Every write path |
| `apps/api/alembic/` | 20 versions | Schema history for Supabase | `api` container runs `alembic upgrade head` on boot |
| `apps/api/tests/` | 14 suites | Regression + security coverage | CI import check; manual `pytest` runs |
| `apps/web/src/app/` | Route groups + pages | User-facing screens per role | Calls `lib/api.ts` helpers |
| `apps/web/src/components/` | Reusable UI (incl. `ui/avatar.tsx`, `company/CompanyLogoSection.tsx`) | Consistent design system | Pages |
| `apps/web/src/lib/` | API client, auth, types, permissions mirror | Single frontend↔backend contract | All pages/components |
| `docker-compose.yml` + `nginx/` + `ansible/` | Services, proxy, provisioning | Dev/prod parity + deploys | `docker compose up --build`; push-to-main deploys |

---

## Frontend architecture

- **Framework:** Next.js 14.2 (App Router, SSR), React 18.3.1, Tailwind + CSS Modules, `axios`, `@tanstack/react-query`, `react-hook-form` + `zod` (`apps/web/package.json`).
- **Routing:** App Router groups — `(auth)/login`, `(auth)/register`, `admin/`, `company/`, `dashboard/`, `offers/`, `profile/`, `chat/`, `invite/`, `requests/`, `recruiter/`, `get-started/`, `verify-email/`, `choose-role/`, `accept-invitation/`, `api/ai/generate-bio/`.
- **Layouts:** role shells (`components/company/AppShell.tsx`, `components/shell/*`) + route protection in `src/middleware.ts` (token presence + JWT `role` claim decode → redirects + `?next=`).
- **API communication:** `src/lib/api.ts` — `getApiBaseUrl()` (HTTPS page + `http://` backend → `/api-proxy`; else `NEXT_PUBLIC_API_URL`), axios `withCredentials:true`, request interceptor injects `Bearer <coditent_token>`, response interceptor clears token + redirects protected paths on 401 (`lib/api.ts:18-90`).
- **State:** `@tanstack/react-query` (`lib/query-provider.tsx`) + local component state; logo mutations invalidate `["company", id]` / `["company-profile", id]` (`CompanyLogoSection.tsx:72-73`).
- **Forms/validation:** `react-hook-form` + `zod` on auth/onboarding; file validation duplicated client-side (`validateCompanyLogoFile` in `lib/api.ts:518-526`) — backend re-validates, never trusted.
- **Realtime:** recruitment WS via `getRecruitmentWsUrl()` (`lib/api.ts:620-627`) with 3 s polling fallback in chat components.

Important pages (representative; all call `lib/api.ts` helpers over the axios client):

```text
Page: Candidate login | Route: /login | Main file: src/app/(auth)/login/page.tsx
Purpose: email login, route by user.role | API: POST /auth/login, GET /auth/me
Auth: public (redirects away when token present) | Components: auth/*, social-login-buttons.tsx
```

```text
Page: Register + verify | Route: /register, /verify-email | Purpose: OTP registration
API: POST /auth/register → POST /auth/verify-email → token → /profile
```

```text
Page: Candidate dashboard | Route: /dashboard | Purpose: recommendations, match scores, next actions
API: GET /recommendations, POST /recommendations/generate, GET /recommendations/jobs/{id},
     POST /recommendations/score/{offer_id} | Components: candidate/*, match-score.tsx
```

```text
Page: Offers browse + detail | Route: /offers, /offers/[id]
Purpose: public offer list, candidate-facing detail with company branding
API: GET /offers, GET /offers/{id} | Components: candidate/job-card.tsx, candidate/job-details.tsx, offer-card.tsx
```

```text
Page: Profile builder | Route: /profile | Purpose: headline/bio/skills/education/links/avatar/CV + bio AI button
API: GET/PUT /candidates/profile, /candidates/cv*, POST /candidates/cv/parse,
     PUT /auth/me/avatar, POST /api/ai/generate-bio (frontend-only)
```

```text
Page: Company workspace | Route: /company/* | Purpose: offers, applications, pipeline, team, settings/logo
API: /companies/* (incl. /logo), /offers/*, /applications*, /invites/employee/*, /chat/recruitment*
Components: company/AppShell.tsx, CompanyLogoSection.tsx, CandidateCard.tsx, RecruitmentThread.tsx
```

```text
Page: Admin | Route: /admin/* | Purpose: stats, users, offers, pending recruiters, activity, impersonation
API: /admin/*, /audit | Components: admin/*
```

```text
Page: Chat | Route: /chat/* | Purpose: recruitment conversations (stage-gated) + legacy direct inbox
API: /chat/recruitment*, WS .../ws?token=, legacy /chat/send /with/{uid} /conversations
Components: candidate/chat-workspace.tsx, chat-view.tsx
```

---

## Backend architecture

- **Framework/entry:** FastAPI (`apps/api/app/main.py:17-21`, `title="CODITENT API"`), Python 3.12 (`apps/api/Dockerfile`, CI `setup-python 3.12`). Start: `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8001` (`docker-compose.yml:25-27`); healthcheck polls `GET /health`.
- **Routers:** 12 mounted with prefixes in `main.py:45-56` (`/auth`, `/candidates`, `/offers`, `/recommendations`, `/companies`, `/requests`, `/invites`, `/applications`, `/assessments`, `/audit`, `/chat`, admin without prefix).
- **AuthN:** `get_current_user` (`dependencies.py:20-48`) — `HTTPBearer(auto_error=False)` first, `access_token` cookie fallback; `sub`→UUID→`users` row. OpenAPI Bearer scheme so Swagger "Authorize" works.
- **AuthZ gates** (`dependencies.py:51-177`): `require_platform_admin`, `require_company_user`, `require_company_owner`, `require_company_admin` (OWNER/ADMIN), `require_company_member` (all 5 company roles), `require_candidate`, `require_candidate_account` (strict), `require_recruiter` (COMPANY_USER-approved or legacy), `require_admin` (PLATFORM_ADMIN + legacy ADMIN compat). Write paths double-gate (dependency + `can()`).
- **Validation:** Pydantic `schemas.py` (357 lines) + `sanitize_input_text` validators on profile/offer text; UUID parsing; `401` unauthenticated only, `403` wrong role/scope/approval, `404` miss *or deliberate isolation* (same "not found" to avoid leaking cross-company existence).
- **Services** (`services/`): `ai.py` (ranking + single-match), `screening.py`, `cv_parser.py`, `cv_extraction.py`, `cv_storage.py` (bucket `candidate-cvs`), `company_logo.py` (bucket `company-logos`), `email.py` + `email_verification.py` (Resend via `urllib`), `oauth_service.py`, `recruitment_chat.py` (rules), `recommendation_jobs.py` (cache key + fallback + generation), `match_scoring.py` (per-offer lifecycle), `admin_seed.py`.
- **Background:** Celery `coditent` app, JSON only (`tasks.py:15-20`) — 3 tasks: `recommendations.generate`, `recommendations.score_single`, `applications.screen`. Each builds a fresh event loop + `engine.dispose()` first (fork-pool loop-binding fix, `tasks.py:40-51`). No beat/scheduler — no periodic jobs; expiry is lazy everywhere.
- **Realtime:** WS ` /chat/recruitment/{application_id}/ws?token=JWT` (`routers/chat.py:469`), in-memory fan-out (single replica; code comment flags Redis pub/sub need).
- **Observability:** `structlog` loggers, Prometheus `/metrics` (`main.py:79-81`, `observability.py`), `/protected` auth probe, Vault best-effort secret sync on startup (`main.py:59-70`).

---

## How frontend and backend communicate

1. **Base URL** (`lib/api.ts:18-29`): browser + HTTPS page + `http://` backend → `/api-proxy` (Next.js rewrite to `NEXT_PUBLIC_API_URL`, `next.config.mjs:17-32`); else direct `NEXT_PUBLIC_API_URL`; SSR fallback `http://34.205.255.37`.
2. **Credentials:** `withCredentials:true` + `Authorization: Bearer <localStorage coditent_token>` per request (`lib/api.ts:31-67`). Backend accepts Bearer first, `access_token` HttpOnly cookie fallback (cookie is only set on SSO flows — `routers/auth.py:153-161` — so email-login users rely on Bearer).
3. **CORS** (`main.py:29-41`): explicit frontend origins (`settings.frontend_url`, `localhost:3000/3001` + `127.0.0.1` variants), `allow_credentials=True`, all methods/headers.
4. **Protected endpoints:** `require_*` dependency → 401 (missing/bad/expired token, vanished user) or 403 (wrong role/scope/approval). Frontend 401 interceptor clears token and redirects protected paths to `/login?next=` or `/admin/login?next=` (`lib/api.ts:69-90`).
5. **Errors:** `HTTPException` + global `Exception→500` (`main.py:95-98`), slowapi 429, Pydantic 422. Typed CV/AI errors: 400 file errors, 422 no-text, 502 upstream AI/mail/storage, 503 unconfigured SSO/storage-missing, 504 AI timeout, 413 oversized logo, 409 OTP race, 410 deprecated `POST /companies/{id}/join`.
6. **Realtime:** WS URL builder (`lib/api.ts:620-627`) puts the JWT in `?token=` (proxy/CDN-log exposure tradeoff, documented); per-message re-auth server-side; 3 s polling fallback in UI.
7. **Avatar/logo note:** `PUT /auth/me/avatar` stores a URL string; company logos upload bytes to `POST /companies/{id}/logo` and expose only the storage path + scoped stream.

Real example — "User clicks Apply":

```text
User clicks "Apply" on candidate/job-details.tsx
        ↓  api.post("/applications", { opportunity_id }) — Bearer injected (lib/api.ts)
POST /applications (routers/applications.py:289 — require_candidate_account equivalent, CANDIDATE only)
        ↓  UUID + offer-exists + duplicate check (400 "Already applied"; UQ backstop uq_applications_candidate_opportunity)
INSERT applications (company_id derived from offer — never client input)
        ↓  audit APPLICATION_CREATED + queue applications.screen (failure swallowed)
Backend response { application } → frontend invalidates queries, shows stage + ai_status=pending
        ↓  Celery worker: applications.screen → Gemini → ai_score/ai_report + ai_status completed|failed
Recruiter sees score via GET /applications (company join, view_applications gate)
```

---

## Database architecture

- **Provider:** Supabase-hosted PostgreSQL — sole persistent DB. No local container, no SQLite.
- **Library:** SQLAlchemy 2 async + `asyncpg` (`database.py:41-46`: `statement_cache_size=0`, `prepared_statement_cache_size=0`, `pool_pre_ping=True` for PgBouncer 5432/6543 compat). `DeclarativeBase` (`database.py:50-56`), per-request `AsyncSession` (`get_db`).
- **Connection:** `DATABASE_URL` normalized (`postgresql://`→`postgresql+asyncpg://`) and local markers rejected (`database.py:9-33`, `config.py:47-56`).
- **Migrations:** 20 Alembic versions (`apps/api/alembic/versions/`), async env, auto-applied on container start. Dead trace: `friendships` + `users.last_seen` created then dropped.
- **Conventions:** UUID PKs (`default=uuid4`), naive `created_at default=utcnow` everywhere, mostly `NO ACTION` FKs (deletes blocked/orphan — no soft-delete), free-text status/role columns (DB can't constrain them).
- **Raw-SQL tables (no ORM model):** `company_invitations`, `employee_invitations`, `pending_registrations` — used by `routers/invitations.py` and auth OTP endpoints; drift risk (no relationships).

| Table/Model | Purpose | Primary key | Important fields | Relationships |
| ----------- | ------- | ----------- | ---------------- | ------------- |
| `users` (`models.py:61-88`) | Identity for candidates, company users, platform admins | UUID `id` | `email` UNIQUE, `password_hash`, `role` enum (default CANDIDATE), `is_approved`, `full_name`, `oauth_provider/oauth_id` (no unique), `avatar_url`, `company_id` FK NULL, `company_role` free String, `created_at` | M2O `company`; 1-1 `profile`; 1-M `offers` (via `recruiter_id`); 1-M `recommendations` |
| `candidate_profiles` (`models.py:91-122`) | 1-1 CV extension | UUID `id` | `user_id` FK UNIQUE; all content NULL: city/phone/headline/bio/field/university/study_level/skills/years/linkedin/portfolio/languages/`cv_url`/desired_*/onboarding_*/overall_score/validated_skills | 1-1 `user` |
| `offers` (`models.py:125-171`) | Unified offer/opportunity (legacy `company` text + new `company_id` FK) | UUID `id` | `recruiter_id` FK NOT NULL (legacy owner); `title/company/region/field/type/description/requirements` NOT NULL; `company_id/created_by/responsible_hr_id` NULL; location/work_mode/required_*/salary/deadline NULL; `opportunity_status` free String default `active`; `active` bool; `posted_at` | M2O recruiter/responsible_hr/company_obj; 1-M recommendations/applications |
| `saved_recommendations` (`models.py:174-197`) | Cached candidate↔offer AI match | UUID `id` | `candidate_id/offer_id` NOT NULL; `ai_score` NOT NULL; `ai_reasoning` NOT NULL; `status` (`pending/processing/completed/failed`, default `pending`); `error`; UQ pair | M2O candidate + offer |
| `companies` (`models.py:206-227`) | Tenant | UUID `id` | `name` UNIQUE NOT NULL; `logo_url` NULL; industry/location/website/company_size/contact_*/region/description NULL; `status` default `active`; `owner_id` FK NULL | 1-M `recruiters` (users); M2O `owner` |
| `candidate_requests` (`models.py:230-247`) | Company→candidate outreach | UUID `id` | `candidate_id` CASCADE, `company_id` CASCADE, `recruiter_id` SET NULL; `message`; `status` enum default `pending` (no pair-unique — duplicates possible) | M2O candidate/company/recruiter |
| `chat_messages` (`models.py:250-289`) | All messages; `application_id` NULL = legacy general chat | UUID `id` | `sender_id/receiver_id` CASCADE; `application_id` CASCADE NULL; `content` Text | M2O sender/receiver/application |
| `applications` (`models.py:292-316`) | Candidate application + AI screening result | UUID `id` | `candidate_id` CASCADE, `opportunity_id` CASCADE, `company_id` NULL; `status` free String default `applied`; `cv_url/cover_letter` NULL; `ai_score/ai_report` NULL; `ai_status` default `pending`; UQ pair | M2O candidate/opportunity/company |
| `assessments` (`models.py:319-338`) | Assessment rows (read-only API) | UUID `id` | `application_id` CASCADE, `candidate_id` CASCADE, `created_by` NULL; `title`; `status` default `pending`; `score/report` NULL (no writer in `app/`) | M2O application/candidate |
| `admin_activity_logs` (`models.py:341-351`) | Append-only audit | UUID `id` | `action(80)`, `admin_id` FK, `admin_email` (denormalized), `target_user_id` UUID NULL **no FK** (can dangle), `target_user_email`, `details` | M2O admin only |
| `company_invitations` (raw SQL) | Platform→company invites | `id` | email, company_name, token_hash UNIQUE, status, invited_by, company_id NULL, expires_at (7 d), accepted/revoked_at | No ORM relations |
| `employee_invitations` (raw SQL) | Owner→employee invites | `id` | email, company_id NOT NULL CASCADE, role NOT NULL, token_hash UNIQUE, expires_at (72 h) | No ORM relations |
| `pending_registrations` (raw SQL) | OTP register staging | `id` | email UNIQUE, full_name, password_hash, otp_hash, otp_expires_at, otp_attempts, last_otp_sent_at | Isolated (no FKs) |

Per-model relationship sketches:

```text
User
 ├── Company (company_id → companies.id; company_role free String, validated by can())
 ├── CandidateProfile (1-1 via profile.user_id UNIQUE)
 ├── Offer (1-M via offers.recruiter_id — legacy owner link)
 └── SavedRecommendation (1-M via candidate_id)
Company
 ├── User (1-M members via users.company_id) + owner (owner_id → users.id)
 ├── Offer (1-M via offers.company_id, nullable)
 └── Application (1-M via applications.company_id, nullable)
Offer
 ├── SavedRecommendation (1-M) + Application (1-M via opportunity_id)
 └── responsible_hr (→ users.id; fallback created_by → recruiter_id)
Application (= one logical recruitment conversation)
 ├── ChatMessage (1-M via application_id) + Assessment (1-M)
 └── CandidateRequest is separate (company→candidate outreach, not application-bound)
```

---

## ER diagram

```mermaid
erDiagram
    USER ||--o{ CANDIDATE_PROFILE : "has 1-1"
    USER ||--o{ OFFER : "owns via recruiter_id"
    COMPANY ||--o{ USER : "employs"
    USER }o--|| COMPANY : "owner_id nullable"
    COMPANY ||--o{ OFFER : "publishes nullable"
    USER ||--o{ SAVED_RECOMMENDATION : "receives"
    OFFER ||--o{ SAVED_RECOMMENDATION : "ranked in"
    USER ||--o{ CANDIDATE_REQUEST : "targeted"
    COMPANY ||--o{ CANDIDATE_REQUEST : "sends"
    USER ||--o{ APPLICATION : "submits"
    OFFER ||--o{ APPLICATION : "receives"
    COMPANY ||--o{ APPLICATION : "scoped nullable"
    APPLICATION ||--o{ CHAT_MESSAGE : "conversation"
    USER ||--o{ CHAT_MESSAGE : "sends"
    APPLICATION ||--o{ ASSESSMENT : "assessed by"
    USER ||--o{ ASSESSMENT : "takes"
    USER ||--o{ ADMIN_ACTIVITY_LOG : "audited"
```

FK map (verified in `models.py`; `*` nullable, `C` cascade, `N` set-null, `-` no action):

```text
companies.owner_id(*,-) → users | users.company_id(*,-) → companies
candidate_profiles.user_id(1-1 UNIQUE,-) → users
offers.recruiter_id(-)/.created_by(*,-)/.responsible_hr_id(*,-) → users; offers.company_id(*,-) → companies
saved_recommendations [UQ pair](-,-) → users + offers
candidate_requests → users(C) + companies(C); recruiter_id(*,N) → users
applications [UQ pair] → users(C) + offers(C); company_id(*,-) → companies
assessments → applications(C) + users(C); created_by(*,-) → users
chat_messages → users(C) + users(C) + applications(C, nullable)
admin_activity_logs.admin_id(-) → users; target_user_id: no FK
```

---

## API documentation

Base: `NEXT_PUBLIC_API_URL` (local `http://localhost:8001`; prod via `/api-proxy`). Auth column: `PUB` = public, otherwise the `require_*` gate. Company endpoints additionally enforce same-company scoping (foreign → `404`) and `can()` checks noted in Roles. Total documented: **89 router endpoints + 3 system = 92**.

### System

| Method | Endpoint | Purpose | Auth | Frontend usage |
| ------ | -------- | ------- | ---- | -------------- |
| GET | `/health` | Liveness (compose healthcheck + deploy gate) | PUB | deploy/ops |
| GET | `/metrics` | Prometheus metrics (`observability.py`) | PUB | ops |
| GET | `/protected` | Auth probe (returns id/email/role) | any user | debug |

### Authentication (`apps/api/app/routers/auth.py`, prefix `/auth`)

| Method | Endpoint | Purpose | Auth | Notes |
| ------ | -------- | ------- | ---- | ----- |
| GET | `/auth/sso/providers` | List configured SSO providers | PUB | login UI |
| GET | `/auth/sso/{provider}/start` | Authorize redirect with signed state | PUB | `social-login-buttons.tsx` |
| GET | `/auth/sso/{provider}/callback` | Code exchange, link-or-onboard, JWT + HttpOnly cookie | PUB | proxied by Next rewrites |
| POST | `/auth/oauth/complete-registration` | Finish SSO onboarding (candidate-only roles) | onboarding cookie | choose-role flow |
| POST | `/auth/oauth/handoff/exchange` | Exchange handoff code for JWT (popup flow) | PUB + code | `oauth-popup.ts`, `test_oauth_popup.py` |
| POST | `/auth/register` → 202 | CANDIDATE-only (`Literal["CANDIDATE"]`, `auth.py:396-397`); creates `pending_registrations` + OTP email; mail failure deletes row → 502 | PUB, 10/min | register page |
| POST | `/auth/verify-email` | OTP check (`FOR UPDATE` lock, 5 attempts, expiry) → creates `users` + `CandidateProfile`, returns `TokenResponse` | PUB | verify-email page |
| POST | `/auth/resend-verification` → 202 | New OTP invalidates old, 60 s cooldownGuard, 429 + `retry_after_seconds` | PUB, 5/min | verify-email resend |
| POST | `/auth/login` → `TokenResponse` | bcrypt check; legacy unapproved RECRUITER → 403; JSON token only (no cookie) | PUB, 5/min | login pages |
| PUT | `/auth/me/avatar` | Set avatar URL string (`AvatarUpdate`, ≤5M chars) | any user | profile avatar |
| GET | `/auth/me` | Current user + embedded profile | any user | session bootstrap |

No logout / refresh / password-reset endpoints — NOT IMPLEMENTED (frontend clears storage, `lib/auth.ts:22-29`).

### Candidates (`routers/candidates.py`, prefix `/candidates`)

| Method | Endpoint | Purpose | Auth |
| ------ | -------- | ------- | ---- |
| GET | `/candidates/onboarding` | Onboarding state | candidate account |
| PUT | `/candidates/onboarding/step` | Save step 1-6 (`OnboardingStepUpdate`) | candidate account |
| POST | `/candidates/onboarding/complete` | Mark onboarding done | candidate account |
| GET | `/candidates/profile` | Own profile | candidate |
| PUT | `/candidates/profile` | Partial `ProfileUpdate` (city/phone/headline/bio/field/university/level/skills/exp/linkedin/portfolio) | candidate |
| POST | `/candidates/cv` → 201 | Upload CV: pdf/docx allowlist + magic bytes (`%PDF`, `PK\x03\x04`) + 5 MB cap (413); deletes previous; path `{uid}/{uuid}_{safe}.{ext}` in `candidate-cvs` | candidate |
| GET | `/candidates/cv/meta` | CV pointer metadata | candidate |
| GET | `/candidates/cv` | Attachment stream (own CV) | candidate |
| DELETE | `/candidates/cv` → 204 | Remove file + clear `cv_url` (clears DB even on storage miss) | candidate |
| POST | `/candidates/cv/parse` | Extract text (`pypdf`/`python-docx`, <20 chars → `CV_NO_TEXT`, 20k cap) → Gemini structured extract → returns `{extracted,warnings,has_cv,meta}`; **persists nothing** (suggest-don't-overwrite) | candidate |

### Companies (`routers/companies.py`, prefix `/companies`)

| Method | Endpoint | Purpose | Auth | Roles |
| ------ | -------- | ------- | ---- | ----- |
| GET | `/companies` | List (with `recruiter_count`) | PUB | — |
| GET | `/companies/{id}` | Get one (`CompanyOut` incl. `logo_url`) | PUB | — |
| POST | `/companies` | Legacy create (caller becomes OWNER). Invitation flow preferred | `require_recruiter` | any recruiter — known risk B3 |
| POST | `/companies/{id}/join` | Always `410 Gone` (invitation-only) | `require_recruiter` | — |
| GET | `/companies/{id}/recruiters` | Recruiter list (+`members` alias) | any user; COMPANY_USER scoped to own | — |
| GET | `/companies/{id}/members` | Members ordered by join | company member, same company | — |
| PATCH | `/companies/{id}` | Whitelisted update (`name/region/description/logo_url/industry/location/website/company_size/contact_*`) + audit | member, same company | `edit_company` (OWNER/ADMIN) |
| GET | `/companies/{id}/logo` | **Public** logo stream for candidate pages; re-resolves DB path, enforces company-prefix, `Cache-Control: max-age=3600`; missing → 404 | PUB | — |
| POST | `/companies/{id}/logo` → 201 | Upload/replace logo (2 MB, png/jpg/webp + magic bytes, unique path, deletes old first) + audit | member, same company | `edit_company` |
| DELETE | `/companies/{id}/logo` → 204 | Remove logo (storage + `logo_url=None`) + audit | member, same company | `edit_company` |
| PATCH | `/companies/{id}/members/{user_id}` | Role change (ADMIN/HR/RECRUITER/HIRING_MANAGER only; never OWNER) + audit | `require_company_admin`, same company | `change_employee_roles` |
| DELETE | `/companies/{id}/members/{user_id}` → 204 | Remove member (not self/OWNER) + audit | `require_company_admin`, same company | `remove_employees` |
| GET | `/companies/{id}/subscription` | `{company_id,status,owner_id}` | member, same company | `manage_subscription` (OWNER) |

### Invitations (`routers/invitations.py`, prefix `/invites`)

| Method | Endpoint | Purpose | Auth |
| ------ | -------- | ------- | ---- |
| POST | `/invites/company/invite` | Platform invites company (one live pending/email, 7-day expiry, branded email with `/company/invite/accept?token=`; returns URL + `email_sent`) | platform admin |
| GET | `/invites/company/invitations` | List company invites | platform admin |
| GET | `/invites/company/invitations/{id}` | Get one | platform admin |
| POST | `/invites/company/invitations/{id}/revoke` | Revoke | platform admin |
| POST | `/invites/company/invitations/{id}/resend` | Revoke old + insert new | platform admin |
| GET | `/invites/company-invitations/validate` | Public validate + lazy-expire | PUB |
| POST | `/invites/company/accept` | Public accept: one commit creates `Company(active)` + `User(COMPANY_USER/OWNER/approved)` + marks accepted | PUB + token |
| POST | `/invites/employee/invite` | Owner invites employee (roles ADMIN/HR/RECRUITER/HIRING_MANAGER; OWNER rejected; no self/same-company/live-duplicate; 72 h) | OWNER/ADMIN + `invite_employees` |
| GET | `/invites/employee/invitations` | List (same-company) | OWNER/ADMIN |
| GET | `/invites/employee/validate` | Public validate + lazy-expire | PUB |
| POST | `/invites/employee/invitations/{id}/revoke` | Revoke (same-company) | OWNER/ADMIN |
| POST | `/invites/employee/resend` | Resend with rotation | OWNER/ADMIN |
| POST | `/invites/employee/accept` | New-user accept (email-taken → use existing flow) | PUB + token |
| POST | `/invites/employee/accept-existing` | Existing-user accept (email must match, cross-company blocked, CANDIDATE→COMPANY_USER, role from invite) | authed + token |

### Offers (`routers/offers.py`, prefix `/offers`)

| Method | Endpoint | Purpose | Auth |
| ------ | -------- | ------- | ---- |
| GET | `/offers` | Public active-only list (filter region/field/type) | PUB |
| POST | `/offers` | Create (`company_id` forced from caller; `responsible_hr_id` defaults to creator); busts `recommendations:*` cache; audit | member + `create_offers` |
| GET | `/offers/mine` | Own-company offers | member — Implemented, no frontend caller found |
| PATCH | `/offers/{id}/responsible-hr` | Reassign to same-company COMPANY_USER | OWNER/ADMIN + audit |
| PATCH | `/offers/{id}/toggle` | Flip `active` + cache bust, no audit | any member — **missing `can()` check (known issue B1)** |
| GET | `/offers/{id}` | Role-branched detail (admin/candidate wide, company scoped) | PUB/role-branched |
| PUT | `/offers/{id}` | Full `OfferCreate` update + audit (no PATCH semantics) | admin wide / company + `edit_offers` |
| DELETE | `/offers/{id}` → 204 | Delete + audit (blocked by child rows — no cascade) | company + `delete_offers` |

### Applications (`routers/applications.py`, prefix `/applications`)

| Method | Endpoint | Purpose | Auth |
| ------ | -------- | ------- | ---- |
| GET | `/applications` | 3 role shapes: candidate (own + `ai_status` only), company (join + scores, `view_applications`, same company), admin (wide) | role-branched |
| GET | `/applications/{id}` | Detail (candidate sees own; company same-company + scores) | role-branched |
| GET | `/applications/{id}/cv` | Application CV stream | scoped (candidate owner / same-company / admin) |
| POST | `/applications` | Apply `{opportunity_id, cv_url?, cover_letter?}` → 400 "Already applied" on dup (UQ backstop); `company_id` from offer; audit + queue `applications.screen`. No withdraw endpoint | CANDIDATE only (403 else) |
| POST | `/applications/{id}/screen` | Reset to pending + requeue screening (`processing` short-circuits) | COMPANY_USER + `evaluate_candidates` same-company; PLATFORM_ADMIN |
| PATCH | `/applications/{id}` | Stage change (7-value allowlist: `under_review, shortlisted, assessment_required, assessment_completed, interview, accepted, rejected`; free jumping allowed); audit (`APPLICATION_STATUS_CHANGED` / `CANDIDATE_SHORTLISTED` / `CANDIDATE_REJECTED` / `RECRUITMENT_CHAT_ENABLED` on chat-stage entry) | PLATFORM_ADMIN wide or COMPANY_USER + `move_recruitment_stage` same-company; CANDIDATE always 403 |

### Recommendations (`routers/recommendations.py`, prefix `/recommendations`)

| Method | Endpoint | Purpose | Auth |
| ------ | -------- | ------- | ---- |
| POST | `/recommendations/generate` | Cache lookup (`recommendations:{candidate}:{sha(criteria)}`); miss → `job:{id}=pending` (TTL 3600) + `recommendations.generate` task | candidate (own rows) |
| GET | `/recommendations/jobs/{job_id}` | Poll `pending/running/completed/failed` (ownership-checked) | candidate owner-only |
| POST | `/recommendations/score/{offer_id}` | Move pending/failed → processing + queue `recommendations.score_single` (Celery or inline fallback) | candidate owner |
| GET | `/recommendations/by-offer/{offer_id}` | Single match row | candidate owner |
| GET | `/recommendations/config-status` | AI provider configured? (no secret leakage) | candidate |
| GET | `/recommendations` | Ranked `SavedRecommendation`s; auto-inserts `ai_score=0` **pending placeholder** rows for unscored active offers | candidate (own rows) |

### Assessments (`routers/assessments.py`, prefix `/assessments`) — read-only

| Method | Endpoint | Purpose | Auth |
| ------ | -------- | ------- | ---- |
| GET | `/assessments` | Sparse list (`{id,status[,score]}`): admin wide, candidate own, company via offer join + `view_assessments` | role-branched |
| GET | `/assessments/{id}` | Sparse detail with ownership/company checks (404 isolation) | role-branched |

Create / assign / submit / score / delete: NOT IMPLEMENTED (no writers in `app/`).

### Chat (`routers/chat.py`, prefix `/chat`)

| Method | Endpoint | Purpose | Auth |
| ------ | -------- | ------- | ---- |
| POST | `/chat/send` | Legacy general message (gated by accepted `CandidateRequest` on send) | any user |
| GET | `/chat/with/{user_id}` | Legacy 1-1 thread — **no peer/relationship check (known issue B2)** | any user |
| GET | `/chat/conversations` | Legacy inbox threads | any user |
| GET | `/chat/recruitment` | Enabled-only recruitment list (HR filtered to own `responsible_hr`) | stage-gated |
| GET | `/chat/recruitment/{application_id}` | Context + ≤100 messages (`[]` if disabled) + `company_logo_url` | `can_access_recruitment_chat` |
| POST | `/chat/recruitment/{application_id}` | Send (receiver derived server-side; 2000-char cap) | `can_access_recruitment_chat` |
| WS | `/chat/recruitment/{application_id}/ws?token=` | Realtime frames (`ready/message/error`), close codes 4401/4403/4404, in-memory fan-out | JWT query + full re-check per message |

### Requests (`routers/requests.py`, prefix `/requests`)

| Method | Endpoint | Purpose | Auth |
| ------ | -------- | ------- | ---- |
| POST | `/requests` | Company→candidate outreach (`{company_id, recruiter_id?, message?}`) | company member |
| GET | `/requests` | List (role-branched) | role-branched |
| PATCH | `/requests/{request_id}` | Accept/reject — **403s PLATFORM_ADMIN (legacy `ADMIN` check, known issue B4)** | candidate/company |

### Audit (`routers/audit.py`, prefix `/audit`)

| Method | Endpoint | Purpose | Auth |
| ------ | -------- | ------- | ---- |
| GET | `/audit` | Admin: last 50; company: filtered 50 (substring match on `details` — known issue B5); others: empty | role-branched |

### Admin (`routers/admin.py`, no prefix)

| Method | Endpoint | Purpose | Auth |
| ------ | -------- | ------- | ---- |
| GET | `/admin/recruiters/pending` | Pending legacy recruiters | platform admin |
| PATCH | `/admin/recruiters/{id}/approve` | Approve | platform admin |
| PATCH | `/admin/recruiters/{id}/reject` | Reject | platform admin |
| GET | `/admin/stats` | 9 fields (`AdminStatsOut`: users/candidates/recruiters/offers/companies/active/pending-invites/expired/active-offers) | platform admin |
| GET | `/admin/users` | Paginated users | platform admin |
| GET | `/admin/offers` | Paginated offers | platform admin |
| GET | `/admin/activity` | Activity log (returns `[]` on DB error — masks failure, known issue B6) | platform admin |
| POST | `/admin/impersonate/{user_id}` | Mint JWT for user + audit | platform admin |

---

## Authentication flow

```mermaid
sequenceDiagram
    participant U as User
    participant W as Next.js (lib/api.ts)
    participant A as FastAPI (routers/auth.py)
    participant D as Supabase Postgres (users + pending_registrations)
    U->>W: Register (email, password, full_name)
    W->>A: POST /auth/register
    A->>D: INSERT pending_registrations (OTP sha256, expiry, attempts=0)
    A->>U: OTP email via Resend (failure deletes row → 502)
    A-->>W: 202 {detail, email, expires_in_seconds}
    U->>W: Enter OTP
    W->>A: POST /auth/verify-email
    A->>D: Row FOR UPDATE → checks → INSERT users(CANDIDATE, approved) + candidate_profiles → DELETE pending
    A-->>W: TokenResponse {token, user}
    W->>W: localStorage coditent_token → role-based redirect
    U->>W: Login
    W->>A: POST /auth/login (5/min)
    A->>D: bcrypt verify → legacy unapproved RECRUITER 403
    A-->>W: TokenResponse (no cookie; SSO flows also set HttpOnly cookie)
    W->>A: GET /auth/me (Bearer) → session bootstrap
```

- **Authority is `public.users`, not Supabase `auth.users`.** `get_current_user` parses `sub`→UUID and loads the DB row (`dependencies.py:20-48`); role/company checks read the row, never the JWT `role` claim. Supabase is Postgres hosting + Storage; `middleware.ts` only refreshes Supabase cookies.
- **JWT** (`utils/jwt.py`): HS256, claims `{sub, email, role}`, 60-min default (`config.py:22`). Errors → `ValueError` → 401.
- **Bearer-first, cookie fallback** (`dependencies.py:26-32`): `HTTPBearer(auto_error=False)`; else HttpOnly `access_token` cookie. Missing → 401 "Missing bearer token". Quirk: backend sets the cookie only on SSO flows (`auth.py:153-161`); email login returns token JSON only.
- **Frontend:** login routes by `user.role`; register → `/verify-email?email=`; verify → token → `/profile`. Axios injects Bearer (`lib/api.ts:55-64`, `withCredentials:true`); WS uses `?token=` (`lib/api.ts:620-627`). Edge middleware (`middleware.ts:39-81`) redirects by decoded JWT role. **No frontend user-ID trust on writes**: candidate/company/receiver IDs are derived server-side (`applications.py:289` create endpoint, `chat.py` receiver derivation, `offers.py:74-78` company enforcement).
- **SSO** (`/auth/sso/*`): authorize redirect with signed state → callback exchanges code server-side, verifies email, links by email (+profile backfill) or issues onboarding cookie → `POST /oauth/complete-registration` (candidate-only). OAuth never creates company roles. Popup handoff via `/auth/oauth/handoff/exchange` (`oauth-popup.ts`, `test_oauth_popup.py`).

---

## Roles and permissions

Platform roles (`models.py:11-16`): `CANDIDATE`, `COMPANY_USER`, `PLATFORM_ADMIN`, legacy `RECRUITER` / `ADMIN` ("do not create", still readable). Company roles (`models.py:31-36`, free String validated by `VALID_COMPANY_ROLES`): `OWNER ADMIN HR RECRUITER HIRING_MANAGER`.

Real matrix (`app/core/permissions.py:18-33`, mirrored in `web/src/lib/permissions.ts:3-20`):

| Action | OWNER | ADMIN | HR | RECRUITER | HIRING_MANAGER |
| ------ | :---: | :---: | :-: | :-------: | :------------: |
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

Enforcement: `require_*` dependency (platform role + membership) **plus** `can(company_role, action)` in the handler; cross-company/cross-candidate access returns `404` (not 403) to avoid leaking existence (`companies.py:124-125,139-140` member scoping + logo endpoints `212-213,267-268`; `offers.py` scoped reads; `applications.py` role shapes; `assessments.py:56-61`; `chat.py` 404-vs-403 docstring). Backend authorization is the security boundary; frontend `lib/permissions.ts` is UX-only (hides buttons, never trusted).

---

## Company + employee invitation flow

```mermaid
sequenceDiagram
    participant PA as Platform admin
    participant API as FastAPI (routers/invitations.py)
    participant DB as Postgres (raw-SQL invite tables)
    participant Mail as Resend
    participant OW as Company owner
    participant HR as Employee
    PA->>API: POST /invites/company/invite (require_platform_admin)
    API->>DB: INSERT company_invitations (token_hash UNIQUE, 7-day expiry)
    API->>Mail: Branded email /company/invite/accept?token= (best-effort flag)
    OW->>API: POST /invites/company/accept (public + token)
    API->>DB: One commit: Company(active) + User(COMPANY_USER/OWNER/approved) + accepted
    OW->>API: POST /invites/employee/invite (OWNER/ADMIN + invite_employees)
    API->>DB: INSERT employee_invitations (role, 72h expiry)
    API->>Mail: Employee email (best-effort)
    HR->>API: POST /invites/employee/accept (new) or /accept-existing (email-match)
    API->>DB: INSERT or convert User (CANDIDATE→COMPANY_USER, role from invite)
```

- No public company registration. Entry is (a) platform invite (above) or (b) legacy authenticated `POST /companies` (caller becomes OWNER — local-dev path, known risk B3).
- States: `pending → accepted | revoked | expired` (resend revokes old + inserts new). Validate endpoints are public with lazy-expiry.
- Employee accept: roles restricted to ADMIN/HR/RECRUITER/HIRING_MANAGER (OWNER rejected — ownership transfer NOT IMPLEMENTED); no self-invite, no same-company member, no live duplicate; existing-user path blocks same-company/another-company and requires invite-email == account-email.
- Team ops: role change (never OWNER), remove (not self/OWNER), all same-company scoped (`companies.py:292-339`).

---

## Recruitment workflow

```mermaid
flowchart TD
    Create[Company creates offer - POST /offers] --> Store[(offers row - company_id forced)]
    Store --> Discover[Candidate discovers - GET /offers or recommendations]
    Discover --> Apply[Candidate applies - POST /applications]
    Apply --> Screen[Celery applications.screen - Gemini - ai_score/ai_report]
    Screen --> Review[Recruiter reviews - GET /applications - view_applications]
    Review --> Stage[Stage change - PATCH /applications - move_recruitment_stage]
    Stage --> Chat{Stage chat-enabled?}
    Chat -->|shortlisted/assessment_*/interview/accepted| Talk[Recruitment chat - REST + WS]
    Chat -->|applied/under_review/rejected| Locked[Chat locked]
    Stage --> Assess[Assessment - read-only GET - assign/submit NOT IMPLEMENTED]
    Stage --> Interview[interview = status string only - scheduling NOT IMPLEMENTED]
    Stage --> Hire[accepted/rejected - audit only, no notifications]
```

| Step | Frontend | API call | Backend | DB | State |
| ---- | -------- | -------- | ------- | -- | ----- |
| Create offer | company offers page | `createOffer()` → `POST /offers` | `offers.py:66` member + `create_offers`; `responsible_hr_id` = creator | INSERT `offers` | `active=true`, cache bust, audit |
| Discover | `/offers`, `/dashboard` | `getOffers()` / `getRecommendations()` | public list / rec list + placeholders | read | — |
| Apply | job-details apply | `POST /applications` (no `createApplication` helper — direct call) | `applications.py:289` CANDIDATE-only; 400 dup; UQ backstop | INSERT `applications` (`company_id` from offer) | `applied`, screening queued |
| Screening | application detail (`ai_status`) | auto + `POST /applications/{id}/screen` | `screen_application_task` → `screening.py` | `ai_score/ai_report/ai_status` | `pending→processing→completed\|failed` |
| Review | company candidates | `GET /applications` | join + scores, same-company | read | — |
| Stage | pipeline UI | `PATCH /applications/{id}` | 7-value allowlist, free jumping; audit | status update | any of 8 statuses |
| Chat | chat workspace / RecruitmentThread | `/chat/recruitment*` + WS | stage gate + responsible-HR gate | `chat_messages` rows | enabled only in 5 stages |
| Hire/reject | pipeline | same PATCH → `accepted/rejected` | audit only | status update | no notifications |

Backend has **no stage state machine** — `applications.status` is a free String; the only enforced rule is the 7-value allowlist on PATCH. Chat unlock is stage-derived (`CHAT_ENABLED_STATUSES` in `recruitment_chat.py:28-36`), not event-driven.

---

## Chat system

```mermaid
flowchart TD
    Stage[Application status] --> Gate{is_chat_enabled_for_status?}
    Gate -->|applied/under_review/rejected| No[chat_enabled=false - [] + no peer]
    Gate -->|shortlisted/assessment_required/assessment_completed/interview/accepted| Auth{can_access_recruitment_chat}
    Auth -->|CANDIDATE = application.candidate_id| PeerHR[peer = responsible_hr - offer.responsible_hr_id → created_by → recruiter_id]
    Auth -->|COMPANY_USER = responsible HR + same company + view_applications| PeerC[peer = candidate]
    Auth -->|anyone else incl. platform admins| Deny[deny - 404/403]
    PeerHR --> REST[GET/POST /chat/recruitment -app- - receiver derived server-side]
    PeerC --> REST
    REST --> Persist[(chat_messages - ≤100 asc reads)]
    REST --> WS[WS /ws?token= - ready/message/error - per-message re-auth - in-memory fan-out]
    WS --> Poll[3s polling fallback in UI]
```

- Conversations are created implicitly: one application = one logical conversation (no conversation table; `get_or_create_recruitment_conversation` is a locked fetch, never an insert).
- Message cap 2000 chars (`RecruitmentMessageCreate`, `ChatMessageCreate`).
- Persistence: `chat_messages` rows. **No unread state, no read receipts, no typing indicators, no attachments.**
- Legacy general chat (`POST /send`, `GET /with/{uid}`, `GET /conversations`) coexists; send is gated by accepted `CandidateRequest`, but `GET /with/{uid}` has no peer check (known issue B2).
- A candidate CAN message the HR responsible for an offer, but only after the application reaches a chat-enabled stage, and only with the responsible HR (not any company member).

---

## AI architecture

Provider: Google Gemini only, model `gemini-3-flash-preview` at all three backend call sites (`services/ai.py:14`, `services/cv_extraction.py:71-77`, `services/screening.py:26-27`). Key from `GEMINI_API_KEY`.

| Feature | Trigger | Frontend | Backend endpoint | Service | Input | Output / validation | Storage | Fallback | Failure |
| ------- | ------- | -------- | ---------------- | ------- | ----- | ------------------- | ------- | -------- | ------- |
| Bulk offer ranking | Celery via Generate | dashboard generate button → poll | `POST /recommendations/generate` → `GET /recommendations/jobs/{id}` | `services/ai.py:rank_offers` (French prompt, temp 0.2, 1000 tokens, no explicit timeout) | profile + criteria + ≤30 offers (type/field-ilike/region-ilike) | JSON array ≤10 `{offer_id,score,reasoning}`; fence/JSON/type checks | `SavedRecommendation` upsert (out-of-criteria preserved; inactive pruned; empty set deletes nothing) | **heuristic** (50 + field 25 + city 20 + skill hits, French "fallback applied" reasoning) | `[]` → fallback; error never surfaces, job still `completed` |
| Per-offer match | Score button | match-score UI | `POST /recommendations/score/{offer_id}` → `recommendations.score_single` task (Celery or inline) | `services/ai.py:score_single_offer` (French prompt, temp 0.2, 600 tokens, 120 s) | profile + one offer | single `{score 0-100, reasoning FR}` strict (empty/unparseable/out-of-range → `None`) | row `completed` (score+reasoning) or `failed` (safe reason, **no fake score**) | none | `failed`, retryable |
| Application screening | auto on apply + manual retry | recruiter application detail | `POST /applications/{id}/screen` → `applications.screen` task | `services/screening.py` (English prompt, temp 0.2, 2000 tokens, 120 s) | profile snapshot + CV excerpt ≤4000 chars (best-effort) + offer ≤1500 chars | single `{score 0-100, summary, strengths[], gaps[]}` strict | `Application.ai_score/ai_report/ai_status` | none | `failed`, retryable |
| CV extraction | Parse button | profile CV section | `POST /candidates/cv/parse` | `services/cv_extraction.py` (temp 0.1, 8192-token budget, 30 s × 2 attempts, `finish_reason` check) | CV text ≤12000 (retry 6000) | exact-keys `{skills,years,study_level,city,phone,linkedin,portfolio,university}`, canonicalized | none (response only) | none | typed 422/502/504 |
| Bio drafting | Profile form button | `POST /api/ai/generate-bio` (**frontend-only**, `apps/web/src/app/api/ai/generate-bio/route.ts`) | none (Next.js route → Gemini REST) | `lib/bio-utils.ts` (≤500-char trim, ≥8-word quality gate, 1 retry, 30 s) | skills + profile fields | bio text fills form | none | none | mapped 502 messages |

Labels: **real AI** = Gemini paths above; **deterministic fallback** = bulk-ranking heuristic only; **placeholder** = `ai_score=0` rows (see below); **frontend-only AI** = bio route (never touches FastAPI).

---

## Recommendation system

```mermaid
flowchart TD
    Profile[Candidate profile] --> Criteria[Search criteria field/region/type]
    Criteria --> Gen[POST /recommendations/generate]
    Gen --> Cache{Redis recommendations:sha?}
    Cache -->|hit| Instant[return cached:true]
    Cache -->|miss| Job[job:id=pending TTL 3600 + Celery delay]
    Job --> Poll[Frontend polls GET /recommendations/jobs/id]
    Worker[Worker: fresh loop + engine.dispose] --> Filter[≤30 active offers - type + field ilike + region ilike]
    Filter --> Gemini[Gemini rank_offers FR prompt]
    Gemini --> Valid{valid non-empty list?}
    Valid -->|yes| Upsert[Upsert per matched offer]
    Valid -->|no| Heuristic[Fallback 50+25+20+skills]
    Heuristic --> Upsert
    Upsert --> CacheW[Result cached 900s + job completed]
    CacheW --> List[GET /recommendations - ranked rows + 0-placeholders]
```

- Scores persist in DB (no regen on refresh; only a new Generate recomputes; offer create/toggle busts `recommendations:*` so the next Generate rescans).
- **Why score `0` appears:** `GET /recommendations` (and `get_or_create_pending` in `match_scoring.py:68-74`) auto-inserts rows with `ai_score=0, ai_reasoning="Match analysis pending." / "en attente", status="pending"` for active offers with no analysis yet. `0` therefore means **"not yet scored"**, never a Gemini judgment — AI paths never write zeros (screening/match return `None` → `failed`). If Gemini is down, bulk ranking still returns heuristic scores (≥50), while per-offer rows stay `pending`/`failed` with `0` until scored.

---

## Assessments / practice missions

- **Implemented:** model (`assessments` table: `application_id` CASCADE, `candidate_id` CASCADE, `created_by` NULL, `title`, `status` default `pending`, `score/report` NULL) + two read-only GETs (`assessments.py:16-73`) with role/company/ownership scoping returning sparse `{id,status[,score]}`.
- **Not implemented:** create, assign, submit answers, scoring, status updates, delete, deadlines, questions, attempts. `status/score/report` columns exist but no writer was found in `app/`.
- **Interview:** only the `interview` status string exists. No scheduling, slots, location/link, interviewer, feedback, reschedule, cancel, or notifications anywhere in backend or migrations — explicitly NOT IMPLEMENTED.
- Trace (as far as code goes): recruiter sets `PATCH /applications/{id}` → `assessment_required` → (nothing creates an assessment row) → candidate `GET /assessments` reads whatever sparse rows exist → UI tabs render them.

---

## Company logo — Implemented

**Status: Implemented** (backend + storage + frontend + tests all present and cross-verified).

- **Database:** `companies.logo_url` NULLABLE String (`models.py:213`); `CompanyCreate.logo_url` / `CompanyOut.logo_url` optional (`schemas.py:237,251`); existing companies keep working with `NULL`.
- **Migration note:** the column exists in the model and is returned by all company serializers; if your Supabase project predates it, run `alembic upgrade head` (or add the nullable `logo_url` column) — TO-VERIFY against your live `alembic_version`.
- **Storage (reuses CV architecture, separate bucket):** `services/company_logo.py` — private bucket `company-logos` via `app/db.py` service-role client; path `build_logo_path()` = `{company_id}/{uuid4hex}.{ext}` (randomized, unique per upload); DB stores **path only**, never bytes (`LargeBinary` absent from `Company` block) and never raw bucket URLs (served via scoped stream).
- **Validation (both sides, backend authoritative):**
  - Frontend: `validateCompanyLogoFile` (`lib/api.ts:518-526`) + `accept="image/png,image/jpeg,image/webp"` (`CompanyLogoSection.tsx:188`).
  - Backend: `validate_logo_file()` (extension allowlist `png/jpg/jpeg/webp`, content-type allowlist + `application/octet-stream` tolerance, empty reject, 2 MB cap) + `check_logo_magic_bytes()` (PNG `89 50 4E 47...`, JPEG `FF D8 FF`, WebP `RIFF....WEBP`) + router-level 413 re-check (`companies.py:225-230`).
  - Errors: invalid type → `400 "Invalid file type. Only PNG, JPG, and WebP are supported"` / `"Invalid PNG/JPEG/WebP file"`; oversized → `400 "File too large..."` from validator and `413` from the router size gate; storage-missing → `503`; missing logo → `404` (never 500).
- **Permissions:** `require_company_member` + same-company check (foreign → `404`) + `can(company_role, "edit_company")` (OWNER/ADMIN only, `403` otherwise) on upload/replace/delete (`companies.py:204-289`). HR/RECRUITER/HIRING_MANAGER see read-only note in UI.
- **Endpoints:** `POST /companies/{id}/logo` → 201 `CompanyLogoMetaOut{logo_url(path),filename,content_type,size_bytes}` (deletes previous file first, best-effort, scope-enforced); `DELETE .../logo` → 204 (clears storage + `logo_url=None`); `GET .../logo` public stream (`StreamingResponse`, correct MIME via `CONTENT_TYPE_BY_EXT`, `Cache-Control: public, max-age=3600`) for candidate pages.
- **UI:** `CompanyLogoSection.tsx` on the company settings/profile page — current logo (`Avatar xl`), Upload/Change label-button, Save-after-preview, Cancel, Remove (when logo exists), progress bar (`Uploading… %`), success (`Saved.` + toast), error (alert + toast), preview via `URL.createObjectURL` before saving, initials fallback text ("No logo yet — showing company initials").
- **Fallback:** `ui/avatar.tsx` renders `<Image>` only when `src` exists, else `initials(name)` ("Atlas Systems" → "AS", single word → first 2 letters). Used by `candidate/job-card.tsx`, `candidate/job-details.tsx`, `candidate/application-card.tsx`, `company/AppShell.tsx` — no broken-image placeholders possible.
- **Surfaces:** `CompanyOut.logo_url`, `OfferOut.company_logo_url` (offers list/detail), `ApplicationItem.opportunity.company_logo_url`, `RecruitmentChatContext/ListItem.company_logo_url`, `CompanyLogoMetaOut`; frontend resolvers `companyLogoSrc()` / `offerLogoSrc()` (`lib/api.ts:528-541`) build the scoped `/companies/{id}/logo` stream URL (null when no logo → initials).
- **Tests:** `tests/test_company_logo.py` — 13 offline tests (valid png/jpg/webp, persist path, replace deletes old, remove nulls, invalid-type rejected both sides, 2 MB/413, RBAC OWNER/ADMIN-only, cross-company 404 + path-scope, nullable/404-clean, initials fallback, unique paths/no-bytes/path-only, logo exposure across offers/applications/recommendations/chat).

---

## Running CODITENT

### Prerequisites

Docker + Compose, Node 20, Python 3.12, Supabase project, Gemini key, Resend key (email).

### Startup

```bash
git clone <repo> && cd coditent
cp .env.example .env && cp apps/api/.env.example apps/api/.env && cp apps/web/.env.example apps/web/.env.local
# fill real values (DATABASE_URL Supabase + keys)
docker compose up --build
```

Only commands that work with this repo are shown; there is no `db` service and no seed script (dev data via API: `POST /auth/register`, invitation flows, `POST /offers`).

| Service | Technology | Internal port | Exposed port | Depends on |
| ------- | ---------- | ------------: | -----------: | ---------- |
| `api` | FastAPI/Uvicorn (`alembic upgrade head && uvicorn ... --port 8001`) | 8001 | `8001:8001` | — (healthcheck `GET /health`, 10 s × 10) |
| `worker` | Celery (`celery -A app.tasks worker`) | — | — | `api`, `redis` started |
| `redis` | `redis:7-alpine` | 6379 | `6379:6379` | — |
| `web` | Next.js (`NEXT_PUBLIC_API_URL` build arg) | 3000 | `3001:3000` | `api` started |
| `proxy` | nginx (`nginx/Dockerfile`) | 80/443 | `80:80, 443:443` | `web`, `api` started |
| `vault` | `hashicorp/vault:1.15.0` dev | 8200 | `8200:8200` | — |

Networks/volumes: default compose network; no `db_data` volume (Supabase is the store). Env: `api` uses `apps/api/.env` file + `environment:` overrides (`FRONTEND_URL=http://localhost:3001` locally — note it differs from `.env.example`'s `:3000`; TO-VERIFY which your deploy uses). Production: push to `main` → Actions (web lint+build with `NEXT_PUBLIC_API_URL=http://34.205.255.37`, api import check) → Ansible SSH to EC2, render missing `.env` files only, `docker compose up -d --build`, health-gate `http://127.0.0.1:8001/health`.

---

## Complete user flows

### Candidate registration

```mermaid
sequenceDiagram
    participant C as Candidate
    participant W as Web
    participant A as API
    participant D as DB
    participant M as Resend
    C->>W: POST /auth/register (CANDIDATE only)
    W->>A: register
    A->>D: INSERT pending_registrations
    A->>M: OTP email
    C->>W: POST /auth/verify-email (OTP)
    W->>A: verify
    A->>D: INSERT users + candidate_profiles, DELETE pending
    A-->>W: TokenResponse
```

Files: `app/(auth)/register/*`, `verify-email/*`, `routers/auth.py:476-705`, `services/email_verification.py`, raw table `pending_registrations`.

### Company registration (invitation-only)

```mermaid
sequenceDiagram
    participant PA as Platform admin
    participant A as API
    participant O as Owner
    PA->>A: POST /invites/company/invite
    A-->>O: Email /company/invite/accept?token=
    O->>A: POST /invites/company/accept + password + name
    A-->>O: {company_id} → login → /company/*
```

Files: `routers/invitations.py:119-300`, `app/company/invite/accept/*`, `app/invite/*`.

### Company employee invitation

See [Company + employee invitation flow](#company--employee-invitation-flow). Files: `routers/invitations.py:307-520`, `app/invite/employee/*`.

### Login

`POST /auth/login` → bcrypt → `TokenResponse`; middleware + interceptor route/clear (`middleware.ts`, `lib/api.ts:69-90`, `lib/auth-redirect.ts`).

### Create offer

Company page → `createOffer()` → `POST /offers` (`offers.py:66`) → INSERT + cache bust + audit → recruiter list / public browse.

### Candidate application

See [example in Frontend↔backend](#how-frontend-and-backend-communicate). Files: `candidate/job-details.tsx`, `routers/applications.py:289-318`, `tasks.py:120-155`.

### Application stage change

Pipeline UI → `PATCH /applications/{id}` (`applications.py:346`) → allowlist check → audit (+ chat-enabled audit on stage entry). No notifications.

### Assessment

`GET /assessments` → sparse rows only. Creation/submission/scoring: NOT IMPLEMENTED.

### Recommendation generation

See [Recommendation system](#recommendation-system). Files: `dashboard/*`, `routers/recommendations.py:38-80`, `tasks.py:29-87`, `services/recommendation_jobs.py`, `services/ai.py`.

### Recruiter ↔ candidate chat

See [Chat system](#chat-system). Files: `candidate/chat-workspace.tsx`, `company/RecruitmentThread.tsx`, `routers/chat.py:274-529`, `services/recruitment_chat.py`.

### Notifications

NOT IMPLEMENTED as a product system: no notification table/channel/hooks for application/stage/screening/chat events. Only surfaces are audit rows, `chat_enabled` flags, WS `ready` frames, and OTP/invitation emails. Recruitment stage changes produce audit entries only.

---

## Implemented features

### Candidate features — Implemented

Registration + OTP verify/resend, login, SSO (Google/LinkedIn), onboarding steps, profile builder, avatar, CV upload/meta/download/delete/parse, recommendations (generate/poll/score/by-offer/list), offer browse/detail, apply, application list/detail/CV view, stage + `ai_status` tracking, stage-gated chat (REST + WS + polling), requests inbox (accept/reject), assessments read.

### Company features — Implemented

Invitation accept, employee invites + team list/role-change/remove, company CRUD + settings, **logo upload/replace/remove + public stream**, offer create/list/mine/toggle/update/delete + responsible-HR assignment, applications inbox with AI scores, pipeline stage moves, screening retry, recruitment chat (responsible HR only), candidate requests outreach, subscription read (OWNER), audit view (filtered).

### Recruiter/HR features — Implemented

Same as company features scoped by `responsible_hr_id` for chat; all recruitment roles share view/evaluate/move/assess/analytics; only OWNER/ADMIN administer.

### Admin features — Implemented

Pending recruiter approve/reject, stats (9 fields), users/offers/activity pagination, impersonation (JWT + audit), company invitation management, audit log.

### AI features — Implemented

Bulk ranking + fallback, per-offer scoring lifecycle, application screening, CV extraction, frontend bio drafting. See [AI architecture](#ai-architecture) for triggers/inputs/outputs.

### Realtime features — Implemented

Recruitment WS (`ready/message/error`, 4401/4403/4404, in-memory fan-out) + 3 s polling fallback. Typing/unread/receipts/attachments: NOT IMPLEMENTED.

### Security features — Implemented

bcrypt hashing, JWT verify + expiry + DB row check, dual Bearer/cookie, `require_*` + `can()` + 404-isolation, invite token hashing + single-use + expiry + email-match + rotation, OTP hashing/attempts/cooldown/rollback, CV/logo ownership + type/size/magic-bytes validation, chat receiver derivation + per-message re-auth, input sanitization validators, CORS allowlist, env-only secrets.

---

## Planned / incomplete features

- Assessments: model + read-only GETs exist; create/assign/submit/score/delete NOT IMPLEMENTED (`assessments.py` has 2 GETs, no writers).
- Interviews: status string only; scheduling/detail/feedback NOT IMPLEMENTED.
- Notifications (in-app/email/push) for product events: NOT IMPLEMENTED (audit + emails for invites/OTP only).
- Public company self-registration; ownership transfer; org deletion: NOT IMPLEMENTED.
- Password reset and token refresh/logout revocation: NOT IMPLEMENTED. TOTP 2FA with single-use recovery codes is implemented for login and account settings.
- RLS policies: none in repo (bypassed by design; dashboard state TO-VERIFY).
- WS multi-replica fan-out (needs Redis pub/sub per code comment), idempotency keys, periodic cleanup jobs (no beat): NOT IMPLEMENTED.
- Frontend/backend mismatches M1–M10 (join 410, company PATCH full-payload 422, OAuth key workaround, register RECRUITER rejected, sparse shapes vs rich TS types, unvalidated status strings, legacy `recruiter_id` checks, `updateRequestStatus` admin 403, admin first-page-only, WS token key) — documented, not fixed here.

---

## 42 Modules

> TO-VERIFY: no 42 subject file exists in the repository (glob `**/*subject*` empty). The table below reconstructs claims from the previous README + code evidence. Do not present point totals as validated until checked against your actual subject.

| Module | Claimed | Requirement (assumed) | Implementation | Evidence / files | Status |
| ------ | ------- | --------------------- | -------------- | ---------------- | ------ |
| Web Major: Framework front+back | 2 | Next.js + FastAPI | Next 14.2 App Router + FastAPI `:8001` | `apps/web`, `apps/api/app/main.py:17` | Implemented |
| Web Minor: ORM | 1 | ORM usage | SQLAlchemy 2 async + Alembic (19 versions) | `app/database.py`, `app/models.py`, `alembic/versions/` | Implemented |
| Web Minor: Advanced search | 1 | Filter/search | Offer filter region/field/type; rec criteria | `routers/offers.py:36`, `services/recommendation_jobs.py:82-89` | Implemented |
| Web Minor: File upload | 1 | Upload files | Avatar URL + CV upload + company logos | `routers/auth.py:739`, `routers/candidates.py:195`, `routers/companies.py:204` | Implemented |
| User Major: Standard user mgmt | 2 | Profile + friends + online (assumed) | Profile + avatar done; friends/online NOT FOUND | `routers/candidates.py`, `routers/auth.py` | Partially implemented |
| User Minor: OAuth 2.0 | 1 | OAuth login | Google/LinkedIn SSO + handoff | `routers/auth.py:252-475`, `oauth-popup.ts` | Implemented |
| User Major: Advanced permissions | 2 | Roles/permissions | Platform + 5 company roles, `can()` matrix, 404 isolation | `dependencies.py`, `core/permissions.py` | Implemented |
| AI Major: Recommendation system | 2 | Recommendations | Gemini ranking + fallback + per-offer lifecycle | `services/ai.py:14`, `services/recommendation_jobs.py:23`, `services/match_scoring.py` | Implemented |
| **Implemented total** | **10** | — | Excludes partial User-mgmt major | — | TO-VERIFY |
| **Partially implemented** | **2** | User mgmt major (friends/online missing) | Needs `POST /friends`-class scope or replacement module | — | TO-VERIFY |

Previous README claimed 12 pts including the full User-mgmt major "needs friends+online to validate (add `POST /friends`)". Code shows no friends/online system, so validated-from-code total is **10 implemented + 2 partial**. If your subject allows substituting Analytics (candidate `overall_score`/`validated_skills` + admin stats exist as partial evidence) or Public API key modules, confirm against the subject before claiming.

---

## Security architecture

- **Password hashing:** `passlib[bcrypt]` (`requirements.txt:9-10`); legacy unapproved RECRUITER blocked at login.
- **Authentication:** HS256 JWT verified + expiry + DB user lookup; Bearer-first + cookie fallback; no frontend ID trust on writes.
- **Authorization:** `require_*` + `can()` + same-company/same-candidate scoping; 404-isolation convention; chat additionally stage-gated + responsible-HR-bound (`recruitment_chat.py:65-112`).
- **Company isolation:** every company write checks `str(current_user.company_id) != str(company_id)` → 404; storage paths re-checked (`assert_company_logo_path`, `assert_owns_path`).
- **Input validation:** Pydantic 422s, `sanitize_input_text` on profile/offer text, UUID parsing, 2000-char chat caps, 5 MB CV / 2 MB logo caps, extension + MIME + magic-bytes checks.
- **CORS:** explicit origins + credentials (`main.py:29-41`); prod mixed-content avoided via `/api-proxy`.
- **SQL injection:** SQLAlchemy ORM + bound params throughout (no string-built SQL found in routers).
- **Secrets:** env-only (`config.py`), `.env` gitignored, service-role key backend-only, Vault best-effort sync; docs use placeholders.
- **File validation:** CV (pdf/docx + magic + 5 MB) and logo (png/jpg/webp + magic + 2 MB) both sides; randomized unique paths; path-only DB storage; scoped streams.
- **Invitation security:** token hashing + UNIQUE + single-use + expiry (7 d / 72 h) + email-match + resend rotation + lazy-expiry.
- **WS authorization:** JWT from query + full viewer re-check + per-message re-auth; close codes 4401/4403/4404.
- **Known issues (pre-existing, documented honestly):** B1 offer `toggle` skips `can()` (`offers.py:164`); B2 `GET /chat/with/{uid}` no peer check (`chat.py:74`); B3 `POST /companies` open to any recruiter (`companies.py:70`); B4 `updateRequestStatus` 403s PLATFORM_ADMIN (legacy `ADMIN` check); B5 company PATCH needs full `name` (422 on partial) + audit substring filter (`core/audit.py:31`); B6 `GET /admin/activity` returns `[]` on DB error. Risks: RLS bypassed by design, WS token in URL, no non-auth rate limits verified, CVs stored un-scanned, deploy downtime (compose rebuild).
- **NOT IMPLEMENTED:** password reset, token refresh/revocation, RLS, E2E encryption, attachment scanning, audit tamper protection.

---

## Testing

- **Frameworks:** backend `pytest` + `httpx` (`apps/api/tests/`, 14 files, mixed live-DB + offline); frontend lint + prod build in CI (`npm run lint`, `npm run build` with `NEXT_PUBLIC_API_URL=http://34.205.255.37`); backend CI is import-check only (`python -c "import app.main"`-class step) — full suites run manually.
- **Suites:**
  - `test_company_logo.py` — 13 offline logo tests (validation, RBAC, isolation, fallback, storage properties).
  - `test_company_invitations.py` / `test_employee_invitations.py` — invite/accept/ownership/roles (live; employee suite uses fixed emails — non-idempotent, residue-sensitive).
  - `test_candidate_onboarding.py`, `test_match_scoring.py`, `test_oauth_popup.py`, `test_recruiter_candidate_data.py`, `test_recruitment_no_duplicates.py` — flow coverage.
  - `test_cv_upload.py` — offline validators/parsers (no DB/AI/Supabase); `test_cv_auth.py` — Bearer + CV ownership (live).
  - `test_email_otp.py` — OTP unit + live flows with known-hash rows (no SMTP).
  - `test_rbac.py`, `test_security.py`, `test_recruitment_chat.py` — live RBAC/isolation/chat matrix (need seeds + `localhost:8001`; known flaky: shared asyncpg event-loop pollution — same reason tasks call `engine.dispose()`).
- **Run:**
  ```bash
  cd apps/api && python -m pytest tests/test_company_logo.py -v   # offline, no DB
  cd apps/api && python -m pytest tests/ -v                        # live suites need localhost:8001 + Supabase
  cd apps/web && npm run lint && npm run build
  ```
- **Coverage (from code):** auth/OTP/RBAC/isolation/offers/applications-dup/CV/chat-gates/invitations COVERED; screening trigger + recommendations generate PARTIAL (manually verified, no committed end-to-end AI test); admin happy paths PARTIAL; assessments read-only PARTIAL; notifications NOT COVERED (nothing to cover).

---

## Common problems

```text
Symptom: frontend cannot connect to API
Likely cause: NEXT_PUBLIC_API_URL unset (build-time) or backend down
Check: apps/web/.env.local, browser network (direct :8001 vs /api-proxy), docker compose ps, GET /health
Debug: curl http://localhost:8001/health; rebuild web after changing NEXT_PUBLIC_* (build arg)
```

```text
Symptom: database connection failure / "Local DATABASE_URL detected"
Likely cause: local URL markers (@db:, @localhost, @127.0.0.1) rejected by config.py:47-56 + database.py:9-33
Check: apps/api/.env DATABASE_URL (must be Supabase direct/pooled +asyncpg)
Debug: alembic upgrade head output; verify Supabase project ref/password/pooler host
```

```text
Symptom: CORS errors
Likely cause: frontend origin not in main.py:31-37 allow_origins
Check: settings.frontend_url, ports (3000 vs 3001 mismatch: compose sets FRONTEND_URL=http://localhost:3001)
```

```text
Symptom: authentication failure / redirect loops
Likely cause: expired token (60 min, no refresh), wrong cookie name confusion (frontend coditent_token vs backend access_token), middleware role mismatch
Check: localStorage coditent_token, /auth/me status, middleware.ts roleLogic, clock skew for exp
```

```text
Symptom: invalid/expired invitation
Likely cause: lazy-expiry consumed the token, resend rotated it, or email mismatch on accept-existing
Check: invite tables (status/expires_at/token_hash), which accept endpoint was used, exact email casing
```

```text
Symptom: AI API failure / screening stuck failed
Likely cause: GEMINI_API_KEY missing/invalid, model name drift, 120 s timeout, CV download miss
Check: worker logs (screening_job_failed / ai_job_failed), GET screening status, POST .../screen retry, services/screening.py:26-30
```

```text
Symptom: recommendation score = 0
Likely cause: pending placeholder row (GET /recommendations auto-inserts ai_score=0 "Match analysis pending."), NOT an AI judgment
Check: row status (pending vs completed vs failed), POST /recommendations/score/{offer_id}, job status endpoint; bulk Generate fallback never writes 0
```

```text
Symptom: WebSocket connection failure
Likely cause: missing ?token=, 4401/4403/4404 close (auth/stage/role), single-replica fan-out, proxy WS upgrade
Check: getRecruitmentWsUrl token, application status (chat-enabled?), responsible_hr assignment, fall back to 3 s polling
```

```text
Symptom: Docker health check failure / logo-CV 503 "not configured or bucket missing"
Likely cause: api unhealthy (migrations failing against Supabase) or SUPABASE_SERVICE_KEY wrong / buckets absent
Check: docker compose logs api, alembic_version in Supabase, Storage buckets candidate-cvs + company-logos exist and are private
```

---

## Team information — TO-VERIFY

> TO-VERIFY: names/roles below come from the previous README header (`aelasefa, mohammedelmahf, VYMNN47`) and its role sketch. Verify logins, titles, and responsibilities against your actual team before evaluation (`II.1.1`-style rules in some subjects require 4–5 members).

- **aelasefa** — Product Owner / Developer (TO-VERIFY): product vision, backlog, auth/OAuth flow, recommendations.
- **mohammedelmahf** — Project Manager / Developer (TO-VERIFY): coordination, profile builder, file uploads.
- **VYMNN47** — Technical Lead / Developer (TO-VERIFY): architecture, Docker, DB schema, UI system.

## Individual contributions — TO-VERIFY

> TO-VERIFY: per-feature owners below repeat the previous README's claims; they could not be verified from code alone (no `git log` authorship analysis performed here — run `git log --format='%an %s' -- apps/api apps/web` to confirm before defending).

- **aelasefa (TO-VERIFY):** OAuth, recommendations, admin approve flow, Docker setup.
- **mohammedelmahf (TO-VERIFY):** Profile builder, avatar upload, CV auto-fill, file handling.
- **VYMNN47 (TO-VERIFY):** Landing UI, design system, offer loop, quality fixes.
- Company logo system (`routers/companies.py` logo endpoints, `services/company_logo.py`, `CompanyLogoSection.tsx`, `test_company_logo.py`): author TO-VERIFY via `git log`.

## Project management — TO-VERIFY

Previous README claims: tasks via GitHub Issues, weekly sync, work breakdown by feature (auth, profile, offers, recommendations, admin); communication via Discord/Slack; ≥1 reviewer per PR. Verify against your actual Issues/PRs before evaluation.

---

## Resources

- Next.js https://nextjs.org/docs, FastAPI https://fastapi.tiangolo.com, SQLAlchemy https://docs.sqlalchemy.org, Supabase https://supabase.com/docs, Gemini https://ai.google.dev
- In-repo: `SUPABASE.md` (setup + storage), `CODITENT_BACKEND_ARCHITECTURE.md` (read-only audit; code is truth on conflicts), `DESIGN.md`, `UX-CONTRACT.md`, `apps/api/WORKFLOW.md`, `apps/web/AGENTS.md`.

## Explanation of AI usage

- Code generation for boilerplate (Next.js pages, FastAPI routers), CSS polish, prompt engineering for recommendation ranking (`apps/api/app/services/ai.py:14`) — reviewed and tested by peers; no AI-generated code merged without manual review (per previous README; process TO-VERIFY).
- Runtime AI: Gemini `gemini-3-flash-preview` for ranking/screening/CV extraction + frontend bio drafting (see [AI architecture](#ai-architecture)). Fallback/placeholder paths are deterministic and labeled in code and UI-facing reasoning strings.

---

## Known limitations

- `SUPABASE_SERVICE_KEY` must be `sb_secret_...` (service_role) for storage; publishable fails (previous README note; consistent with `app/db.py` admin usage).
- Gemini model name drift risk (`gemini-3-flash-preview` pinned in 3 backend files + frontend bio REST; a 404 requires a coordinated bump).
- Legacy `RECRUITER`/`ADMIN` roles readable but deprecated; several compat paths drift (M4/M7/M8 mismatches + B3/B4).
- No zero-downtime deploys (compose rebuild restarts API; in-flight requests dropped).
- Naive datetimes (UTC by convention, not tz-aware); free-text status/role columns unenforceable at DB level; dangerous cascades (deleting a User/Offer cascades applications → assessments + messages; deleting a User wipes sent/received messages and requests).
- `apps/apps/web/` nested copy appears unused — TO-VERIFY, do not rely on it.

---

## Developer learning guide

Study in this order (files are exact):

1. Startup: `docker-compose.yml`, `apps/api/app/main.py`, `apps/web/next.config.mjs`, `apps/api/app/config.py`, `.env.example`.
2. Database: `apps/api/app/models.py`, `apps/api/alembic/versions/` (latest first), `apps/api/app/database.py`, `SUPABASE.md`.
3. Auth: `apps/api/app/utils/jwt.py`, `apps/api/app/routers/auth.py`, `apps/api/app/dependencies.py`, `apps/web/src/lib/api.ts:18-90`, `apps/web/src/middleware.ts`, `apps/web/src/lib/auth.ts`.
4. AuthZ: `apps/api/app/core/permissions.py`, `apps/web/src/lib/permissions.ts`, `apps/api/tests/test_rbac.py`, `test_security.py`.
5. Companies +Invites: `apps/api/app/routers/companies.py`, `apps/api/app/routers/invitations.py`, `apps/api/app/services/company_logo.py`, `apps/web/src/components/company/CompanyLogoSection.tsx`.
6. Offers: `apps/api/app/routers/offers.py`, `apps/web/src/components/candidate/job-card.tsx`, `job-details.tsx`, `apps/web/src/components/offer-card.tsx`.
7. Applications + pipeline: `apps/api/app/routers/applications.py`, `apps/api/app/services/screening.py`, `apps/api/app/tasks.py:120-155`.
8. Recommendations: `apps/api/app/routers/recommendations.py`, `apps/api/app/services/recommendation_jobs.py`, `apps/api/app/services/ai.py`, `apps/api/app/services/match_scoring.py`, `apps/api/app/cache.py`.
9. Chat: `apps/api/app/services/recruitment_chat.py`, `apps/api/app/routers/chat.py`, `apps/web/src/components/candidate/chat-workspace.tsx`, `apps/web/src/components/company/RecruitmentThread.tsx`.
10. CV: `apps/api/app/routers/candidates.py`, `apps/api/app/services/cv_storage.py`, `cv_parser.py`, `cv_extraction.py`.
11. Admin/audit: `apps/api/app/routers/admin.py`, `apps/api/app/routers/audit.py`, `apps/api/app/core/audit.py`, `apps/web/src/app/admin/*`.
12. Integration + deploy: `apps/web/src/lib/api.ts`, `apps/web/src/lib/types.ts`, `.github/workflows/deploy.yml`, `ansible/`, `nginx/`, `vercel.json`.

---

## Questions I should be able to answer

1. How does the frontend communicate with the backend? — Axios (`lib/api.ts`) with Bearer injection + `withCredentials`; prod HTTPS→HTTP goes via `/api-proxy` rewrite (`next.config.mjs:17-32`); backend is FastAPI `:8001`.
2. How is authentication implemented? — Custom HS256 JWT (`utils/jwt.py`, 60 min), `sub`→UUID→`users` row in `get_current_user`; Bearer-first + `access_token` cookie fallback (cookie only set on SSO).
3. Where is the current user resolved? — `get_current_user` (`dependencies.py:20-48`); role/company come from the DB row, never token claims.
4. How does company isolation work? — Same-company checks (`str(current_user.company_id) != str(company_id)` → 404) on every company write/read plus storage path prefix checks.
5. What prevents Company A from accessing Company B's offer? — Offer PUT/DELETE + member routes scope by `company_id` with 404-isolation (`offers.py:150,182`; logo endpoints same pattern).
6. How is an application linked to an offer? — `applications.opportunity_id` CASCADE → `offers.id`, UQ `(candidate_id, opportunity_id)`; `company_id` copied from the offer server-side.
7. How are permissions checked? — `require_*` gate (platform role/membership) + `can(company_role, action)` matrix (`core/permissions.py`); frontend mirror is UX-only.
8. Who can upload a company logo? — Same-company OWNER/ADMIN only (`edit_company`), enforced in `companies.py:204-289`; others get 403/404.
9. How does the recommendation score work? — Bulk: Gemini ranks ≤10 of ≤30 filtered offers; failure → heuristic (50+25+20+skills). Per-offer: single Gemini call with strict validation → `completed`/`failed`, never fake scores.
10. What happens when the AI provider fails? — Bulk → heuristic fallback + job `completed`; single-match/screening → `failed` rows, retryable; CV parse → typed 502/504; no zeros ever written by AI.
11. Why can a recommendation show score 0? — `0` = pending placeholder auto-inserted by `GET /recommendations` / `get_or_create_pending` (`match_scoring.py:68-74`), meaning "not yet scored".
12. How does the database connection work? — SQLAlchemy async + `asyncpg`, PgBouncer-safe (`statement_cache_size=0`), URL normalized, local markers rejected; per-request sessions.
13. How does chat authorization work? — `can_access_recruitment_chat`: candidate must own the application; COMPANY_USER must be the responsible HR (`responsible_hr_id → created_by → recruiter_id`) in the same company with `view_applications`; stage must be chat-enabled; all others denied.
14. Why was Supabase selected? — Managed Postgres + Storage in one vendor, pooler for prod, zero DB ops; used as hosting + Storage only (no Supabase Auth for app users).
15. What happens when two users act simultaneously? — UQ constraints + `FOR UPDATE` locks serialize (double-apply → 400; concurrent OTP verifies serialize); concurrent Generates duplicate work, last-write-wins (no stampede lock).
16. Where do invitation tokens live? — Only `token_hash` (UNIQUE) in raw-SQL tables; plaintext token only in the emailed URL; single-use + expiry + rotation.
17. How are CVs stored? — Private `candidate-cvs` bucket, path `{uid}/{uuid}_{safe}.{ext}`, service-role key backend-only, `cv_url` stores path; ownership via prefix assert.
18. How are logos stored? — Same pattern, separate `company-logos` bucket, path `{company_id}/{uuid}.{ext}`, served via public scoped stream (never raw bucket URLs).
19. What validates uploads? — Extension + MIME + magic bytes + size (CV 5 MB/413; logo 2 MB/400+413 gate), both sides, backend authoritative.
20. How does the WS stay in sync? — In-memory fan-out + per-message re-auth + `ready/message/error` frames + 4401/4403/4404 closes + 3 s polling fallback; single-replica only.
21. How are stages moved? — `PATCH /applications/{id}` with 7-value allowlist, free jumping, audit per transition; no state machine, no notifications.
22. When does chat unlock? — Crossing into `shortlisted/assessment_required/assessment_completed/interview/accepted` (`CHAT_ENABLED_STATUSES`); `rejected` locks again.
23. What does `GET /recommendations` do besides listing? — Inserts `0`-score pending placeholders for unscored active offers (why Discover shows "en attente").
24. What does offer create/toggle bust? — `recommendations:*` Redis keys (`_bust_recommendation_cache`, `offers.py:54-63`), forcing the next Generate to rescan.
25. How long do caches/jobs live? — Result cache 900 s (`recommendation_cache_ttl_seconds`), job keys 3600 s; invites 7 d / 72 h; OTP 10 min / 5 attempts / 60 s cooldown.
26. How are assessments stored vs served? — Full columns in `assessments`, but API returns sparse `{id,status[,score]}`; no writers exist.
27. Can a candidate message any HR? — No: only the responsible HR of an application in a chat-enabled stage; receiver derived server-side.
28. What can a platform admin do that a company OWNER cannot? — Platform invites, user/offer moderation, stats, impersonation, cross-company reads; admins are denied recruitment chats and employee-invite paths.
29. What can HIRING_MANAGER do? — View + edit offers + view/evaluate/move + assessments/analytics; cannot create/delete offers, edit company, invite, or manage members/subscription.
30. How does SSO link accounts? — Email match links existing users (+profile backfill); new emails get onboarding cookie → candidate-only completion; never creates company roles.
31. Where is the Bearer token stored? — `localStorage coditent_token` (`lib/constants.ts`); backend ignores that name and reads `Authorization` header or its own `access_token` cookie.
32. How are errors surfaced? — `HTTPException` codes (400/401/403/404-isolation/409/410/413/422/429/500/502/503/504) + interceptor logout/redirect + toasts on logo/chat/CV actions.
33. How is audit done? — `log_audit()` writes `admin_activity_logs` on company/offer/application/invitation writes; failures swallowed; company filter is substring match (B5).
34. How do Celery workers avoid loop errors? — Fresh event loop + `engine.dispose()` per task (`tasks.py:40-51`); same pattern needed in tests.
35. What are the 3 Celery tasks? — `recommendations.generate`, `recommendations.score_single`, `applications.screen` (no beat/scheduler).
36. How is the frontend bio generated? — Frontend-only Next.js route (`app/api/ai/generate-bio/route.ts`) → Gemini REST, ≤500-char trim, quality gate, 1 retry; never touches FastAPI.
37. What breaks if RLS is enabled? — Nothing today (direct `asyncpg` bypasses PostgREST RLS); enabling without `service_role` bypass or exposing PostgREST directly changes the model — dashboard state TO-VERIFY.
38. What is `POST /companies/{id}/join`? — Deprecated, always `410 Gone`; membership is invitation-only.
39. Why does company PATCH need full `name`? — It reuses `CompanyCreate` (`name` required) — partial updates 422 (known issue B5); only whitelisted fields apply.
40. What remains TO-VERIFY before evaluation? — Team roles/contributions, 42 point claims vs your subject, live `alembic_version`/RLS/bucket policies, `FRONTEND_URL` port (`:3000` vs `:3001`), and the unused `apps/apps/web` copy.
41. How do I run only the offline tests? — `python -m pytest tests/test_company_logo.py tests/test_cv_upload.py -v` (stubbed modules, no DB/Supabase/network).
42. What must exist in Supabase before logos/CVs work? — Private buckets `candidate-cvs` + `company-logos` and backend `SUPABASE_URL` + `sb_secret_...` service key; missing → 503 "not configured or bucket missing".
