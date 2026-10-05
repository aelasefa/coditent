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
