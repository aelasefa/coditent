*This project has been created as part of the 42 curriculum by ayelasef, iel-asef, abelahse, maelmahf, ahabibi-.*

# CODITENT

## Description

CODITENT is a recruitment platform for candidates, company teams, and platform administrators. Candidates create profiles, upload CVs, discover offers, apply, follow their application pipeline, and communicate with recruiters. Company teams publish offers, assess applicants, schedule interviews, and collaborate through organization roles. Administrators supervise accounts, organizations, content, and audit activity.

The application is a Next.js frontend backed by a FastAPI API and PostgreSQL. Redis supports background jobs, shared presence, rate state, and multi-instance realtime fan-out. Supabase provides PostgreSQL and private object storage. The containerized deployment includes nginx/ModSecurity, HashiCorp Vault, Prometheus, and Grafana.

## Team, roles, and responsibilities

| Member | 42 login | Role | Main responsibilities and contributions |
| --- | --- | --- | --- |
| Ayman Elasefar | `ayelasef` | Product Owner and DevOps developer | Product priorities and acceptance criteria; Docker, CI/CD, Ansible, nginx/TLS, monitoring; OAuth deployment integration |
| Ilyas El Asefar | `iel-asef` | Frontend developer | Company workspace, jobs/offers views, candidate pipeline and assessment UI, responsive frontend behavior |
| Ayman Belahsen | `abelahse` | Technical Lead and frontend developer | Frontend architecture and review; design system, navigation, CV experience, chat and optimistic-message UX |
| Mohammed Elmahfoudi | `maelmahf` | Project Manager and backend developer | Delivery coordination; FastAPI services, database/migrations, recruitment workflows, realtime messaging and backend tests |
| Abderrahmane Habibi Ihlane | `ahabibi-` | Security developer | Vault migration, 2FA and session/device security, GDPR account controls, security headers and container hardening |

All five members are developers and are responsible for understanding, testing, reviewing, and documenting the whole submission, not only their primary area.

### Project-management process and communication

Work is split into product milestones: identity and profiles, company workflows, applications and messaging, security/privacy, then deployment and observability. The Product Owner defines the expected user outcome, the Project Manager turns it into small deliverables, and the Technical Lead reviews architecture and cross-layer impact. Feature branches and pull requests provide the asynchronous record; GitHub issues and PR discussions carry tasks, review comments, and acceptance evidence. The team uses regular live sync calls for blockers and integration decisions. A change is complete only after review, relevant tests, and documentation are updated.

### Individual challenges

| Member | Challenge addressed |
| --- | --- |
| Ayman Elasefar | Keeping local, CI, and EC2 deployment behavior consistent while adding TLS, a WAF, immutable images, and a separately deployed monitoring stack |
| Ilyas El Asefar | Turning dense recruitment data and AI assessments into responsive company workflows without mock-only production paths |
| Ayman Belahsen | Keeping shared frontend behavior consistent while improving CV and chat UX, including optimistic delivery and invalidation behavior |
| Mohammed Elmahfoudi | Preserving database integrity and authorization across application-stage transitions, migrations, async jobs, and realtime messaging |
| Abderrahmane Habibi Ihlane | Moving secrets and security-sensitive account flows to Vault-backed, revocable mechanisms without exposing credentials in Git |

## Architecture and technical choices

```text
Chrome -> nginx + ModSecurity -> Next.js 16
                           \-> FastAPI -> SQLAlchemy/Alembic -> Supabase PostgreSQL
                                      -> Supabase private object storage
                                      -> Redis -> Celery worker / AI dispatcher
                                      -> Resend and Google Gemini

FastAPI /metrics -> Prometheus -> provisioned Grafana dashboards and alerts
Runtime credentials <- HashiCorp Vault KV v2 + AppRole
```

- **Next.js 16 and React 19:** App Router, server-rendered public offer pages, route groups, reusable components, and a production PWA.
- **FastAPI:** typed request/response validation, async endpoints, dependency-based authentication and authorization, and OpenAPI documentation.
- **PostgreSQL with SQLAlchemy/Alembic:** relational integrity, transactions, an async ORM, and versioned schema migrations.
- **Redis and Celery:** asynchronous AI work, cache/admission state, presence, and cross-process realtime delivery.
- **Supabase Storage:** private CV, avatar, and company-logo objects; application authorization remains in FastAPI.
- **nginx/ModSecurity and Vault:** strict request filtering plus encrypted, isolated runtime secret storage.
- **Prometheus/Grafana:** application and host metrics, custom dashboards, alert rules, retention limits, and authenticated loopback-only administration behind TLS.

### Database schema

The authoritative schema is in `apps/api/app/models.py` and `apps/api/alembic/versions/`.

