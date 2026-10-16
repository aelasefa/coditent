# Deployment trust configuration

The deployment workflow accepts only an immutable 40-character commit SHA from
the CI run, requires a pre-provisioned SSH host key, and verifies the public
readiness endpoint over certificate-validated HTTPS.

Configure these GitHub Actions secrets without placing their values in the
repository:

- `EC2_SSH_KEY`: least-privilege deployment user's private key.
- `EC2_SSH_KNOWN_HOSTS`: reviewed `known_hosts` line for `EC2_HOST`, obtained
  through an authenticated infrastructure channel rather than during the job.
- `EC2_HOST`: hostname represented by that host-key entry.
- `EC2_USER`: non-root deployment account permitted to manage only Coditent.
- `PUBLIC_BASE_URL`: canonical `https://` origin with a publicly trusted or
  otherwise runner-trusted certificate.

Before enabling CD, compare the host-key fingerprint with the cloud console or
infrastructure inventory through a separate authenticated channel. Rotating a
host key requires reviewing the infrastructure event and updating
`EC2_SSH_KNOWN_HOSTS`; never fall back to `StrictHostKeyChecking=no` or an
in-job `ssh-keyscan`.

The server helper receives `${{ github.sha }}`, verifies that it is an ancestor
of the configured remote branch, checks out that exact revision detached, and
confirms `HEAD` before building. A branch name, abbreviated SHA, or a commit not
reachable from the deployment branch fails closed.

## Authentication revocation proof

Migration `ae1b2c3d4e5f` makes PostgreSQL authoritative for revoked access
sessions and remembered-device credentials. Redis remains a fast rejection
cache; an empty or restarting Redis instance cannot reactivate a logged-out
credential. Expired revocations are removed opportunistically during later
logout operations.

WebSocket tickets capture the access credential's `auth_version`. Ticket
consumption compares it with the current account, and each open friend or
recruitment socket repeats the comparison before delivery, sending, and during
heartbeats. Password recovery, password changes, email changes, MFA changes,
and administrative security changes increment the account version. Enabling
MFA replaces the current browser's access cookie with a new-version credential
while invalidating every older HTTP credential, unused socket ticket, and open
socket.

Run `scripts/prove-auth-revocation.py` against an isolated deployment. It opens
a friend WebSocket and creates a second unused ticket, changes the account
password, and verifies close code `4403` for the open socket, close code `4401`
for the stale ticket, and HTTP `401` for the old bearer token. It then logs in,
logs out, flushes Redis completely, and verifies that the logged-out bearer
token still receives HTTP `401` from the PostgreSQL revocation record.

The verified run on 2026-10-15 used run ID `73b08bceb2fd`; every proof field
was `true`. The related automated suites completed with `58 passed`, followed
by `20 passed` after the final durable remembered-device extension.
