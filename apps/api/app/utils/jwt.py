from datetime import datetime, timedelta, timezone
from typing import Final
from uuid import UUID, uuid4

from jose import ExpiredSignatureError, JWTError, jwt

from app.config import settings


ACCESS_TOKEN_PURPOSE: Final = "access"
MFA_TOKEN_PURPOSE: Final = "mfa_pending"
TRUSTED_DEVICE_PURPOSE: Final = "trusted_device"
SUPPORTED_TOKEN_PURPOSES: Final = frozenset(
    {ACCESS_TOKEN_PURPOSE, MFA_TOKEN_PURPOSE, TRUSTED_DEVICE_PURPOSE}
)


def _new_token(
    *,
    subject: str,
    purpose: str,
    expires_delta: timedelta,
    claims: dict | None = None,
) -> str:
    """Create a purpose-bound JWT with the claims every credential must carry."""
    if purpose not in SUPPORTED_TOKEN_PURPOSES:
        raise ValueError("Unsupported token purpose")
    try:
        normalized_subject = str(UUID(str(subject)))
    except (TypeError, ValueError, AttributeError) as exc:
        raise ValueError("Invalid token subject") from exc

    supplied = dict(claims or {})
    reserved = {"sub", "purpose", "type", "exp", "iat", "nbf", "jti", "sid"}
    if reserved.intersection(supplied):
        raise ValueError("Reserved token claim supplied")

    now = datetime.now(timezone.utc)
    token_id = str(uuid4())
    payload = {
        **supplied,
        "sub": normalized_subject,
        "purpose": purpose,
        "jti": token_id,
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
    }
    if purpose == ACCESS_TOKEN_PURPOSE:
        # A distinct session identifier makes the credential revocable without
        # overloading the token id or accepting another credential purpose.
        payload["sid"] = str(uuid4())
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Create an access-only JWT with a unique, revocable session id."""
    claims = dict(data)
    subject = claims.pop("sub", None)
    claims.setdefault("auth_version", 0)
    return _new_token(
        subject=str(subject or ""),
        purpose=ACCESS_TOKEN_PURPOSE,
        expires_delta=expires_delta or timedelta(minutes=settings.access_token_expire_minutes),
        claims=claims,
    )


def create_mfa_token(
    subject: str,
    *,
    auth_version: int = 0,
    expires_delta: timedelta = timedelta(minutes=5),
) -> str:
    return _new_token(
        subject=subject,
        purpose=MFA_TOKEN_PURPOSE,
        expires_delta=expires_delta,
        claims={"auth_version": auth_version},
    )


def create_trusted_device_token(
    subject: str,
    *,
    factor: str,
    expires_delta: timedelta,
    auth_version: int = 0,
) -> str:
    return _new_token(
        subject=subject,
        purpose=TRUSTED_DEVICE_PURPOSE,
        expires_delta=expires_delta,
        claims={"factor": factor, "auth_version": auth_version},
    )


def verify_token(token: str, *, expected_purpose: str | None = None) -> dict:
    """Verify signature, lifetime, subject, id, and credential purpose."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except ExpiredSignatureError as exc:
        raise ValueError("Token expired") from exc
    except JWTError as exc:
        raise ValueError("Invalid token") from exc

    purpose = payload.get("purpose")
    if purpose not in SUPPORTED_TOKEN_PURPOSES:
        raise ValueError("Invalid token purpose")
    if expected_purpose is not None and purpose != expected_purpose:
        raise ValueError("Invalid token purpose")

    try:
        UUID(str(payload.get("sub") or ""))
        UUID(str(payload.get("jti") or ""))
        issued_at = payload["iat"]
        not_before = payload["nbf"]
        expires_at = payload["exp"]
        numeric_dates = (issued_at, not_before, expires_at)
        if any(
            isinstance(value, bool) or not isinstance(value, (int, float))
            for value in numeric_dates
        ):
            raise ValueError
        if issued_at > datetime.now(timezone.utc).timestamp() + 30:
            raise ValueError
    except (KeyError, TypeError, ValueError, AttributeError) as exc:
        raise ValueError("Invalid token claims") from exc

    if purpose == ACCESS_TOKEN_PURPOSE:
        try:
            UUID(str(payload.get("sid") or ""))
        except (TypeError, ValueError, AttributeError) as exc:
            raise ValueError("Invalid access session") from exc
    elif "sid" in payload:
        raise ValueError("Invalid token claims")

    auth_version = payload.get("auth_version")
    if isinstance(auth_version, bool) or not isinstance(auth_version, int) or auth_version < 0:
        raise ValueError("Invalid account version")

    return payload


def verify_access_token(token: str) -> dict:
    return verify_token(token, expected_purpose=ACCESS_TOKEN_PURPOSE)


def verify_mfa_token(token: str) -> dict:
    return verify_token(token, expected_purpose=MFA_TOKEN_PURPOSE)


def verify_trusted_device_token(token: str) -> dict:
    return verify_token(token, expected_purpose=TRUSTED_DEVICE_PURPOSE)
