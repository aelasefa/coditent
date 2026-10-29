*This project has been created as part of the 42 curriculum by ayelasef, iel-asef, abelahse, maelmahf, ahabibi-.*

# CODITENT

## Description

CODITENT is an AI-assisted recruitment and professional-development platform. It connects candidates with companies through job discovery, structured applications, practical assessments, interviews, recruiter communication, and candidate networking.

Candidates can build a professional profile, upload a CV and avatar, discover and filter opportunities, apply to offers, complete assessments, follow their application stage, communicate with responsible recruiters, add other candidates as friends, and exchange real-time messages.

Company teams can create and manage an organization, invite employees, assign roles, publish opportunities, review candidates, move applications through a controlled recruitment pipeline, schedule interviews, and view recruitment analytics. Platform administrators supervise users, companies, activity, and security-sensitive operations.

### Key features

- Secure email/password authentication with email verification.
- Google OAuth 2.0 and TOTP two-factor authentication.
- Candidate profiles, CVs, avatars, skills, education, and experience.
- Company organizations, invitations, memberships, and role-based actions.
- Job publication, discovery, advanced search, applications, and interviews.
- AI-assisted CV extraction, matching, screening, recommendations, and practice tasks.
- Friend requests, presence, persistent messaging, and recruitment chat.
- Real-time updates using WebSockets with Redis fan-out.
- Private file storage with validation, preview, progress, and deletion.
- Account-data export/import and GDPR-oriented account deletion.
- PWA installation and offline fallback.
- ModSecurity WAF, HashiCorp Vault, Prometheus, and Grafana.

## Team Information

| Team member | 42 login | Assigned role(s) | Responsibilities |
| --- | --- | --- | --- |
| Ayman Elasefar | `ayelasef` | Product Owner, DevOps Developer | Defines product priorities and acceptance criteria; maintains Docker, CI/CD, Ansible, nginx/TLS, monitoring, and OAuth deployment integration. |
| Ilyas El Asefar | `iel-asef` | Frontend Developer | Implements company workflows, jobs and offers, candidate pipeline and assessment interfaces, and responsive behavior. |
| Ayman Belahsen | `abelahse` | Technical Lead, Frontend Developer | Guides frontend architecture and code quality; implements the design system, navigation, CV experience, and chat UX. |
| Mohammed Elmahfoudi | `maelmahf` | Project Manager, Backend Developer | Coordinates delivery; implements FastAPI services, database migrations, recruitment workflows, real-time messaging, and backend tests. |
| Abderrahmane Habibi Ihlane | `ahabibi-` | Security Developer | Implements Vault integration, 2FA, session/device security, GDPR account controls, security headers, and container hardening. |

All team members also act as developers. Each member participates in implementation, reviews, testing, documentation, and preparation for the final evaluation.

## Project Management

The project was divided into five main milestones:

1. Identity, authentication, and user profiles.
2. Companies, offers, applications, and assessments.
3. Friends, recruitment messaging, and real-time communication.
4. Privacy, security, and account lifecycle.
5. Deployment, monitoring, testing, and documentation.

The Product Owner defined expected user outcomes and priorities. The Project Manager converted them into smaller deliverables and tracked blockers. The Technical Lead reviewed architectural choices and cross-layer changes. Developers worked through feature branches and pull requests.

- **Task management:** GitHub Issues and milestone-based planning.
- **Code collaboration:** Git feature branches, pull requests, and peer reviews.
- **Communication:** Pull-request discussions and scheduled team voice meetings.
- **Quality control:** Automated CI checks, code review, functional testing, and documentation updates before merging.

## Technical Stack

### Frontend

- Next.js 16 and React 19
- TypeScript
- Tailwind CSS
- Reusable custom UI component system
- Service worker and Web App Manifest for PWA support

### Backend

- Python 3.12
- FastAPI and Uvicorn
- Pydantic validation
- SQLAlchemy async ORM and Alembic migrations
- WebSockets
- Celery for background tasks

