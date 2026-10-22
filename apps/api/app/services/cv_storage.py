"""Supabase Storage wrapper for candidate CVs. Keys server-side only."""
from __future__ import annotations

import ssl
import time
import uuid
from collections.abc import Callable
from typing import TypeVar

import httpx

from app.db import get_supabase_client
from app.observability import get_logger

BUCKET = "candidate-cvs"
logger = get_logger("cv_storage")


class CVStorageError(RuntimeError):
    pass


class CVStorageNotFoundError(CVStorageError):
    """The storage service confirmed that the requested object is absent."""


class CVStorageUnavailableError(CVStorageError):
    """Storage could not be reached or returned a retryable response."""


_ResultT = TypeVar("_ResultT")
_MAX_ATTEMPTS = 3
_BACKOFF_SECONDS = (0.2, 0.5)
_TRANSIENT_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}


def _client():
    try:
        return get_supabase_client()
    except RuntimeError as exc:
        raise CVStorageError("CV storage not configured") from exc


def build_path(user_id: str, ext: str) -> str:
    return f"{user_id}/{uuid.uuid4().hex}.{ext}"


def _status_code(exc: BaseException) -> int | None:
    status_value = getattr(exc, "status", None)
    if status_value is None:
        response = getattr(exc, "response", None)
        status_value = getattr(response, "status_code", None)
    try:
        return int(status_value) if status_value is not None else None
    except (TypeError, ValueError):
        return None


def _exception_chain(exc: BaseException):
    seen: set[int] = set()
    current: BaseException | None = exc
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        yield current
        current = current.__cause__ or current.__context__


def _is_not_found(exc: Exception) -> bool:
    for current in _exception_chain(exc):
        if _status_code(current) == 404:
            return True
        code = str(getattr(current, "code", "")).lower()
        if code in {"404", "not_found", "nosuchkey", "objectnotfound"}:
            return True
    return False


def _is_transient(exc: Exception) -> bool:
    for current in _exception_chain(exc):
        if isinstance(
            current,
            (httpx.TransportError, ssl.SSLError, ConnectionError, TimeoutError),
        ):
            return True
        if _status_code(current) in _TRANSIENT_STATUS_CODES:
            return True
    return False


def _storage_error(exc: Exception, action: str) -> CVStorageError:
    if _is_not_found(exc):
        return CVStorageNotFoundError("CV not found")
    if _is_transient(exc):
        return CVStorageUnavailableError("CV storage temporarily unavailable")
    return CVStorageError(f"CV {action} failed")


def _storage_call(action: str, operation: Callable[[], _ResultT]) -> _ResultT:
    """Run an idempotent storage call with short, transport-only retries."""
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            return operation()
        except Exception as exc:
            retryable = _is_transient(exc)
            logger.warning(
                f"cv_{action}_failed",
                exception_type=type(exc).__name__,
                attempt=attempt,
                retrying=retryable and attempt < _MAX_ATTEMPTS,
            )
            if not retryable or attempt == _MAX_ATTEMPTS:
                raise _storage_error(exc, action) from exc
            time.sleep(_BACKOFF_SECONDS[attempt - 1])
    raise CVStorageUnavailableError("CV storage temporarily unavailable")


def upload_cv(path: str, data: bytes, content_type: str) -> None:
    client = _client()
    bucket = client.storage.from_(BUCKET)

    def operation() -> None:
        bucket.upload(
            path, data, {"content-type": content_type, "upsert": "true"}
        )

    _storage_call("upload", operation)


def download_cv(path: str) -> bytes:
    client = _client()
    bucket = client.storage.from_(BUCKET)
    result = _storage_call("download", lambda: bucket.download(path))
    if isinstance(result, bytes):
        return result
    if isinstance(result, dict) and isinstance(result.get("data"), bytes):
        return result["data"]
    logger.warning(
        "cv_download_failed",
        exception_type="InvalidStorageResponse",
        attempt=1,
        retrying=False,
    )
    raise CVStorageError("CV download failed")


def delete_cv(path: str) -> None:
    client = _client()
    try:
        client.storage.from_(BUCKET).remove([path])
    except Exception as exc:
        logger.error("cv_delete_failed", exception_type=type(exc).__name__)
        raise CVStorageError("CV delete failed") from exc


def assert_owns_path(path: str, user_id: str) -> None:
    normalized = path.replace("\\", "/")
    parts = normalized.split("/")
    if (
        normalized != path
        or len(parts) < 2
        or parts[0] != user_id
        or any(part in {"", ".", ".."} for part in parts)
        or any(ord(character) < 32 or ord(character) == 127 for character in path)
    ):
        raise CVStorageError("Forbidden")
