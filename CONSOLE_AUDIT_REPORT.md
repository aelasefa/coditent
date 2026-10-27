# CODITENT Browser Console Audit

**Audit date:** 2026-10-26
**Verdict:** NOT FULLY VERIFIED

## Summary

The reported unused stylesheet preload is fixed. It came from the root 404 page's CSS module: Next.js emitted that module as a preload on ordinary pages even though the 404 page was not rendered. I moved those styles into the global stylesheet and added a regression test. The fresh production build now emits zero `as="style"` preloads on the homepage, login, registration, password reset, verification, offers, and legal routes.

ESLint, TypeScript, 41 frontend unit tests, and the production build pass. Chromium route loading covered all 57 built app routes with zero captured `console.warn` or `console.error` entries. Static asset checks found no failed local assets, and the redesigned 404 page still renders. Authenticated workflows remain unverified because the API service and test accounts are unavailable here; consequently this audit does not claim full application-wide PASS.

## Findings

| ID | Severity | Location / route | Finding and root cause | Fix |
|---|---|---|---|---|
| A-01 | Fixed | Root not-found boundary, all routes | Before the fix, Next emitted an unused CSS preload for `/_next/static/chunks/3gwtcgsjfo3t8.css` (3,772 bytes). This CSS belonged to `not-found.module.css`, which Next preloads because the root layout registers the not-found boundary even on successful routes. The supplied hash (`2z30wn-b2wxq7.css`) differed from this checkout's build, but the same warning pattern was reproduced. | Moved the namespaced not-found styles into `globals.css`; removed the CSS-module import/file; added a regression test. Fresh build: zero style preloads across sampled public routes, including 404 page. |
| A-02 | Test-environment notice | Local production launch | `next start` prints a notice because the project sets `output: "standalone"`. This is a framework CLI notice, not a browser console warning. | No app change needed; deployment Dockerfile uses the standalone server and separately copies `public/` and `.next/static/`. |
| A-03 | Environment limitation | Protected routes and API-backed interactions | The Compose service host `api:8001` was not resolvable from the host-run browser server, and no local backend container was running. A synthetic login attempt showed the app's error state; real credentials, account transitions, and API-backed workflows could not be exercised. | Not an application console defect. Do not run the configured migrations against external Supabase as part of this browser audit. |

No JavaScript exception, React warning, hydration message, or console network/CORS/CSP error was captured during the 57 route loads. Browser tooling did not expose uncaught page exceptions or full network event details; static resource URLs were checked directly instead.

## Versions and project inventory

- Next.js 16.4.3
- React / React DOM 19.3.0
- TypeScript 5.9.3
- ESLint 9.39.5 with `eslint-config-next` 16.4.3
- Node.js 22.22.1; pnpm 11.25.0 was available (the repository declares pnpm 10.5.2)
- Frontend source: `apps/web/src/app`, `apps/web/src/components`, `apps/web/src/hooks`, `apps/web/src/lib`, and `apps/web/src/utils`
- The build reported 57 routes, including candidate dashboard, company, admin, auth, messaging, offer, and legal routes.
- Realtime browser features use `use-friend-chat-socket.ts` and `use-recruitment-chat-socket.ts`.
- The app uses a Next rewrite to proxy `/api-proxy/*` to the backend; the backend was unavailable during this run.

## Verification results

| Check | Result |
|---|---|
| ESLint (`eslint`) | PASS |
| Frontend unit tests | PASS — 41 passed, 0 failed, including the preload regression test |
| TypeScript (`tsc --noEmit`) | PASS |
| Production build (`next build`) | PASS — all 57 app routes generated |
| Production HTML preload check | PASS — 0 CSS style preloads on `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/offers/all`, `/privacy`, `/terms`, and `/admin/login` |
| Chromium route console pass | PASS for captured levels — 57 routes loaded, 0 `console.warn` or `console.error` entries |
| Static resources | PASS — 41 distinct local resources checked, 0 failed; landing image returned 200 |
| Unauthenticated route behavior | PASS — protected routes redirected; valid 404 route rendered its fallback |
| Backend-dependent flows | NOT VERIFIED — Compose `api:8001` service unavailable from host, no API container running |
| Desktop/tablet/mobile viewports | NOT VERIFIED — no browser console-capable automation was available |

The route pass included public, authentication, candidate, company, admin, chat, and representative dynamic paths. Protected pages were tested only through their unauthenticated redirect behavior. Direct HTML checks covered 59 page/API paths: public pages returned 200, protected pages redirected with 307, and GET to the two POST-only AI endpoints returned expected 405 responses.

## Route and workflow coverage

| Area | Coverage |
|---|---|
| Route loading | All 57 built app routes visited in Chromium; 0 captured console warnings/errors |
| Landing and public pages | Rendered; 41 distinct local resources checked with 0 failures |
| Login UI | Rendered and synthetic invalid credentials exercised; local API unavailable, so only the error state was reached |
| Candidate dashboard, applications, profile, friends, notifications, settings, security, recommendations, missions | Route requests redirected as unauthenticated; authenticated content NOT VERIFIED |
| Company dashboard, jobs, candidates, invitations, messages, team, settings, analytics, onboarding | Route requests redirected as unauthenticated; authenticated content NOT VERIFIED |
| Admin workflows | Route requests redirected as unauthenticated; only login page itself rendered |
| OAuth, registration submission, password reset submission, logout, session expiration | NOT VERIFIED; require connected auth/backend and may trigger email/account side effects |
| Chat and WebSockets | NOT VERIFIED; backend unavailable |
| Modals, uploads, filters, pagination | NOT VERIFIED in browser; existing unit coverage passes for relevant client logic |
| 404 workflow | Rendered successfully after stylesheet change; console warnings/errors 0 |
| Responsive layouts | NOT VERIFIED; browser viewport override unavailable through current browser interface |

## Before/after counts

The unused stylesheet preload was reproduced from the generated HTML before the fix and is absent after the fix. Browser console counts are from the 57-route production load pass; full authenticated usage remains unverified.

| Category | Before | After | Status |
|---|---:|---:|---|
| JavaScript errors | 0 captured before | 0 captured across 57 route loads | PASS for tested routes |
| React warnings | 0 captured before | 0 captured across 57 route loads | PASS for tested routes |
| Hydration issues | 0 captured before | 0 hydration warnings captured | PASS for tested routes |
| Network failures | Backend unavailable; initial standalone test omitted public files | 0 failed static resources across 41 URLs; backend-dependent requests NOT VERIFIED | PARTIAL |
| CSS preload warnings | 1 Next-generated unused style preload in production HTML | 0 across 10 sampled public routes after fix | PASS |
| WebSocket errors | Not captured; backend unavailable | Not exercised | NOT VERIFIED |
| Other console warnings | 0 captured before | 0 across 57 route loads | PASS for tested routes |

## Files changed

- Updated `.gitignore` so the requested report is tracked despite the repository-wide Markdown ignore rule.
- Updated `apps/web/src/app/not-found.tsx` and `apps/web/src/app/globals.css`; removed `apps/web/src/app/not-found.module.css` to eliminate the unused preload.
- Added a regression check in `apps/web/tests/dashboard-performance.test.mts`.
- Updated `CONSOLE_AUDIT_REPORT.md` with the fix and revised verification results.

## Remaining work to reach PASS

To reach full PASS, run with a non-production test backend and test accounts, then capture page exceptions and network events while exercising authenticated candidate, company, and admin workflows at desktop, tablet, and mobile sizes. The CSS preload warning is resolved in this build; the supplied hashed filename came from a different build and was not present in this checkout.