### Data and infrastructure

- PostgreSQL through Supabase
- Supabase private object storage
- Redis for background work, shared state, presence, rate state, and real-time fan-out
- Docker and Docker Compose
- nginx with TLS and ModSecurity
- HashiCorp Vault KV v2 with AppRole
- Prometheus and Grafana
- GitHub Actions and Ansible

### External services

- Google Gemini for AI-assisted features
- Google OAuth 2.0 for remote authentication
- Resend for transactional email

### Technical-choice justification

| Choice | Reason |
| --- | --- |
| Next.js and React | Provide structured routing, reusable components, server rendering, metadata support, and a mature frontend ecosystem. |
| FastAPI | Provides typed asynchronous APIs, dependency-based authorization, validation, WebSockets, and OpenAPI documentation. |
| PostgreSQL | Provides relational integrity, transactions, constraints, indexing, and reliable concurrent access. |
| SQLAlchemy and Alembic | Provide a maintainable ORM model and reproducible schema migrations. |
| Redis and Celery | Keep slow email and AI work outside HTTP requests and share real-time state between API instances. |
| Supabase Storage | Provides private object storage independently of application containers. |
| ModSecurity and Vault | Add request filtering and isolate runtime secrets from source code and container images. |
| Prometheus and Grafana | Provide metrics, dashboards, retention, and operational alerts. |

## Architecture

```text
Browser
  |
  v
nginx + TLS + ModSecurity
  |----------------------|
  v                      v
Next.js                 FastAPI
                          |
          |---------------|---------------|
          v               v               v
     PostgreSQL          Redis       Private storage
                          |
                          v
                    Celery workers

FastAPI metrics -> Prometheus -> Grafana dashboards and alerts
Runtime secrets <- HashiCorp Vault KV v2 + AppRole
```

## Database Schema

The authoritative implementation is located in `apps/api/app/models.py` and `apps/api/alembic/versions/`.

| Table/domain | Important fields and types | Main relationships and constraints |
| --- | --- | --- |
| `users` | `id UUID`, `email VARCHAR`, `password_hash VARCHAR`, `role ENUM`, `is_active BOOLEAN`, `company_id UUID`, `created_at TIMESTAMP` | Primary key on `id`; unique email; optional company foreign key; parent of profiles, applications, friendships, messages, memberships, and audit activity. |
| `candidate_profiles` | `id UUID`, `user_id UUID`, `headline VARCHAR(120)`, `bio TEXT`, `study_level ENUM`, `onboarding_step INTEGER` | One-to-one relation with a candidate user; stores CV/avatar references and professional information. |
| `companies` | `id UUID`, `name VARCHAR`, `status VARCHAR`, `owner_id UUID`, `subscription_plan VARCHAR(30)`, `created_at TIMESTAMP` | Unique company name; owner foreign key; parent of members, invitations, opportunities, and subscriptions. |
| Company memberships | `id UUID`, `company_id UUID`, `user_id UUID`, `role VARCHAR`, `status VARCHAR` | Connects users to organizations; unique company/user membership; role controls organization-scoped actions. |
| Company invitations | `id UUID`, `company_id UUID`, `email VARCHAR`, `role VARCHAR`, `token_hash VARCHAR`, `expires_at TIMESTAMP` | Invitation token is stored as a hash; invitation belongs to one company and expires. |
| Opportunities | `id UUID`, `company_id UUID`, `title VARCHAR`, `description TEXT`, `status VARCHAR`, `created_at TIMESTAMP` | Belongs to a company; parent of applications and assessments. |
| `applications` | `id UUID`, `candidate_id UUID`, `opportunity_id UUID`, `company_id UUID`, `status VARCHAR`, `stage_version INTEGER`, `ai_score INTEGER` | Unique candidate/opportunity pair; foreign keys to candidate, opportunity, and company; stage version protects transitions. |
| Interviews | `id UUID`, `application_id UUID`, `scheduled_at TIMESTAMP`, `status VARCHAR` | Belongs to an application and connects the candidate with the responsible company team. |
| `friendships` | `id UUID`, `requester_id UUID`, `addressee_id UUID`, `pair_low_id UUID`, `pair_high_id UUID`, `status VARCHAR(20)` | Unique unordered user pair; self-friendship forbidden; messaging requires approved status. |
| Direct messages | `id UUID`, `sender_id UUID`, `receiver_id UUID`, `body TEXT`, `created_at TIMESTAMP`, `read_at TIMESTAMP` | Connects approved friends; indexed chronologically and persisted for reconnect recovery. |
| Recruitment messages | `id UUID`, `application_id UUID`, `sender_id UUID`, `body TEXT`, `created_at TIMESTAMP` | Scoped to an eligible application and its authorized candidate/recruiter participants. |
| Background outbox | `id UUID`, `job_type VARCHAR`, `payload JSON`, `attempts INTEGER`, `status VARCHAR`, `created_at TIMESTAMP` | Stores retryable AI/email jobs with leasing and idempotent delivery state. |
| Privacy requests | `id UUID`, `user_id UUID`, `status VARCHAR`, `scheduled_for TIMESTAMP`, `completed_at TIMESTAMP` | Drives export and cancelable account erasure while preserving required anonymized records. |
| Audit activity | `id UUID`, `actor_id UUID`, `action VARCHAR`, `target_type VARCHAR`, `target_id UUID`, `created_at TIMESTAMP` | Records administrative and security-sensitive operations. |

