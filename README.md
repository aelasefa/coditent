*This project has been created as part of the 42 curriculum by aelasefa, mohammedelmahf, VYMNN47.*

# Coditent — Talent Workflow Platform for Morocco

## Description
Coditent connects candidates and recruiters in one expressive workspace. Candidates build recruiter-ready profiles (headline, bio, skills, experience, education, links, avatar), recruiters publish offers, and an AI recommendation engine ranks offers per candidate by field/region/type. Admins approve recruiters, moderate offers/users, and view activity.

Key features: JWT auth (candidate/recruiter/admin), OAuth Google/LinkedIn, profile builder with avatar upload (`PUT /auth/me/avatar`), offer CRUD, AI recommendations (Gemini + fallback scoring), role-based routing, Supabase SSR session refresh.

## Instructions
**Prerequisites:** Docker + Docker Compose, Node 20, Python 3.12 (for local dev without Docker)

**Run with Docker (single command):**
```bash
cp .env.example .env
# fill .env with real values (see .env.example)
cp apps/web/.env.example apps/web/.env.local
docker compose up --build
# web: http://localhost:3001  api: http://localhost:8001  docs: http://localhost:8001/docs
```

**Local dev without Docker:**
```bash
# API
cd apps/api && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt
alembic upgrade head && uvicorn app.main:app --reload --port 8001
# Web
cd apps/web && npm ci && npm run dev -- --port 3000
```

**Env setup:** See `.env.example` at repo root and `apps/web/.env.example`. Required: `DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (use `sb_secret_...` service_role, not publishable), `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## Resources
- Next.js https://nextjs.org/docs, FastAPI https://fastapi.tiangolo.com, SQLAlchemy https://docs.sqlalchemy.org, Supabase https://supabase.com/docs, Gemini https://ai.google.dev
- **AI use:** Code generation for boilerplate (Next.js pages, FastAPI routers), CSS polish, prompt engineering for recommendation ranking (`apps/api/app/services/ai.py:14`), reviewed and tested by peers. No AI-generated code was merged without manual review.

## Team Information
- **aelasefa** — Product Owner / Developer: product vision, backlog, auth/OAuth flow, recommendations
- **mohammedelmahf** — Project Manager / Developer: coordination, profile builder, file uploads
- **VYMNN47** — Technical Lead / Developer: architecture, Docker, DB schema, UI system

> Update roles/logins to match your 4-5 member team before evaluation (`II.1.1`).

## Project Management
- Tasks via GitHub Issues, weekly sync, work breakdown by feature (auth, profile, offers, recommendations, admin)
- Communication: Discord/Slack (replace with your actual channel)
- Code reviews: at least one reviewer per PR

## Technical Stack
- **Frontend:** Next.js 14.2 (React 18, App Router, SSR), Tailwind CSS, axios, @tanstack/react-query, CSS Modules
- **Backend:** FastAPI, SQLAlchemy (async) + Alembic, Postgres 16, Redis 7, Celery worker
- **DB:** Postgres (chosen for relational integrity, transactions, RLS-ready); Supabase Auth/Storage optional
- **Other:** Supabase SSR (`@supabase/ssr`), Gemini (`google-generativeai`), Docker

## Database Schema
- `users(id UUID PK, email, password_hash, role ENUM[CANDIDATE,RECRUITER,ADMIN], is_approved, full_name, avatar_url, oauth_provider, oauth_id)` — FK to `candidate_profiles`
- `candidate_profiles(id, user_id FK, city, phone, headline, bio, field_of_study, university, study_level, skills, years_of_experience, linkedin_url, portfolio_url, updated_at)`
- `offers(id, recruiter_id FK, title, company, region, field, type, description, requirements, active, posted_at)`
- `saved_recommendations(id, candidate_id FK, offer_id FK, ai_score, ai_reasoning)`
- Relations: `users 1—1 candidate_profiles`, `users 1—n offers`, `users 1—n saved_recommendations`

## Features List
- Auth: register/login, JWT, OAuth Google/LinkedIn, role selection, `GET /auth/me` (`aelasefa`)
- Profile builder: headline/bio/skills/experience/education/links/avatar (`PUT /auth/me/avatar`, `PUT /candidates/profile`) (`mohammedelmahf`)
- Offers: recruiter create/toggle, list, mine (`POST /offers`, `GET /offers`) (`VYMNN47`)
- Recommendations: `POST /recommendations/generate` (Celery + Gemini + fallback) + `GET /recommendations` (`aelasefa`)
- Admin: pending recruiters approve/reject, stats/users/offers/activity (`apps/api/app/routers/admin.py:52`)

## Modules
| Module | Pts | How implemented |
|--------|-----|-----------------|
| Web Major: Framework front+back (Next.js + FastAPI) | 2 | `apps/web` + `apps/api/app/main.py:17` |
| Web Minor: ORM | 1 | SQLAlchemy + Alembic `apps/api/app/database.py` |
| Web Minor: Advanced search | 1 | Offer filter by region/field/type `apps/api/app/routers/offers.py:17` |
| Web Minor: File upload | 1 | Avatar `PUT /auth/me/avatar` + CV upload |
| User Major: Standard user mgmt | 2 | Profile + avatar, needs friends+online to validate (add `POST /friends`) |
| User Minor: OAuth 2.0 | 1 | Google/LinkedIn `apps/api/app/routers/auth.py:188` |
| User Major: Advanced permissions | 2 | Roles CANDIDATE/RECRUITER/ADMIN `apps/api/app/dependencies.py:66` |
| AI Major: Recommendation system | 2 | Gemini ranking `apps/api/app/services/ai.py:14` + fallback `recommendation_jobs.py:23` |
| **Total claimed** | **12** | Need +2pts: add friends system (2) OR Public API key (2) OR Analytics (2) |

## Individual Contributions
- **aelasefa:** OAuth, recommendations, admin approve flow, Docker setup
- **mohammedelmahf:** Profile builder, avatar upload, CV auto-fill, file handling
- **VYMNN47:** Landing UI, design system, offer loop, quality fixes
- *Update with each member's actual commits before submission.*

## Known Limitations
- `SUPABASE_SERVICE_KEY` must be `sb_secret_...` (service_role) for storage; publishable fails
- Gemini model `gemini-2.0-flash` may 404 — use `gemini-2.5-flash` per worker logs
