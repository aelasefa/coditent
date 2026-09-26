import json
import html as html_module
import re
from email.utils import formataddr
from urllib import error, request

from app.config import settings

RESEND_SEND_EMAIL_URL = "https://api.resend.com/emails"


def _plain_text(html_content: str) -> str:
    """Build a readable multipart alternative for mailbox and spam filters."""
    text = re.sub(r"<\s*br\s*/?>", "\n", html_content, flags=re.IGNORECASE)
    text = re.sub(r"</(p|div|h[1-6]|li)\s*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = html_module.unescape(text)
    return "\n".join(line.strip() for line in text.splitlines() if line.strip())


def send_email(
    to_email: str,
    subject: str,
    html: str,
    text: str | None = None,
    attachments: list[dict[str, str]] | None = None,
) -> dict:
    """Send an email through Resend API using backend secret key from env."""
    if not settings.resend_api_key:
        raise RuntimeError("RESEND_API_KEY must be set in environment variables.")

    from_email = settings.resend_from_email or "onboarding@resend.dev"
    sender = formataddr((settings.resend_from_name, from_email))
    payload = {
        "from": sender,
        "to": [to_email],
        "subject": subject,
        "html": html,
        "text": text or _plain_text(html),
    }
    if attachments:
        payload["attachments"] = attachments

    req = request.Request(
        RESEND_SEND_EMAIL_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {settings.resend_api_key}",
            "Content-Type": "application/json",
            # Resend sits behind bot protection that blocks default
            # library user-agents (HTTP 403 error 1010). Identify the app.
            "User-Agent": "CODITENT/1.0",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=15) as response:
            body = response.read().decode("utf-8")
            return json.loads(body) if body else {"status": "queued"}
    except error.HTTPError as exc:
        # Never include the API key: only status + provider message reach logs.
        raw = exc.read().decode("utf-8") if exc.fp else str(exc.reason)
        raise RuntimeError(f"Resend API error {exc.code}: {raw[:300]}") from exc
