from __future__ import annotations

import logging
import re
import time
from collections.abc import Mapping
from typing import Any, Callable

import structlog
from fastapi import Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

from app.config import settings

REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "path", "status_code"],
)
REQUEST_LATENCY = Histogram(
    "http_request_latency_seconds",
    "HTTP request latency in seconds",
    ["method", "path"],
)

_REDACTED = "[REDACTED]"
_SENSITIVE_KEY_PARTS = {
    "authorization",
    "cookie",
    "credential",
    "cv_text",
    "email",
    "invite",
    "otp",
    "password",
    "secret",
    "session",
    "token",
}
_EMAIL_RE = re.compile(r"(?<![\w.+-])[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}(?![\w.-])")
_JWT_RE = re.compile(r"(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")
_BEARER_RE = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]+")
_CONNECTION_PASSWORD_RE = re.compile(r"(?i)([a-z][a-z0-9+.-]*://[^:/\s]+:)[^@/\s]+(@)")
_SENSITIVE_ASSIGNMENT_RE = re.compile(
    r"(?i)(\b(?:access_token|refresh_token|id_token|invite_token|otp|password|secret|api[_-]?key)\b"
    r"(?:%3[dD]|\s*[:=]\s*))([^&\s,;]+)"
)
_QUERY_SECRET_RE = re.compile(
    r"(?i)([?&](?:token|code|otp|password|secret|api[_-]?key)=)([^&#\s]+)"
)


def _is_sensitive_key(key: object) -> bool:
    normalized = re.sub(r"[^a-z0-9]+", "_", str(key).lower()).strip("_")
    return any(part in normalized for part in _SENSITIVE_KEY_PARTS)


def redact_text(value: str) -> str:
    """Remove common credentials and personal identifiers from free-form text."""
    value = _BEARER_RE.sub("Bearer [REDACTED]", value)
    value = _JWT_RE.sub("[REDACTED_JWT]", value)
    value = _CONNECTION_PASSWORD_RE.sub(r"\1[REDACTED]\2", value)
    value = _SENSITIVE_ASSIGNMENT_RE.sub(r"\1[REDACTED]", value)
    value = _QUERY_SECRET_RE.sub(r"\1[REDACTED]", value)
    return _EMAIL_RE.sub("[REDACTED_EMAIL]", value)


def redact_value(value: Any, *, key: object | None = None) -> Any:
    """Recursively redact structured log values without mutating caller data."""
    if key is not None and _is_sensitive_key(key):
        return _REDACTED
    if isinstance(value, Mapping):
        return {str(child_key): redact_value(child, key=child_key) for child_key, child in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [redact_value(child) for child in value]
    if isinstance(value, BaseException):
        return redact_text(str(value))
    if isinstance(value, str):
        return redact_text(value)
    return value


def redact_event(
    _logger: object,
    _method_name: str,
    event_dict: dict[str, Any],
) -> dict[str, Any]:
    """Structlog processor applied last before serialization."""
    return {
        str(key): redact_value(value, key=None if key == "event" else key)
        for key, value in event_dict.items()
    }


class _RedactingFilter(logging.Filter):
    """Protect ordinary stdlib logs that do not pass through structlog."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = redact_text(record.msg)
        if isinstance(record.args, Mapping):
            record.args = redact_value(record.args)
        elif isinstance(record.args, tuple):
            record.args = tuple(redact_value(value) for value in record.args)
        return True


def configure_logging() -> None:
    logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))
    redacting_filter = _RedactingFilter()
    root_logger = logging.getLogger()
    for handler in root_logger.handlers:
        if not any(isinstance(existing, _RedactingFilter) for existing in handler.filters):
            handler.addFilter(redacting_filter)

    # Uvicorn's default access log includes the raw query string. Request
    # telemetry is emitted below using only the bounded route template.
    logging.getLogger("uvicorn.access").disabled = True

    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.add_log_level,
            redact_event,
            structlog.processors.JSONRenderer(),
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)


def route_label(request: Request) -> str:
    """Return a bounded route-template label, never a user-controlled raw path."""
    route = request.scope.get("route")
    path = getattr(route, "path", None)
    if isinstance(path, str) and path.startswith("/"):
        return path
    return "<unmatched>"


def _method_label(method: str) -> str:
    normalized = method.upper()
    return normalized if normalized in {"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"} else "OTHER"


async def record_request_metrics(request: Request, call_next: Callable) -> Response:
    start_time = time.perf_counter()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        return response
    finally:
        elapsed = time.perf_counter() - start_time
        method = _method_label(request.method)
        path = route_label(request)
        REQUEST_LATENCY.labels(method, path).observe(elapsed)
        REQUEST_COUNT.labels(method, path, str(status_code)).inc()
        get_logger("http").info(
            "http_request",
            method=method,
            route=path,
            status_code=status_code,
            duration_ms=round(elapsed * 1000, 2),
        )


def render_metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
