# ft_transcendence v21.2 module declaration

Audit baseline: 2026-10-27. The subject is authoritative. Major modules count two points, minor modules one point, and incomplete modules count zero. The team declares the verified set below for evaluation: **23 raw points**, with **19 / 19** as the subject's counted maximum.

| ID | Declared complete module | Type | Points | Repository evidence |
| --- | --- | --- | ---: | --- |
| W01 | Frontend and backend frameworks | Major | 2 | `apps/web/package.json`; `apps/api/app/main.py` |
| W04 | Realtime features | Major | 2 | `app/services/chat_realtime.py`; chat routers/hooks; realtime tests |
| W05 | Basic user interaction | Major | 2 | profile, friendship, presence and persistent chat routes/tests |
| W07 | ORM | Minor | 1 | SQLAlchemy models/session and Alembic migrations |
| W10 | Server-side rendering | Minor | 1 | `apps/web/src/app/offers/[category]/page.tsx` |
| W11 | Progressive web app | Minor | 1 | manifest, icons, service worker, offline page and tests |
| W12 | Custom design system | Minor | 1 | global tokens and reusable `components/ui` library |
| W13 | Advanced search | Minor | 1 | combined filters, sorting, pagination and unit tests |
| W14 | File upload and management | Minor | 1 | image/PDF/DOCX validation, private storage, progress, preview and deletion |
| U01 | Standard user management | Major | 2 | editable profiles, avatars, friends, presence and last-seen |
| U05 | Organization system | Major | 2 | company CRUD/archive, membership/invitation lifecycle and scoped actions |
| U06 | Complete 2FA | Minor | 1 | TOTP, recovery codes, trusted devices, disable and tests |
| C01 | Hardened ModSecurity plus HashiCorp Vault | Major | 2 | blocking rules; KV v2/AppRole runtime secret launcher and policies |
| D02 | Prometheus plus Grafana | Major | 2 | exporters, provisioned dashboard, five alerts, retention, TLS and authenticated Grafana |
| N02 | Data export/import | Minor | 1 | JSON/CSV/XML export and validated atomic JSON profile import |
| N03 | GDPR-oriented features | Minor | 1 | authenticated readable export; exact deletion confirmation; seven-day cancelable grace period; private-file erasure and anonymization; durable confirmation emails |
|  | **Raw total** |  | **23** | |

## Deliberately unclaimed

The score does not rely on OAuth provider success, advanced permissions, the health/status plus backup module, accessibility, extra browsers, AI, games, blockchain, or a custom module. Some of those have partial or substantial implementation, but omitting them removes interpretation and external-demonstration risk from the 23-point total.

## Mandatory compliance and remaining live evidence

Source and automated tests support the mandatory web frontend/backend/database, Git history, containerized one-command startup, Privacy Policy, Terms of Service, security controls, five-member README, and module implementation. Before evaluation the team must still demonstrate on the evaluation machine:

- clean startup from a fresh clone with valid team-owned provider credentials;
- latest stable Chrome with no JavaScript console warnings/errors;
- two-client realtime behavior and reconnect/history recovery;
- PWA install and offline behavior;
- live private object-storage upload/download/delete;
- real authenticator 2FA and one recovery code;
- WAF blocking and Vault-backed runtime injection without leaked secrets; and
- authenticated Grafana, healthy Prometheus targets, dashboard panels and alert rules.

These are evaluation demonstrations, not additional repository changes. If any declared module cannot be demonstrated completely, the subject awards zero for that module.