| Table/domain | Important data | Relationships |
| --- | --- | --- |
| `users` | UUID, email, password hash, account role, status, 2FA and session-security state | Parent of profiles, friendships, messages, applications, memberships and audit actors |
| `candidate_profiles` | identity, biography, skills, experience, education, CV/avatar paths | One-to-one with a candidate user |
| `companies` | organization details, logo, archive/approval state | Has members, invitations, offers and subscriptions |
| company membership/invitations | company role, invite token hash, status and expiry | Connect users to one organization and authorize scoped actions |
| `opportunities` | title, description, requirements, location/type, owner and status | Belongs to a company; has applications |
| `applications` | candidate, offer, stage/version, responsible recruiter, AI state | Unique candidate/offer workflow; owns interviews and recruitment chat |
| friendships/direct messages | request state, sender/receiver, ordered messages and receipts | Connect candidate users and enforce approved-friend chat |
| recruitment chat messages | application, sender, body, timestamps and delivery state | Scoped to an eligible application and its participants |
| AI/email outboxes | job type, payload, attempts, lease and delivery status | Durable work and retry records |
| privacy/deletion records | request state, grace period, retries and completion | Drives cancelable account erasure and confirmations |
| audit/activity records | actor, action, target and timestamp | Security and administrative traceability |

## Implemented features

- Email-OTP registration, password login, configured Google/LinkedIn OAuth, current-user lookup, TOTP 2FA, recovery codes, trusted devices, and session revocation.
- Candidate profile/CV/avatar management, offer discovery, combined search/filter/sort, pagination, AI match context, applications, interviews, and stage tracking.
- Company creation and archival, invitations, membership roles, offers, candidate review, guarded pipeline transitions, analytics, and recruitment chat.
- Friend requests, friend removal, presence/last-seen, persistent direct messaging, delivery/read state, and multi-instance WebSocket fan-out.
- Private file upload with client/server extension, MIME, magic-byte, and size checks; progress, preview/download, replacement, and deletion.
- JSON/CSV/XML export, validated JSON profile import, reauthenticated deletion request, seven-day cancellation, anonymization, and durable confirmation email.
- Public Privacy Policy and Terms of Service pages linked from public/authentication UI.
- PWA manifest, install icons, service worker, versioned cache, and offline fallback.
- Liveness/readiness probes, metrics, logs, dashboards, alerts, backups, and documented restore/rollback operations.

## Instructions

### Prerequisites

- Bash 5.2 or newer
- Docker Engine 24 or newer and Docker Compose 2.20 or newer
- Python 3.12 for local backend development
- Node.js 22 and pnpm 10.5.2 for local frontend development
- A Supabase PostgreSQL project and private storage buckets

### Configure secrets

```bash
cp .env.example .env
```

Initialize Vault by following `docs/shared-vault.md`, then store the complete secret bundle at `secret/data/ft_transcendence`. It must include database, JWT, storage, AI, encryption, email/OAuth credentials when used, and a unique `GF_SECURITY_ADMIN_PASSWORD` of at least 16 characters. Never commit real credentials.

### Run the application

```bash
./scripts/run_project.sh
```

The local application is available at `http://localhost:3001`; the self-signed TLS check endpoint is `https://localhost:8443`. API liveness and readiness are exposed on loopback at `http://localhost:8001/health` and `http://localhost:8001/ready`.

Start monitoring with its Vault-loaded administrator password:

```bash
./scripts/run_monitoring.sh
```

### Development and tests

```bash
# Backend
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
alembic upgrade head
python -m pytest

# Frontend
cd apps/web
pnpm install --frozen-lockfile
pnpm run lint
pnpm exec tsc --noEmit
pnpm run test:unit
pnpm run build
```

Some integration suites require configured PostgreSQL, Redis, storage, email, or OAuth services. CI defines the isolated test services and exact commands in `.github/workflows/ci.yml`.

## Claimed modules: verified 23-point set

Major modules are worth two points and minor modules one point. This declaration intentionally does not claim OAuth, advanced permissions, health/status plus backup, accessibility, extra-browser, game, blockchain, AI, or custom modules. Evaluators decide the final score; the subject caps the counted result at 19 even when the raw implementation exceeds it.

