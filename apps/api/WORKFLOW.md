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

## One-Time Setup (fresh machine or deleted venv)

1. Enter API folder:
   - `cd /home/ayelasef/Desktop/coditent/apps/api`
2. Create virtual environment:
   - `python -m venv venv`
3. Activate virtual environment:
   - `source venv/bin/activate`
4. Install dependencies:
   - `pip install -r requirements.txt`
5. Apply database migrations:
   - `alembic upgrade head`
6. Start server:
   - `uvicorn app.main:app --reload --port 3001`

## Daily Start (normal development)

1. `cd /home/ayelasef/Desktop/coditent/apps/api`
2. `source venv/bin/activate`
3. `alembic upgrade head`
4. `uvicorn app.main:app --reload --port 3001`

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

- Google callback: `http://127.0.0.1:8000/auth/sso/google/callback`
- LinkedIn callback: `http://127.0.0.1:8000/auth/sso/linkedin/callback`

## Recommended Test Order

1. Register candidate
2. Register recruiter
3. Candidate login
4. Update candidate profile
5. Recruiter login + create offer
6. Candidate generate recommendations
7. Candidate list saved recommendations
