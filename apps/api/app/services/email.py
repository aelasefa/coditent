import json
from urllib import error, request

from app.config import settings

RESEND_SEND_EMAIL_URL = "https://api.resend.com/emails"


def send_email(to_email: str, subject: str, html: str) -> dict:
    """Send an email through Resend API using backend secret key from env."""
    if not settings.resend_api_key:
        raise RuntimeError("RESEND_API_KEY must be set in environment variables.")

    from_email = settings.resend_from_email or "onboarding@resend.dev"
    payload = {
        "from": from_email,
        "to": [to_email],
        "subject": subject,
        "html": html,
    }

    req = request.Request(
        RESEND_SEND_EMAIL_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {settings.resend_api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=15) as response:
            body = response.read().decode("utf-8")
            return json.loads(body) if body else {"status": "queued"}
    except error.HTTPError as exc:
        details = exc.read().decode("utf-8") if exc.fp else exc.reason
        raise RuntimeError(f"Resend API error: {details}") from exc
