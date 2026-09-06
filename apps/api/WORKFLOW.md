# CODITENT API Workflow

This file documents the backend setup steps, current progress, and daily commands.

## Current Progress (as of 2026-04-06)

### Completed
- API structure created under `apps/api`.
- FastAPI app, routers, schemas, models, dependencies, and AI service implemented.
- Alembic configured and first migration generated/applied.
- Backend server starts successfully with Uvicorn.
- Health endpoint responds successfully.

### Remaining (next milestones)
- Run full end-to-end curl flow (register/login/profile/offers/recommendations).
- Verify role protection and JWT expiration behavior.
- Seed real Moroccan offers.
- Push backend branch and open PR to main.
- Configure Railway deployment and production checks.

## One-Time Setup (fresh machine — Supabase-only, no local DB)

1. Ensure Supabase project exists and `apps/api/.env` contains `DATABASE_URL=postgresql+asyncpg://postgres.<REF>:<PASS>@db.<REF>.supabase.co:5432/postgres` (see `apps/api/.env.example`).
2. Enter API folder: `cd apps/api`
3. Create virtual environment: `python -m venv venv`
4. Activate: `source venv/bin/activate`
5. Install: `pip install -r requirements.txt`
6. Apply schema to Supabase: `alembic upgrade head`
7. Start server: `uvicorn app.main:app --reload --port 8001`

## Daily Start (normal development)

1. `cd apps/api && source venv/bin/activate`
2. `alembic upgrade head`  # idempotent — ensures Supabase schema is up to date
3. `uvicorn app.main:app --reload --port 8001`

## Frontend Start (web app)

1. `cd /home/ayelasef/Desktop/coditent/apps/web`
2. `npx pnpm@9.12.3 run dev`

## Quick Checks

- Health check:
  - `curl http://127.0.0.1:3001/health`
- Swagger docs:
  - `http://127.0.0.1:3001/docs`

## SSO Setup (Google + LinkedIn)

Add these variables to `apps/api/.env`:

- `FRONTEND_URL=http://127.0.0.1:3000`
- `GOOGLE_CLIENT_ID=...`
- `GOOGLE_CLIENT_SECRET=...`
- `LINKEDIN_CLIENT_ID=...`
- `LINKEDIN_CLIENT_SECRET=...`

OAuth callback URLs to register in provider dashboards:

- Google callback: `http://127.0.0.1:8001/auth/sso/google/callback`
- LinkedIn callback: `http://127.0.0.1:8001/auth/sso/linkedin/callback`

## Recommended Test Order

1. Register candidate
2. Register recruiter
3. Candidate login
4. Update candidate profile
5. Recruiter login + create offer
6. Candidate generate recommendations
7. Candidate list saved recommendations
