from __future__ import annotations

import secrets

from fastapi import Response

from app.config import settings


_OAUTH_BROWSER_COOKIE_SAMESITE = "none"
_LEGACY_OAUTH_BROWSER_COOKIE_PATHS = ("/api-proxy/auth/sso", "/auth/sso")


def _delete_oauth_browser_cookie(response: Response, path: str) -> None:
    response.delete_cookie(
        key=settings.oauth_browser_cookie_name,
        path=path,
        secure=settings.access_token_cookie_secure,
        httponly=True,
        samesite=_OAUTH_BROWSER_COOKIE_SAMESITE,
    )


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
    # Remove cookies created by older deployments. Multiple cookies with the same
    # name but different paths can make callback binding depend on header order.
    for path in _LEGACY_OAUTH_BROWSER_COOKIE_PATHS:
        if path != settings.oauth_browser_cookie_path:
            _delete_oauth_browser_cookie(response, path)
    response.set_cookie(
        key=settings.oauth_browser_cookie_name,
        value=browser_id,
        httponly=True,
        secure=settings.access_token_cookie_secure,
        # The OAuth callback is a top-level navigation from Google's site.
        # Explicit None keeps the browser-binding cookie available in popup
        # flows; Secure is required by browsers for SameSite=None.
        samesite=_OAUTH_BROWSER_COOKIE_SAMESITE,
        max_age=10 * 60,
        path=settings.oauth_browser_cookie_path,
    )


def clear_oauth_browser_cookie(response: Response) -> None:
    for path in dict.fromkeys(
        (settings.oauth_browser_cookie_path, *_LEGACY_OAUTH_BROWSER_COOKIE_PATHS)
    ):
        _delete_oauth_browser_cookie(response, path)


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
