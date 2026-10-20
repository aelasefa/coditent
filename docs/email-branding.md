# CODITENT email branding and BIMI runbook

Last audited: 2026-10-20

This document prepares `coditent.app` for BIMI. It does not change DNS, Resend, production secrets, or email templates. Publishing the logo does not guarantee an avatar: each recipient mailbox provider decides whether and when to display it. Gmail requires a BIMI mark certificate (VMC or CMC); a free, self-asserted SVG is not enough for Gmail.

## 1. Resend and sender audit

All application mail converges on `apps/api/app/services/email.py::send_email`. That function constructs one header identity:

```text
CODITENT <RESEND_FROM_EMAIL>
```

No invitation, verification, recovery, or notification code overrides the `From` address. The encrypted outbox eventually calls this same function. The following message classes therefore share the same configured sender:

| Message class | Outbox kind/source |
| --- | --- |
| Company invitations | `company_invitation` |
| Employee invitations | `employee_invitation` |
| Registration verification and resend | `registration_verification` |
| Email-address change verification | `email_change_verification` |
| Password recovery | `password_recovery` |
| Account data operation/deletion notices | `account_data_confirmation` |

Sender identities found in the repository or observed during this audit:

| Address | Where it comes from | Status |
| --- | --- | --- |
| `notifications@coditent.app` | `ansible/inventory/group_vars/production.yml` and the current root `.env` | Repository production value and current workspace deployment input |
| `invitations@coditent.app` | Reported from received production mail | Likely deployed `RESEND_FROM_EMAIL`; not present in tracked application configuration |
| `notifications@maelmahf.dev` | `ansible/inventory/group_vars/all.yml` | Non-production default |
| `onboarding@resend.dev` | Runtime fallback in `email.py` | Resend test-only fallback when `RESEND_FROM_EMAIL` is absent |
| `coditent@yourdomain.com` | Root `.env.example` | Documentation placeholder only |

Before changing anything, inspect the deployed secret/environment and the Resend domain dashboard. Standardize on one deliberate root-domain sender, such as `invitations@coditent.app` or `notifications@coditent.app`, then update the deployment secret through the existing secret-management process. Do not commit the value or API key. Changing the local part does not change DMARC alignment because both addresses use `coditent.app`.

## 2. Authentication and alignment audit

Public DNS observed on 2026-10-20:

| Control | Observed DNS | Assessment |
| --- | --- | --- |
| DKIM | `resend._domainkey.coditent.app TXT` contains a 1024-bit RSA public key | Published and meets Gmail's current 1024-bit minimum; Google recommends 2048-bit where the provider supports it. Confirm the Resend dashboard says verified and a delivered message has `dkim=pass` with an aligned `header.d` domain. |
| SPF / return path | `send.coditent.app CNAME send.forge.rmta.net`; the target publishes Resend IPs and `~all` | Published. With relaxed alignment, `send.coditent.app` aligns organizationally with a From domain of `coditent.app`. |
| DMARC | `_dmarc.coditent.app TXT "v=DMARC1; p=none;"` | Valid monitoring policy, but not BIMI eligible and has no aggregate-report destination. |
| BIMI | No TXT record at `default._bimi.coditent.app` | Not configured. |

DNS presence cannot prove that a particular message was signed correctly. Verify a real delivered message before enforcing DMARC. For a message whose visible From address is `@coditent.app`, confirm at least one of these aligned paths, preferably both:

- SPF: `spf=pass` and the envelope/return-path domain is `send.coditent.app` (relaxed alignment with `coditent.app`).
- DKIM: `dkim=pass` and `header.d=coditent.app` or another organizationally aligned `*.coditent.app` domain.
- DMARC: `dmarc=pass` and `header.from=coditent.app`.

Keep relaxed alignment (`adkim=r; aspf=r`) while using Resend's `send.coditent.app` return path. Strict SPF alignment (`aspf=s`) would require the return-path domain to exactly equal `coditent.app` and may break the currently expected SPF alignment.

## 3. BIMI logo and public endpoint

The canonical product mark is defined in `apps/web/src/components/ui/logo.tsx` and used in the official app icon at `apps/web/src/app/icon.svg`. The original files were not changed.

A separate SVG Tiny Portable/Secure asset was created at:

```text
apps/web/public/.well-known/bimi/coditent.svg
```

After the web branch is deployed, Next.js serves it at:

```text
https://coditent.app/.well-known/bimi/coditent.svg
```