## Features and Ownership

| Feature | Functionality | Main contributor(s) |
| --- | --- | --- |
| Authentication and account security | Signup, verification, login, OAuth, 2FA, recovery codes, trusted devices, and session revocation | Abderrahmane, Ayman Elasefar |
| Candidate experience | Profile, CV, avatar, offer discovery, applications, assessments, and interviews | Ilyas, Ayman Belahsen, Mohammed |
| Company workspace | Organization creation, invitations, memberships, role-scoped actions, offers, and candidate pipeline | Ilyas, Mohammed |
| Recruitment backend | APIs, authorization, transitions, transactions, persistence, and tests | Mohammed |
| Friends and messaging | Friend lifecycle, presence, WebSockets, direct messages, and chat interface | Mohammed, Ayman Belahsen |
| AI assistance | CV extraction, match context, screening support, recommendations, and practice tasks | Mohammed, Ayman Elasefar |
| File management | Private CV/avatar/company assets, validation, upload progress, preview, and deletion | Mohammed, Ayman Belahsen |
| Privacy | Data export/import, deletion scheduling, cancellation, anonymization, and confirmation emails | Mohammed, Abderrahmane |
| Design system and PWA | Reusable UI components, responsive navigation, manifest, installability, cache, and offline fallback | Ilyas, Ayman Belahsen |
| Infrastructure and observability | Docker, CI/CD, deployment, TLS, metrics, dashboards, and alerts | Ayman Elasefar |
| Security hardening | WAF, Vault, headers, secret handling, and account/device protections | Abderrahmane, Ayman Elasefar |

## Chosen Modules and Point Calculation

Major modules are worth 2 points and minor modules are worth 1 point. The implementation contains 23 raw module points. The subject requires 14 points and permits a maximum of 5 additional bonus points, so the maximum counted result is 19 points.

