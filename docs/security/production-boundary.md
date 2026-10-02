# Production ingress and runtime boundary

Production and staging use `docker-compose.production.yml` in addition to the
development Compose file. API, Redis, and the container proxy bind only to host
loopback addresses. Host Nginx is the single public ingress: port 80 performs a
permanent HTTPS redirect and port 443 terminates a provisioned certificate,
applies ModSecurity/OWASP CRS (including explicit JSON request-body parsing),
and proxies to loopback services.

Required production values are injected through Ansible or the host secret
store, never committed:

- `APP_ENV=production`
- `FRONTEND_URL=https://<canonical-host>`
- `CORS_ORIGINS=https://<allowed-origin>[,...]`
- `ACCESS_TOKEN_COOKIE_SECURE=true`
- `GOOGLE_REDIRECT_URI` and `LINKEDIN_REDIRECT_URI` using the same HTTPS host
- `COMPOSE_FILE=docker-compose.yml:docker-compose.production.yml`

Provision the certificate and private key before enabling the ingress. Set
`server_name`, `tls_certificate_path`, and `tls_certificate_key_path` through
inventory or protected extra variables. The setup playbook fails rather than
starting an HTTP-only production site when the hostname or files are missing.

After deployment, verify from an external authorized host:

1. HTTP returns a `308` redirect to the canonical HTTPS origin.
2. HTTPS certificate hostname, chain, and expiry validate without `-k` or any
   disabled verification option.
3. Direct connections to API, Redis, and the internal proxy are unreachable
   from outside the host.
4. A legitimate JSON API request succeeds and an authorized WAF test payload
   is blocked and recorded without request secrets.
5. OAuth callback URLs exactly match the HTTPS provider-dashboard entries and
   authentication cookies carry `Secure` and `HttpOnly`.

Certificate issuance, DNS changes, cloud firewall inspection, provider OAuth
dashboard changes, and an external WAF smoke test remain operator actions and
must not be marked verified without their evidence.