The file has a square viewport and fixed pixel dimensions, a solid background, `version="1.2"`, `baseProfile="tiny-ps"`, a title and description, and no scripts, animation, external references, or root `x`/`y` attributes. It is derived from the canonical mark rather than replacing it. A certificate authority may still require its own validation or conversion before embedding the mark in a VMC/CMC.

After deployment, verify that the URL returns `200`, `Content-Type: image/svg+xml`, no authentication challenge, and no cross-domain redirect:

```bash
curl -fsSIL https://coditent.app/.well-known/bimi/coditent.svg
curl -fsSL https://coditent.app/.well-known/bimi/coditent.svg | head
```

## 4. DNS records to publish manually

Do not publish BIMI until DMARC is at enforcement and production messages have been checked. DNS changes are manual.

### DMARC monitoring record

First create a working `dmarc@coditent.app` mailbox or route it to a DMARC report processor. Then replace the existing DMARC value with:

```dns
Name:  _dmarc.coditent.app
Type:  TXT
Value: v=DMARC1; p=none; pct=100; rua=mailto:dmarc@coditent.app; adkim=r; aspf=r
TTL:   300
```

If reports go to a different domain, that destination may need an additional external-report authorization record. Follow the report provider's exact instructions.

### Free/self-asserted BIMI record

Once DMARC reaches `p=quarantine; pct=100` or `p=reject; pct=100`, this is the no-certificate record:

```dns
Name:  default._bimi.coditent.app
Type:  TXT
Value: v=BIMI1; l=https://coditent.app/.well-known/bimi/coditent.svg
TTL:   300
```

This costs nothing and can work in mailbox providers that accept self-asserted BIMI. It will not make the logo appear in Gmail because Gmail requires a VMC or CMC PEM certificate.

### Gmail-compatible certified BIMI record

Purchase and validate a VMC or CMC first. Host the complete CA-provided PEM certificate chain at a stable public HTTPS URL, for example:

```text
https://coditent.app/.well-known/bimi/coditent.pem
```

Do not create a placeholder PEM. After the real certificate exists, publish Google's certificate form:

```dns
Name:  default._bimi.coditent.app
Type:  TXT
Value: v=BIMI1; l=; a=https://coditent.app/.well-known/bimi/coditent.pem
TTL:   300
```

If the certificate authority hosts the PEM, use its supplied HTTPS URL instead. Use only one TXT record at `default._bimi.coditent.app`; do not publish the free and certified values simultaneously.

## 5. Safe DMARC migration

Do not jump directly from `p=none` to `p=reject`. First inventory every legitimate service that sends as `@coditent.app`—Resend, any Google Workspace mailbox, support tooling, CRM, monitoring, and infrastructure alerts—and make each source pass aligned SPF or DKIM.

Recommended rollout, with at least 7 days of aggregate reports at each step and longer if mail volume is low:

1. Monitoring: `v=DMARC1; p=none; pct=100; rua=mailto:dmarc@coditent.app; adkim=r; aspf=r`
2. Quarantine 10%: change to `p=quarantine; pct=10`
3. Quarantine 25%: change to `p=quarantine; pct=25`
4. Quarantine 50%: change to `p=quarantine; pct=50`
5. BIMI-eligible quarantine: `v=DMARC1; p=quarantine; sp=quarantine; pct=100; rua=mailto:dmarc@coditent.app; adkim=r; aspf=r`
6. Reject 10%, 25%, then 50%, monitoring at every step.
7. Final enforcement: `v=DMARC1; p=reject; sp=reject; pct=100; rua=mailto:dmarc@coditent.app; adkim=r; aspf=r`

BIMI is eligible only at step 5 or step 7, where enforcement covers 100% of mail. Do not use `sp=none` for the final BIMI posture. Roll back to the previous percentage/policy if a legitimate source fails, fix that source, and resume only after reports are clean. Keep one DMARC TXT record only.

## 6. Gmail VMC/CMC and paid work

Gmail supports BIMI logo display only with a CA-issued mark certificate delivered as a PEM chain:

- **VMC:** requires the exact logo to be a registered trademark (or eligible government mark), plus organization/domain/identity validation. Gmail can display the logo and the verified checkmark.
- **CMC:** can cover an unregistered mark, but the issuer must validate prior use or another eligible basis. DigiCert currently documents at least 12 months of prior use on a controlled domain. Gmail can display the logo, but a CMC does not provide the VMC checkmark.

