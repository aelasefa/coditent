# Frontend implementation: log out of all devices

The backend feature is implemented, but the frontend does not expose it yet. Add a **Log out of all devices** action to the signed-in user's account or security settings.

## API contract

Call `POST /auth/logout-all-devices` through the shared client in `apps/web/src/lib/api.ts`. The API client already adds credentials, bearer auth, and the CSRF header; do not create a separate client.

- Requires the current authenticated session.
- Success returns `{ "detail": "Logged out of all devices successfully." }` and clears the current auth cookies.
- The backend invalidates existing access tokens across devices. The current browser must also clear its locally stored auth token and move to the login page after success.
- A `503` means session storage could not revoke sessions; show the error and do not claim the other sessions were logged out.

## UI behavior

Add a clearly labeled button in account/security settings, near the existing two-factor controls. Explain that this ends sessions on every device, including the current one. Require a confirmation step before sending the request.

On success, clear client auth state using the existing auth helpers, invalidate user-specific cached data, then redirect to the login page with a brief success notice if the app supports one. Disable the action while it is running and show API failures accessibly with `role="alert"`.

## Acceptance criteria

- The action is available only to a signed-in user and uses the shared API client.
- The user must confirm before all sessions are revoked.
- After success, the current browser is signed out and redirected to login; another device's next authenticated request is rejected.
- If the API returns an error, the UI reports it accurately and does not display a success state.

## Scope check

This handoff is limited to backend-complete features that still lack frontend integration. The current frontend already has account data export/import, scheduled deletion and cancellation, password/email changes, and two-factor authentication controls; do not duplicate those screens.
