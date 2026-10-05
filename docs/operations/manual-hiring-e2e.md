# Manual candidate-to-hire acceptance guide

Use disposable test accounts and non-production candidate data. Record the tested commit, migration head, browser, API base URL, and provider sandbox used. Do not use historical credentials.

## Preconditions

1. Deploy one tested commit and run `alembic upgrade head`; confirm `/health` and `/ready` both return HTTP 200.
2. Confirm the API, worker, and AI dispatcher are healthy and share the same `EMAIL_OUTBOX_ENCRYPTION_KEY`, Redis, and database configuration.
3. Configure a Resend sandbox sender and permitted recipient addresses. Keep provider values in the secret manager.
4. Prepare three isolated users: a platform administrator, a company owner, and a candidate. Use a second company user to verify HR assignment and access boundaries.

## Company and HR invitation

1. Sign in as the platform administrator and open **Company Invitations**.
2. Invite the company owner. Confirm the UI shows `sent`, `pending`, or `retry`; a provider failure must never appear as a successful send.
3. Open the received company invitation and create the owner account. Confirm the company and owner are linked only after acceptance.
4. From **Company → Team/Invitations**, invite the HR user with the intended company role.
5. Confirm the employee email uses the Coditent team-invitation theme, names the company and assigned role, and links to `/invite/employee?token=...`.
6. Accept the invitation. Confirm the role is assigned automatically and the acceptance form offers no candidate/recruiter role selector.
7. Attempt to reuse both invitation links; each must be rejected. Confirm an unrelated company administrator cannot view or manage these invitations.

## Candidate registration and profile

1. Open `/register`. Confirm there is no role selector and the copy describes a candidate account.
2. Enter a password and verify the live checklist independently marks: 12 characters, lowercase, uppercase, number, and symbol.
3. Try a password missing each requirement. Confirm both the browser and API reject it. Then register with a valid password.
4. Confirm the response redirects to email verification and exposes no access token before verification.
5. Enter an incorrect code, request a resend after cooldown, and confirm the old code no longer works. Complete verification with the new code and confirm the resulting role is `CANDIDATE`.
6. Complete onboarding, upload an avatar with visible progress, and upload a valid PDF/DOCX CV. Confirm preview/metadata and profile completion update.
7. Attempt an oversized, spoofed, or text-free document and confirm a bounded validation error; the prior CV must remain available.

## Offer and application

1. As the company owner or authorized HR user, create an offer with title, description, salary, work mode, skills, deadline, and lifecycle state.
2. Publish the offer. Confirm it is discoverable by the candidate and appears in recommendation pagination even when more than 20 matches exist.
3. Apply as the candidate. Submit twice concurrently or double-click; exactly one application should exist and the second request should return a conflict, not HTTP 500.
4. Replace the candidate's profile CV after applying. Confirm the application retains its immutable CV snapshot while the profile shows the new version.
5. Close the offer. Confirm new applications are rejected while the existing application, messages, interview feedback, and audit history remain.

## Interview and stages

1. Move the application from applied to under review, then shortlisted. Confirm skipped and reverse transitions are rejected.
2. Attempt to move the application to interview without scheduling details; the server must reject it.
3. Schedule an interview, then add structured feedback as two interviewers. Confirm feedback is private to authorized company users and version conflicts are reported.
4. Move the application through only allowed transitions. Confirm terminal states cannot transition and concurrent stale updates are rejected.

## Recruitment chat and authorization revocation

1. At a chat-enabled stage, open the recruitment conversation as the candidate and responsible HR. Exchange enough messages to exceed 100 and verify cursor pagination retrieves the full history without duplicates.
2. Open a second browser/API instance and confirm new messages and read receipts arrive across instances.
3. Verify a different company user and another candidate cannot read, download, subscribe to, or send in the conversation.
4. Reassign the responsible HR user. Confirm the former HR socket is closed or stops receiving messages immediately and the new HR user gains access.
5. Move the application out of a chat-enabled stage, deactivate a participant, or revoke the session. Confirm passive delivery and active sending both stop.

## Notifications, missions, privacy, and recovery

1. Confirm application, interview, and message events create owner-scoped notifications. Disable one category and verify the server stops creating it; test read-one and read-all.
2. As an administrator, publish a practice mission. Submit candidate evidence, review it, and confirm only administrator-validated skills change the evaluated profile score.
3. Request a password reset for an existing and nonexistent email. Confirm responses are indistinguishable; use the real single-use link once and verify prior sessions are invalidated.
4. Reauthenticate and export account data. Inspect that the export contains the user's data but no password hashes, OTPs, TOTP secrets, invitation tokens, or provider credentials.
5. Schedule account deletion, cancel it during the grace period, then repeat with a disposable account and allow the worker to process it. Confirm storage deletion occurs before anonymization and failures remain retryable.

## Operational evidence

1. Capture provider delivery IDs and application correlation IDs only; never record message bodies, tokens, OTPs, or candidate CV contents in logs or screenshots.
2. Verify the outbox shows bounded retry/failure states during a controlled provider outage and sends no expired or superseded verification code after recovery.
3. Run the documented backup/restore drill against a disposable target, validate its checksum, and record the tested PostgreSQL major version.
4. Execute the CI backend matrix, frontend type check/build/lint, migration upgrade, and deployment configuration validation for the exact commit being released.
5. Complete the production-only ingress, OAuth, Storage/RLS, WAF, provider-quota, log-retention, secret-rotation, and deployed-image-digest checks listed in the remediation checklist.