| Module | Type | Points | Implementation evidence | Primary author(s) |
| --- | --- | ---: | --- | --- |
| Frontend and backend frameworks | Major | 2 | Next.js in `apps/web`; FastAPI in `apps/api/app/main.py` | Ilyas, Ayman Belahsen, Mohammed |
| Realtime features | Major | 2 | WebSocket tickets, Redis fan-out, acknowledgements, heartbeats, reconnect and persisted recovery | Mohammed, Ayman Belahsen |
| Basic user interaction | Major | 2 | Profiles, friend lifecycle, presence and persistent approved-friend chat | Mohammed, Ayman Belahsen |
| ORM | Minor | 1 | Async SQLAlchemy models plus Alembic migrations | Mohammed |
| Server-side rendering | Minor | 1 | Server-rendered `/offers/[category]` pages and metadata | Ilyas, Ayman Belahsen |
| Progressive web app | Minor | 1 | Manifest, icons, service worker, cache and offline page | Ayman Belahsen |
| Custom design system | Minor | 1 | Shared tokens and reusable UI components | Ilyas, Ayman Belahsen |
| Advanced search | Minor | 1 | Combined text/field/region/type filters, sorting and pagination | Ilyas, Mohammed |
| File upload and management | Minor | 1 | Images and PDF/DOCX with validation, progress, private storage, preview and deletion | Ayman Belahsen, Mohammed |
| Standard user management | Major | 2 | Editable profiles, avatars/defaults, friends and cross-tab presence/last seen | Mohammed, Ayman Belahsen |
| Organization system | Major | 2 | Company create/read/update/archive, membership/invites and scoped organization actions | Mohammed, Ilyas |
| Complete 2FA | Minor | 1 | TOTP enrollment/challenge, recovery codes, trusted devices and disable flow | Abderrahmane |
| WAF/ModSecurity plus HashiCorp Vault | Major | 2 | Blocking WAF rules; Vault KV v2/AppRole runtime secret injection | Abderrahmane, Ayman Elasefar |
| Prometheus and Grafana monitoring | Major | 2 | Exporters, custom dashboard, five alert rules, retention, TLS ingress and authenticated Grafana | Ayman Elasefar |
| Data export and import | Minor | 1 | JSON/CSV/XML export and validated atomic JSON profile import | Mohammed, Abderrahmane |
| GDPR-oriented features | Minor | 1 | Reauthenticated readable export, exact deletion confirmation, seven-day cancelable grace period, private-file erasure, anonymization, and durable operation emails | Mohammed, Abderrahmane |
| **Raw total** |  | **23** |  |  |
| **Maximum counted by the subject** |  | **19 / 19** | 14 mandatory points plus at most 5 bonus points |  |

### Evaluation demonstrations

1. Start the app from a clean machine with the single launcher and show current Chrome with no JavaScript console warnings or errors.
2. Use two accounts/browser contexts to demonstrate friends, presence, direct chat, recruitment chat, reconnect, and persisted history.
3. Install the PWA, reload offline, and show the fallback and cached shell.
4. Upload, preview/download, replace, and delete an image and a PDF/DOCX.
5. Show candidate, company-role, and administrator views and organization isolation.
6. Enable/disable 2FA, sign in with an authenticator, and consume one recovery code.
7. Send safe SQLi/XSS probes to show ModSecurity blocking, then show application secrets came from Vault and are absent from tracked files/logs.
8. Open authenticated Grafana, show Prometheus targets, the custom dashboard, and five alert rules.
9. Export all formats, import a valid profile, schedule deletion, cancel during the grace period, and explain retained anonymized integrity records.

## AI usage

The team used AI assistants for boilerplate suggestions, debugging hypotheses, test-case ideas, CSS refinement, documentation structure, and security/audit review. Every accepted result was read, adapted, peer-reviewed, and tested; team members remain responsible for and must be able to explain it.

CODITENT uses Google Gemini at runtime for CV extraction, recommendation/match context, screening assistance, and biography drafting. AI output is assistance rather than an authorization decision: access control, workflow transitions, and persistence remain deterministic application logic. Provider failures are surfaced or use clearly labeled deterministic fallback behavior where appropriate.

## Resources

- [Next.js documentation](https://nextjs.org/docs)
- [FastAPI documentation](https://fastapi.tiangolo.com/)
- [SQLAlchemy documentation](https://docs.sqlalchemy.org/)
- [PostgreSQL documentation](https://www.postgresql.org/docs/)
- [Supabase documentation](https://supabase.com/docs)
- [Redis documentation](https://redis.io/docs/)
- [HashiCorp Vault documentation](https://developer.hashicorp.com/vault/docs)
- [OWASP ModSecurity Core Rule Set](https://coreruleset.org/docs/)
- [Prometheus documentation](https://prometheus.io/docs/)
- [Grafana documentation](https://grafana.com/docs/)

## Known limits

- Real OAuth, email, Gemini, Supabase Storage, and production TLS require valid external-provider configuration and must be demonstrated with team-owned test accounts.
- Company deletion is retention-safe archival and user deletion anonymizes records that must remain for recruitment integrity; the UI explains this behavior.
- The local TLS certificate is self-signed. Production uses the Ansible-managed trusted certificate and HTTPS-only ingress.
- Backup/restore procedures exist, but this 23-point set does not claim the separate health/status-and-backup module.
