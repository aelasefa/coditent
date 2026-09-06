# Supabase Migration — Single Source of Truth

## Architecture

```
Frontend (Next.js) → Backend (FastAPI + SQLAlchemy asyncpg) → Supabase PostgreSQL
                          ↕
                        Redis (cache + Celery broker, ephemeral)
```

- **No local PostgreSQL**: `docker-compose.yml` no longer defines `db` service or `db_data` volume.
- **No SQLite fallback**, no localhost branching.
- **Supabase PostgreSQL** is the only persistent store. SQLAlchemy `asyncpg` connects via `DATABASE_URL`.
- **Auth**: Custom JWT (existing `users` table) remains — its data now lives in Supabase. Supabase Auth is NOT used for app users; `supabase` Python package is admin client only (`app/db.py:1`), never browser-exposed. Service-role key is backend-only.
- **RLS**: Disabled by default. Backend enforces authorization via `dependencies.py` + `core/permissions.py`. Supabase `service_role` bypasses RLS anyway, so enabling RLS would not protect the `asyncpg` path. If you enable RLS later, add policies that allow `service_role` or use Supabase PostgREST with `authenticated` role — current `asyncpg` path does not go through PostgREST.

## Supabase Project Setup

1. Create project at https://supabase.com/dashboard.
2. Settings → Database → Connection string → URI. Copy `postgresql://postgres.<ref>:<pass>@db.<ref>.supabase.co:5432/postgres`.
   Change prefix to `postgresql+asyncpg://` for SQLAlchemy (`database.py` auto-upgrades if you forget).
   - **Direct (5432)** — use for `alembic upgrade head` and local dev.
   - **Pooled (6543, PgBouncer)** — `postgresql+asyncpg://postgres.<ref>:<pass>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true` for production API (scale). Prefer Session mode; Transaction mode works with default pooling.
3. Settings → API → Project URL (`SUPABASE_URL`) + `service_role` (`sb_secret_...`) — backend only. Never put `sb_secret` in `NEXT_PUBLIC_*`.

## Environment

- Root `.env.example` and `apps/api/.env.example` list all vars with safe placeholders.
- Real `.env` files are gitignored (`# .env` in `.gitignore:4`). Copy examples and fill.
- `apps/api/app/config.py:37` validates `DATABASE_URL` contains no local markers (`@db:`, `@localhost`, `coditent:coditent@db`) and raises a clear error if a local URL is used.
- `apps/api/app/database.py:1` normalizes `postgresql://` → `postgresql+asyncpg://` and rejects local URLs at engine creation, ensuring no silent fallback.

## Migrations — Reproducible Setup

New developer flow (no local DB required):

```bash
git clone <repo> && cd coditent
cp .env.example .env          # fill DATABASE_URL (Supabase) + SUPABASE_* + JWT_SECRET + GEMINI_API_KEY
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# Backend schema — creates all tables in Supabase from 9 Alembic versions:
cd apps/api && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt
alembic upgrade head          # idempotent, runs against Supabase
uvicorn app.main:app --reload --port 8001  # or docker compose up --build
```

- Schema is defined in `apps/api/app/models.py:61` and versioned under `apps/api/alembic/versions/` (9 migrations, latest `c4d5e6f7a8b9_separate_platform_and_company_roles.py`).
- `alembic/env.py:26` reads `settings.database_url`, normalized same as runtime.
- Docker: `docker-compose.yml` `api.command: alembic upgrade head && uvicorn ...` runs migrations on every `docker compose up`.

Updating schema: `alembic revision --autogenerate -m "desc"` → commit → `alembic upgrade head` (locally + CI + prod).

## Data Migration (Local → Supabase)

If you had data in a local Postgres (pre-migration `db_data` volume):

1. Dump: `docker compose exec db pg_dump -U coditent coditent > dump.sql` (before removing `db` service) or `pg_dump "postgresql://coditent:coditent@localhost:5432/coditent" > dump.sql`
2. Restore to Supabase: `psql "postgresql://postgres.<ref>:<pass>@db.<ref>.supabase.co:5432/postgres" < dump.sql`
   Supabase direct connection supports `psql`. For large dumps, use `pg_restore`.
3. Validate:
   ```sql
   SELECT count(*) FROM users;
   SELECT count(*) FROM companies;
   SELECT count(*) FROM offers;
   SELECT count(*) FROM applications;
   SELECT * FROM alembic_version; -- should match local head
   ```
4. After validation, remove local volume: `docker volume rm coditent_db_data` (no longer defined).

If no important local data exists (typical for this repo — dev data is seeded), just run `alembic upgrade head` on a fresh Supabase project and re-seed via API (`POST /auth/register`, `POST /companies`, etc.). Document this as intentional.

## Security Notes

- `SUPABASE_SERVICE_KEY` (`sb_secret_...`) is backend-only (`apps/api/.env`), never `NEXT_PUBLIC_*`. Frontend uses only `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- JWT secret stays in `JWT_SECRET` (backend). Cookies are `httpOnly` (`app/routers/auth.py`).
- All 12 routers continue using `get_db:AsyncSession` against Supabase; no code path uses a second DB.

## Docker / Deployment

- `docker-compose.yml` now runs **3 services**: `api`, `worker` (Celery), `redis` (ephemeral) + `web`. No `db`, no `db_data`.
- Deploy with only Supabase env vars set on host/EC2/Railway: `DATABASE_URL`, `SUPABASE_*`, `JWT_SECRET`, `GEMINI_API_KEY`, `REDIS_URL`. No local DB to provision.