| Category | Module | Type | Points | Implementation |
| --- | --- | --- | ---: | --- |
| Web | Framework for frontend and backend | Major | 2 | Next.js frontend and FastAPI backend. |
| Web | Real-time features | Major | 2 | WebSocket tickets, acknowledgements, heartbeat, reconnect, Redis fan-out, and persisted recovery. |
| Web | User interaction | Major | 2 | Profiles, friend requests/removal, presence, friend list, and persistent chat. |
| Web | ORM | Minor | 1 | Async SQLAlchemy models and Alembic migrations. |
| Web | Server-side rendering | Minor | 1 | Server-rendered public opportunity pages and metadata. |
| Web | Progressive Web App | Minor | 1 | Manifest, icons, service worker, versioned cache, and offline fallback. |
| Web | Custom design system | Minor | 1 | Shared tokens and at least 19 reusable UI components. |
| Web | Advanced search | Minor | 1 | Text, field, region, and opportunity-type filters with sorting and pagination. |
| Web | File upload and management | Minor | 1 | Multiple file types, client/server validation, private storage, progress, preview, and deletion. |
| User Management | Standard user management | Major | 2 | Editable profiles, default/custom avatars, friendships, profiles, and online status. |
| User Management | Organization system | Major | 2 | Company creation, reading, updating, archival, invitations, membership, removal, and role-scoped actions. |
| User Management | Complete 2FA | Minor | 1 | TOTP enrollment and challenge, recovery codes, trusted devices, and disable flow. |
| Cybersecurity | WAF and HashiCorp Vault | Major | 2 | Hardened ModSecurity rules and Vault KV v2/AppRole runtime secret injection. |
| DevOps | Prometheus and Grafana | Major | 2 | Metrics collection, exporters, custom dashboards, alert rules, retention, and secured Grafana access. |
| Data and Analytics | Data export and import | Minor | 1 | JSON, CSV, and XML export plus validated transactional JSON profile import and bulk export operations. |
| Data and Analytics | GDPR compliance | Minor | 1 | Readable export, confirmed deletion request, cancellation period, private-file erasure, anonymization, and operation emails. |
|  | **Raw total** |  | **23** |  |
|  | **Maximum counted by the subject** |  | **19/19** | 14 required points plus up to 5 bonus points. |

## Individual Contributions

### Ayman Elasefar — `ayelasef`

- Defined product priorities and acceptance criteria.
- Implemented containerization, CI/CD, Ansible deployment, nginx/TLS, and monitoring.
- Integrated OAuth configuration across development and production environments.
- Addressed consistency between local, CI, and EC2 deployments.

### Ilyas El Asefar — `iel-asef`

- Implemented company workspace, offers, candidate pipeline, and assessment interfaces.
- Connected complex recruitment views to production data.
- Improved responsive behavior across desktop and mobile layouts.

### Ayman Belahsen — `abelahse`

- Guided frontend architecture and reusable-component design.
- Implemented navigation, CV flows, PWA behavior, and chat interface.
- Developed optimistic message delivery and reconciliation behavior.

### Mohammed Elmahfoudi — `maelmahf`

- Coordinated delivery and backend integration.
- Implemented FastAPI services, database models, migrations, and backend tests.
- Developed application-stage transitions, organization authorization, friendships, and real-time messaging.
- Addressed transactional integrity, concurrent actions, and WebSocket consistency.

### Abderrahmane Habibi Ihlane — `ahabibi-`

- Implemented Vault-backed secret handling and security hardening.
- Developed TOTP 2FA, recovery codes, trusted devices, and session protections.
- Implemented GDPR account controls and secure account-deletion behavior.
- Addressed secret isolation and revocable account/session mechanisms.

## Instructions

### Prerequisites

- Git
- Bash 5.2 or newer
- Docker Engine 24 or newer
- Docker Compose 2.20 or newer
- A Supabase PostgreSQL project
- Required private Supabase storage buckets
- HashiCorp Vault configuration described in `docs/shared-vault.md`

For local development outside Docker:

- Python 3.12
- Node.js 22
- pnpm 10.5.2

### Installation and configuration

1. Clone the repository and enter its root directory:

```bash
git clone https://github.com/aelasefa/coditent.git
cd coditent
```

2. Create the local environment file:

```bash
cp .env.example .env
```

