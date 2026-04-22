from datetime import datetime, timedelta, timezone

from jose import ExpiredSignatureError, JWTError, jwt

from app.config import settings


def create_access_token(data: dict) -> str:
    """Create a JWT access token with configurable expiration."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def verify_token(token: str) -> dict:
    """Verify and decode a JWT token, raising ValueError on failure."""
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except ExpiredSignatureError as exc:
        raise ValueError("Token expired") from exc
    except JWTError as exc:
        raise ValueError("Invalid token") from exc
