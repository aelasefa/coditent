# Candidate workspace UX contract

This contract covers the candidate dashboard, profile editor, job discovery, application tracker, and messages. Product identity and visual tokens are in `DESIGN.md`; API behavior is implemented in `apps/web/src/lib/api.ts` and the corresponding `apps/api/app/routers/` routes. This file records observable UI behavior, not backend permission policy. Accessibility target: WCAG 2.2 AA.

| Flow | Trigger and pending state | Success | Failure and recovery |
| --- | --- | --- | --- |
| Profile edit | Edit within top tabs; an unsaved bar appears; save button is busy during submission | Stay on the current tab, update profile query, show a success toast | Keep values and tab, focus first invalid field or show API error toast |
| Leave with profile edits | Same-tab link navigation opens a confirmation dialog; reload/close uses browser unload warning | Leave only after explicit discard | Keep editing returns to the unchanged draft |
| Profile photo | Select an image up to 2 MB; the profile and account avatars preview it immediately, and the photo is included with profile save | Update current user data so both avatars keep the saved photo | Discard restores the previous image; save failure keeps the draft and shows error feedback |
| CV upload and extraction | Choose PDF/DOCX up to 5 MB; show progress, parse, then review extracted fields | Apply only selected fields to the draft; candidate saves profile separately | Keep CV status and show an inline retry path |
| CV removal | Confirm in the shared dialog with safe action initially focused | Clear CV and refresh profile/CV queries | Keep dialog open and show error feedback |
| Discover | Client-side search/type/sort on loaded opportunities; field and region are used for match analysis | Show result count and selected detail; on small screens use the existing detail sheet | Keep previous results and show actionable analysis error |
| Applications | Select status filter in the horizontal stage row | Show filtered cards and stage guidance | Keep current data and use existing query error state |
| Messages | Search and filter the combined recruitment/direct inbox; select a conversation | Open its existing route in a two-panel desktop workspace or full-width mobile view; preserve polling/WebSocket delivery and send behavior | Keep the current route, show a retry action for failed lists or threads, and explain when recruitment chat is not yet available |

The profile form uses `react-hook-form` and Zod, with `noValidate`, inline errors, and first-invalid focus. Unsaved values persist when switching profile tabs. Discovery filters are transient local exploration state; a direct opportunity selection may use the existing `offer` URL parameter. Application details continue to use the existing `app` URL parameter. Data mutations are pessimistic, guarded against duplicate submits, and followed by React Query invalidation.

The decorative profile illustration plays its three-second silent clip once when the profile page loads, including after a refresh. It does not loop. The still illustration remains visible while the clip loads, on playback failure, and when reduced motion is preferred.

Shared ownership: `apps/web/src/components/ui/` provides form fields, buttons, dialog, sheet, skeleton, and toast; `apps/web/src/components/shell/candidate-top-shell.tsx` provides the candidate top navigation without changing the company shell; `apps/web/src/app/globals.css` owns semantic tokens, focus, and motion defaults. Candidate-specific layout lives in `apps/web/src/components/candidate/candidate-pages.module.css`. The profile tabs implement the tablist arrow-key/Home/End convention. The mobile top menu remains available at 375px, closes on navigation or Escape, and shows the active destination; the application stage row is horizontally scrollable rather than compressed. Job details stay beside results on desktop and open in a sheet below 1024px.

The message workspace lives in `apps/web/src/components/candidate/chat-workspace.tsx` and its CSS module. Its filters and search operate on loaded conversations only; they do not invent unread counts or alter backend chat permissions. Candidate chat routes retain their URLs. On desktop, the inbox stays beside the thread; below 900px, the inbox and thread become separate full-width views with a back link. The shared message list and composer continue to serve company recruitment threads.

Candidate single-select controls intentionally use the shared native `Select` component (`apps/web/src/components/ui/select.tsx`); operating-system popup presentation is acceptable for study level, opportunity type, and sort order. This keeps keyboard and touch behavior familiar across devices. The shared `Dialog` owns destructive and unsaved-change confirmation; the shared toast owns transient mutation feedback.

The backend remains authoritative for profile data, applications, assessments, and matching. No score or recruiter evaluation is displayed unless the candidate API actually returns it. The API candidate application list must return opportunity title/company and update time for the tracker; recruiter-only details stay on their existing routes.

Verify with frontend lint, TypeScript, production build, API syntax/contract smoke check, and browser review at 375, 768, 1024, and 1440px. Check keyboard focus, reduced motion, console errors, and horizontal overflow. Browser preview may use local mock data for layout and interaction checks; authenticated live mutations still require a real candidate session.