3. Follow `docs/shared-vault.md` to initialize Vault and configure the documented secret paths. Real credentials, tokens, and unseal material must never be committed.

4. Configure the Supabase PostgreSQL connection and private storage buckets using the variables documented in `.env.example`.

### Run the application

Start the complete containerized application with one command:

```bash
./scripts/run_project.sh
```

The script loads the required secrets from Vault and runs the Docker Compose stack with the necessary build step.

Start the monitoring stack with:

```bash
./scripts/run_monitoring.sh
```

All browser and external API traffic must pass through the configured HTTPS reverse proxy. Plain HTTP service ports are for loopback/internal container communication only.

### Backend development and tests

```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
alembic upgrade head
python -m pytest
```

### Frontend development and tests

```bash
cd apps/web
pnpm install --frozen-lockfile
pnpm run lint
pnpm exec tsc --noEmit
pnpm run test:unit
pnpm run build
```

## Security and Privacy

- Passwords are salted and hashed; plaintext passwords are never stored.
- Authentication and authorization are enforced by the backend.
- User inputs are validated in both the frontend and backend.
- External backend traffic uses HTTPS.
- ModSecurity filters malicious request patterns.
- Runtime secrets are loaded from Vault and are excluded from Git.
- Private files require authenticated, object-level authorization.
- Rate limiting protects security-sensitive and public endpoints.
- Privacy Policy and Terms of Service pages are accessible from the public interface.
- Users can export their data and request or cancel account deletion.

## Multi-user and Real-time Support

CODITENT supports multiple simultaneously active users. Database constraints, transactions, stage-version checks, and authorization protect concurrent operations. Redis shares presence and real-time events between API processes. WebSocket clients use acknowledgements, heartbeat, reconnect, and persisted-message recovery to keep multiple sessions synchronized.

## AI Usage

The team used AI assistants during development for boilerplate suggestions, debugging hypotheses, test-case ideas, CSS refinement, documentation structure, and security-review checklists. Generated suggestions were reviewed, adapted, tested, and discussed by the team. Every team member remains responsible for understanding and explaining the submitted implementation.

CODITENT also uses Google Gemini as an application feature for CV extraction, recommendation and match context, screening assistance, biography drafting, and practice-task generation. AI output assists users and recruiters; deterministic backend logic remains responsible for authorization, workflow transitions, and stored state.

## Resources

- [Next.js documentation](https://nextjs.org/docs)
- [React documentation](https://react.dev/)
- [FastAPI documentation](https://fastapi.tiangolo.com/)
- [SQLAlchemy documentation](https://docs.sqlalchemy.org/)
- [Alembic documentation](https://alembic.sqlalchemy.org/)
- [PostgreSQL documentation](https://www.postgresql.org/docs/)
- [Supabase documentation](https://supabase.com/docs)
- [Redis documentation](https://redis.io/docs/)
- [Celery documentation](https://docs.celeryq.dev/)
- [HashiCorp Vault documentation](https://developer.hashicorp.com/vault/docs)
- [OWASP ModSecurity Core Rule Set](https://coreruleset.org/docs/)
- [Prometheus documentation](https://prometheus.io/docs/)
- [Grafana documentation](https://grafana.com/docs/)
- [OWASP Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/)

## Repository Structure

```text
coditent/
├── apps/
│   ├── api/                 # FastAPI backend, models, migrations, and tests
│   └── web/                 # Next.js frontend and reusable UI components
├── docs/                    # Architecture, Vault, operations, and recovery documentation
├── scripts/                 # Single-command launch and monitoring scripts
├── ansible/                 # Deployment automation
├── monitoring/              # Prometheus and Grafana configuration
├── .github/workflows/       # CI/CD workflows
├── docker-compose.yml       # Container orchestration
├── .env.example             # Required configuration names without secrets
└── README.md
```

## License

This project was created for educational purposes as part of the 42 curriculum.
