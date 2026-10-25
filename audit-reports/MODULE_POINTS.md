# ft_transcendence v21.2 module assessment

Audit snapshot: **2026-10-22**, commit `708d00f468aac11d41f6af18639bb44e9501de4a`. Major modules are 2 points; minor modules are 1 point. Per Chapter IV, a partial module receives zero verified points. “PASS” means the checked-in implementation supplies every stated requirement by source and available automated evidence; external-provider and browser demonstrations remain evaluator checks.

## Score

| Result | Points |
|---|---:|
| Required minimum | 14 |
| Evidence-supported raw implementation | **21** |
| Points needed to reach 14 | **0** |
| Eligible bonus | **5** (cap reached) |
| Official maximum counted result | **19 / 19** |
| Raw buffer above the counted cap | **2** |
| Potential pending external demonstration | **1** (OAuth) |

The score does **not** make the submission evaluation-ready: mandatory and README rejection risks are documented in `SUBJECT_COMPLIANCE.md`. The repository README currently claims 22 raw points; that is stale because the `/status` page cited for D04 no longer exists.

## Complete catalogue (all 55 modules)

| ID | Module | Type | Max | Status | Verified | Missing requirements / dependency | Evidence |
|---|---|---|---:|---|---:|---|---|
| W01 | Framework for frontend and backend | Major | 2 | PASS | 2 | — | `apps/web/package.json`; `apps/api/app/main.py`; production build PASS |
| W02 | Frontend framework | Minor | 1 | PASS, alternative | 0 | Implemented by Next.js/React but not double-counted with W01 | `apps/web/package.json` |
| W03 | Backend framework | Minor | 1 | PASS, alternative | 0 | Implemented by FastAPI but not double-counted with W01 | `apps/api/app/main.py` |
| W04 | Realtime features | Major | 2 | PASS | 2 | Live two-client evaluation still required | `routers/chat.py`; `services/chat_realtime.py`; `test_chat_realtime.py` (4 passed) |
| W05 | User interaction | Major | 2 | PASS | 2 | — | profiles, friends and chat in `routers/friends.py`, `routers/chat.py`; friendship tests (8 passed) |
| W06 | Public API | Major | 2 | FAIL | 0 | No separate public API secured by API key with documented/rate-limited CRUD and five endpoints | Product OpenAPI is not this module |
| W07 | ORM | Minor | 1 | PASS | 1 | Alembic drift is a quality blocker, but persistence uses the ORM | `models.py`; `database.py`; `alembic/versions/` |
| W08 | Complete CRUD notification system | Minor | 1 | PARTIAL | 0 | Covers selected friend/chat/application events, not all create/update/delete actions | notification router/service |
| W09 | Realtime collaborative features | Minor | 1 | FAIL | 0 | No shared editing/workspace/drawing collaboration | None found |
| W10 | Server-side rendering | Minor | 1 | PASS | 1 | — | dynamic `/offers/[category]`; build marks server-rendered |
| W11 | PWA | Minor | 1 | PASS | 1 | Live install/offline demonstration recommended; fallback is cached `/` | manifest, icons, registration, `public/sw.js`; PWA tests pass |
| W12 | Custom design system | Minor | 1 | PASS | 1 | — | tokens in `globals.css`; 20+ components under `components/ui/` |
| W13 | Advanced search | Minor | 1 | PASS | 1 | — | combined filters, sorting and pagination; search tests pass |
| W14 | File upload and management | Minor | 1 | PASS | 1 | Supabase bucket behavior must be shown live | avatar/CV/logo validation, private storage, progress, preview/download/delete |
| A01 | WCAG 2.1 AA accessibility | Major | 2 | PARTIAL | 0 | No full WCAG, screen-reader, keyboard or assistive-technology proof | Accessible primitives alone are insufficient |
| A02 | Three-language i18n | Minor | 1 | FAIL | 0 | No i18n, three complete translations or switcher | None found |
| A03 | RTL language support | Minor | 1 | FAIL | 0 | No RTL locale or mirrored layout | None found |
| A04 | Two additional browsers | Minor | 1 | NOT TESTED | 0 | No complete Firefox/Safari/Edge test evidence | Browser data is seven months stale |
| U01 | Standard user management | Major | 2 | PASS | 2 | — | editable profiles, avatar/default, friends, profile pages and presence |
| U02 | Game statistics/history | Minor | 1 | FAIL | 0 | Requires a game | Dependency unmet |
| U03 | OAuth 2.0 remote authentication | Minor | 1 | PARTIAL | 0 | Google/LinkedIn flows exist, but no successful real-provider proof; two OAuth/MFA tests fail without TOTP key | OAuth service/routes/tests |
| U04 | Advanced permissions | Major | 2 | PASS | 2 | “Delete” is retention-safe deactivation/anonymization; evaluator must accept that interpretation | permissions matrix, admin lifecycle, role UI |
| U05 | Organization system | Major | 2 | PASS | 2 | Organization deletion is archival | company CRUD/archive, invitation/membership lifecycle |
| U06 | Complete 2FA | Minor | 1 | PASS | 1 | Requires configured encryption key and real-authenticator demo | TOTP, recovery codes, trusted devices, replay protection |
| U07 | User activity analytics/insights | Minor | 1 | PARTIAL | 0 | Audit feed/pipeline counts are not complete per-user insights | admin activity/company analytics |
| AI01 | Game AI opponent | Major | 2 | FAIL | 0 | Requires a game | Dependency unmet |
| AI02 | Complete RAG system | Major | 2 | FAIL | 0 | No retrieval/context-generation pipeline over a large dataset | None found |
| AI03 | Complete LLM interface | Major | 2 | PARTIAL | 0 | Text helpers exist, but no streaming-response interface | Gemini profile/recommendation services |
| AI04 | ML recommendation system | Major | 2 | PARTIAL | 0 | No collaborative filtering or continuous behavior-driven improvement | recommendation/match services |
| AI05 | AI content moderation | Minor | 1 | FAIL | 0 | No auto moderation/deletion/warning | None found |
| AI06 | Voice/speech integration | Minor | 1 | FAIL | 0 | No speech interface | None found |
| AI07 | Sentiment analysis | Minor | 1 | FAIL | 0 | No sentiment workflow | None found |
| AI08 | Image recognition/tagging | Minor | 1 | FAIL | 0 | No recognition/tagging | None found |
| C01 | Hardened ModSecurity + HashiCorp Vault | Major | 2 | PARTIAL | 0 | WAF exists; production/default Compose does not deploy HashiCorp Vault. Ansible Vault is a different product | WAF config; optional Vault client/dev override |
| G01 | Complete web game | Major | 2 | FAIL | 0 | No game | None found |
| G02 | Remote two-player game | Major | 2 | FAIL | 0 | No game/reconnect gameplay | Dependency unmet |
| G03 | Multiplayer 3+ game | Major | 2 | FAIL | 0 | No game | Dependency unmet |
| G04 | Second game + history/matchmaking | Major | 2 | FAIL | 0 | No first/second game | Dependency unmet |
| G05 | Advanced 3D graphics | Major | 2 | FAIL | 0 | A `three` dependency/decoration is not an immersive 3D module | No qualifying implementation |
| G06 | Advanced chat | Minor | 1 | PARTIAL | 0 | Persistence, profiles, blocking and receipts exist; game invitations/notifications cannot exist | Dependency incomplete |
| G07 | Tournament system | Minor | 1 | FAIL | 0 | Requires a game | Dependency unmet |
| G08 | Game customization | Minor | 1 | FAIL | 0 | Requires a game | Dependency unmet |
| G09 | Gamification | Minor | 1 | PARTIAL | 0 | Missions/progress do not establish three clear persistent reward mechanics | mission router/UI |
| G10 | Spectator mode | Minor | 1 | FAIL | 0 | Requires a game | Dependency unmet |
| D01 | ELK log management | Major | 2 | FAIL | 0 | No ELK, retention or secured dashboard | None found |
| D02 | Prometheus + Grafana | Major | 2 | PARTIAL | 0 | Metrics exist; no Prometheus deployment, Grafana dashboards, alerts or security | `observability.py`; `/metrics` |
| D03 | Backend microservices | Major | 2 | PARTIAL | 0 | API/worker/dispatcher share code and database; not independently bounded services | Process separation only |
| D04 | Health/status + backup/DR | Minor | 1 | PARTIAL | 0 | Health and backup scripts exist, but the required status page was deleted; restore/offsite automation not run | `health.py`; scripts; missing status route |
| N01 | Advanced analytics dashboard | Major | 2 | PARTIAL | 0 | Lacks complete charts, realtime, export and custom date ranges | company analytics page |
| N02 | Data export/import | Minor | 1 | PASS | 1 | — | JSON/CSV/XML export; validated JSON import; lifecycle tests pass |
| N03 | GDPR-oriented features | Minor | 1 | PASS | 1 | Product feature claim, not legal certification | request/export, confirmed/cancelable deletion, emails |
| B01 | Avalanche/Solidity tournament scores | Major | 2 | FAIL | 0 | No game, smart contract or test-chain integration | None found |
| B02 | ICP backend | Minor | 1 | FAIL | 0 | No ICP backend | None found |
| X01 | Custom major | Major | 2 | FAIL | 0 | No selected/justified custom major in README | README excludes custom modules |
| X02 | Custom minor | Minor | 1 | FAIL | 0 | No selected/justified custom minor in README | README excludes custom modules |

## Arithmetic

```text
Majors: W01 + W04 + W05 + U01 + U04 + U05 = 12
Minors: W07 + W10 + W11 + W12 + W13 + W14 + U06 + N02 + N03 = 9
Raw evidence-supported total = 21
Counted total = 14 required + min(7 extra, 5 bonus cap) = 19 / 19
```

## Safer additions

1. Recover D04 by restoring a real public status page and running an isolated backup/restore drill (+1).
2. Configure and demonstrate one OAuth provider end to end, including existing-account MFA (+1).
3. Expand notifications to every material create/update/delete action and add coverage (+1).
4. Do not claim an AI module merely because Gemini is called; streaming/learning/retrieval requirements are absent.