Paid steps can include trademark registration and legal work for a VMC, purchase and recurring renewal of the VMC/CMC, and optional CA hosting. Certificate pricing and accepted trademark jurisdictions change, so request a current quote from a Gmail-supported mark certificate issuer before budgeting. The SVG hosting and BIMI DNS record themselves can be free.

Even after certification, DMARC enforcement, and correct DNS, display is not guaranteed. Gmail and every other recipient provider apply their own support, reputation, anti-abuse, and rendering decisions.

Primary references:

- [Google: Set up BIMI](https://support.google.com/a/answer/10911320)
- [Google: Email sender guidelines](https://support.google.com/mail/answer/81126)
- [BIMI Group: Creating BIMI SVG logo files](https://bimigroup.org/creating-bimi-svg-logo-files/)
- [BIMI Group: VMC and BIMI](https://bimigroup.org/verified-mark-certificates-vmc-and-bimi/)
- [DigiCert: CMC requirements](https://docs.digicert.com/en/certcentral/order-and-manage-certificates/manage-your-vmc-and-cmc-certificates/common-mark-certificate--cmc-.html)
- [Resend: DMARC and subdomains](https://resend.com/blog/how-dmarc-applies-to-subdomains)

## 7. Validation commands

Run these after each DNS change:

```bash
# DMARC: exactly one record; p=quarantine/reject and pct=100 for BIMI
dig +short TXT _dmarc.coditent.app

# BIMI: exactly one assertion after rollout
dig +short TXT default._bimi.coditent.app

# Resend DKIM public key
dig +short TXT resend._domainkey.coditent.app

# Inspect the currently published RSA DKIM key size
dig +short TXT resend._domainkey.coditent.app | tr -d '"' | sed 's/^p=//' \
  | base64 -d | openssl pkey -pubin -inform DER -text -noout | head -1

# Resend custom return path and SPF target
dig +short CNAME send.coditent.app
dig +short TXT send.coditent.app
dig +short MX send.coditent.app

# Public logo transport and MIME type
curl -fsSIL https://coditent.app/.well-known/bimi/coditent.svg

# TLS certificate/chain for the logo host
openssl s_client -connect coditent.app:443 -servername coditent.app </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

Also run the BIMI Group's validator after publishing the record. A successful DNS lookup is necessary but does not guarantee mailbox-provider display.

## 8. Verify a delivered message in Gmail

1. Send a normal transactional email through the production Resend path to a Gmail test mailbox. Do not alter the template for this test.
2. Open the message in Gmail.
3. Open the three-dot message menu and select **Show original**.
4. Confirm the summary shows `SPF: PASS`, `DKIM: PASS`, and `DMARC: PASS`.
5. In the raw `Authentication-Results` header, confirm:
   - `header.from=coditent.app`
   - SPF passes for the Resend return-path domain and aligns organizationally with `coditent.app`
   - DKIM passes with `header.d=coditent.app` or another organizationally aligned CODITENT domain
6. Confirm the visible From address is the intended deployed `RESEND_FROM_EMAIL` and the Resend dashboard reports the domain as verified.
7. Repeat for every legitimate sender platform before increasing DMARC enforcement.

Do not treat the avatar itself as the authentication test. Header results prove authentication; avatar display remains a recipient-provider decision.

## 9. Manual change checklist

- [ ] Decide whether the production sender is `invitations@coditent.app` or `notifications@coditent.app`.
- [ ] Confirm the deployed `RESEND_FROM_EMAIL` and Resend verified domain match that decision.
- [ ] Confirm real Gmail headers pass SPF, DKIM, and DMARC alignment.
- [ ] Create/route `dmarc@coditent.app` and start aggregate reporting with `p=none`.
- [ ] Inventory and remediate every legitimate sender for `coditent.app`.
- [ ] Deploy the web asset and verify the public SVG endpoint.
- [ ] Roll DMARC through quarantine percentages to `pct=100`.
- [ ] Publish the self-asserted BIMI record only if non-Gmail support is useful.
- [ ] For Gmail, choose and purchase a CMC or VMC and complete CA validation.
- [ ] Host the real PEM chain or use the CA-hosted URL.
- [ ] Replace the self-asserted BIMI TXT value with the single certified value.
- [ ] Validate DNS, the HTTPS files, Gmail message headers, and provider dashboards.
- [ ] Move to `p=reject; pct=100` only after reports show no legitimate failures.
