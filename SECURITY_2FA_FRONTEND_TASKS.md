# Frontend 2FA Implementation Tasks

The backend 2FA endpoints are already available. Implement the following website flows for users.

## 1. MFA Login Challenge

When `POST /auth/login` returns `require_2fa: true` and an `mfa_token`:

- Do not treat the response as a completed login or redirect to the dashboard.
- Show a 2FA verification screen with a six-digit authenticator-code input.
- Submit `{ "mfa_token": "...", "code": "123456" }` to `POST /auth/2fa/verify`.
- On success, save the returned access token and continue the normal dashboard flow.
- On an invalid code, keep the form open and show `Invalid code`.
- On an expired MFA token, return the user to the login screen and ask them to sign in again.
- Support backup codes if the API accepts them for this endpoint.

Users without 2FA must continue through the existing login flow normally.

## 2. Authenticator App Setup

Add a Security or Account Settings section with a `Set up 2FA` flow:

1. Call `POST /auth/2fa/setup`.
2. Display the QR-code data returned by the API and the secret key as a manual fallback.
3. Ask the user for the current six-digit authenticator code.
4. Submit the code to `POST /auth/2fa/enable`.
5. On success, display the recovery backup codes once with a clear instruction to save them.

If 2FA is already enabled, do not start another setup flow. Show the current status instead.

## 3. Status and Disable Flow

- Call `GET /auth/2fa/status` when loading the Security section.
- Show whether 2FA is enabled or disabled.
- When enabled, show a `Disable 2FA` action.
- Require the current password and a six-digit TOTP code or backup code.
- Submit the credentials to `POST /auth/2fa/disable`.
- On success, clear the security state and show 2FA as disabled.

Handle wrong passwords, invalid codes, expired or consumed backup codes, and general server errors.

## 4. UX and Validation

- Show loading indicators during setup, verification, and disable requests.
- Disable submit buttons while a request is processing.
- Restrict authenticator-code fields to numeric input with exactly six digits.
- Auto-focus the code field and support normal mobile keyboard behavior.
- Show clear error banners for invalid codes, expired sessions, invalid passwords, and unavailable APIs.
- Show clear success states after enabling or disabling 2FA.
- Never log access tokens, MFA tokens, TOTP secrets, or recovery codes.

## Acceptance Criteria

- A user without 2FA can log in normally.
- A user with 2FA enabled is forced through the MFA challenge after entering a password.
- Successful MFA verification stores the token and opens the correct dashboard.
- A user can enable 2FA from Security settings and see recovery codes once.
- A user can disable 2FA with their password and a TOTP or backup code.
- Invalid codes, expired challenges, failed requests, and wrong passwords produce useful UI feedback.

## Copy-Paste Request

Hi, can you implement the frontend 2FA flow? The backend endpoints are already built. Please add MFA challenge handling to login, authenticator-app setup from Security settings, status and disable flows, six-digit validation, loading states, and clear errors for invalid codes, expired challenges, wrong passwords, and failed API requests. The acceptance criteria are that login works with and without 2FA, enabled users must complete MFA, setup displays the QR code and one-time recovery codes, and disabling works with a password plus TOTP or backup code.