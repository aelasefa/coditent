# Admin control plane

Coditent treats the application API as the final authorization boundary and an
identity-aware edge as an additional boundary. The administrative hostname is
`admin.coditent.app`; the public application hostname must not serve `/admin`
after `ADMIN_ORIGIN` is enabled.

## Safe rollout order

1. Confirm every `PLATFORM_ADMIN` has TOTP enabled while the current deployment
   is still active. The hardened admin login rejects privileged accounts that
   have not enrolled MFA.
2. Add `admin.coditent.app` as a custom domain for the existing Vercel project.
3. Put that hostname behind Cloudflare Access. Allow only named administrator
   identities or a dedicated IdP group and require MFA on every Access login.
4. Keep `/api-proxy` same-origin on the admin hostname. Do not set
   `NEXT_PUBLIC_API_URL` to the public API hostname; the browser must receive
   host-bound Secure/HttpOnly cookies through the Next.js rewrite.
5. Add the admin origin to the API CORS allowlist. It is already represented by
   `cors_origins` in the production Ansible inventory.
6. Set `ADMIN_ORIGIN=https://admin.coditent.app` in the Vercel project only
   after DNS, TLS, and Access policy tests pass. This activates the redirect
   away from `coditent.app/admin`.
7. Verify direct API requests remain protected by Coditent authentication,
   fresh MFA claims, and `PLATFORM_ADMIN` authorization even when the edge is
   bypassed. Cloudflare identity never replaces backend authorization.

## Required verification

- Candidate, company, legacy `ADMIN`, and unauthenticated sessions receive 403
  or 401 from all `/admin` API routes.
- A `PLATFORM_ADMIN` without MFA cannot sign in through any public or OAuth
  login flow.
- Every admin login prompts for MFA; trusted-device cookies are ignored and no
  new trusted-device cookie is issued for an admin session.
- Administrators cannot impersonate or sign in as another account.
- Canceling a user's scheduled deletion requires an MFA proof less than ten
  minutes old and is allowed only before deletion processing begins.
- Browser storage contains no access token or trusted-device credential.
- Requests to `https://coditent.app/admin` redirect to the protected admin
  hostname only after `ADMIN_ORIGIN` is enabled.

## Recovery access

Keep at least two independently controlled platform-administrator identities
with separately stored recovery codes. A recovery procedure should temporarily
remove the Cloudflare Access policy only through audited break-glass ownership;
it must not weaken API role or MFA checks.
