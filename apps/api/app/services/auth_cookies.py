from __future__ import annotations

import secrets

from fastapi import Response

from app.config import settings


def set_access_cookie(response: Response, token: str) -> str:
    """Set the session cookie and a double-submit CSRF token."""
    csrf_token = secrets.token_urlsafe(32)
    response.set_cookie(
        key=settings.access_token_cookie_name,
        value=token,
        httponly=True,
        secure=settings.access_token_cookie_secure,
        samesite=settings.access_token_cookie_samesite,
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )
    response.set_cookie(
        key=settings.csrf_cookie_name,
        value=csrf_token,
        httponly=False,
        secure=settings.access_token_cookie_secure,
        samesite=settings.access_token_cookie_samesite,
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )
    return csrf_token


def set_trusted_device_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.trusted_device_cookie_name,
        value=token,
        httponly=True,
        secure=settings.access_token_cookie_secure,
        samesite=settings.access_token_cookie_samesite,
        max_age=settings.trusted_device_expire_days * 24 * 60 * 60,
        path="/",
    )


def set_oauth_browser_cookie(response: Response, browser_id: str) -> None:
    response.set_cookie(
        key=settings.oauth_browser_cookie_name,
        value=browser_id,
        httponly=True,
        secure=settings.access_token_cookie_secure,
        samesite="lax",
        max_age=10 * 60,
        path="/auth/sso",
    )


def clear_oauth_browser_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.oauth_browser_cookie_name,
        path="/auth/sso",
        secure=settings.access_token_cookie_secure,
        httponly=True,
        samesite="lax",
    )


def clear_auth_cookies(response: Response, *, include_trusted_device: bool = True) -> None:
    for name, httponly in (
        (settings.access_token_cookie_name, True),
        (settings.csrf_cookie_name, False),
    ):
        response.delete_cookie(
            key=name,
            path="/",
            secure=settings.access_token_cookie_secure,
            httponly=httponly,
            samesite=settings.access_token_cookie_samesite,
        )
    if include_trusted_device:
        response.delete_cookie(
            key=settings.trusted_device_cookie_name,
            path="/",
            secure=settings.access_token_cookie_secure,
            httponly=True,
            samesite=settings.access_token_cookie_samesite,
        )
