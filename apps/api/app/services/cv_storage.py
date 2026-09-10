"""Supabase Storage wrapper for candidate CVs. Keys server-side only."""
from __future__ import annotations

import uuid

from app.db import get_supabase_client
from app.observability import get_logger

BUCKET = "candidate-cvs"
logger = get_logger("cv_storage")


class CVStorageError(RuntimeError):
    pass


def _client():
    try:
        return get_supabase_client()
    except RuntimeError as exc:
        raise CVStorageError("CV storage not configured") from exc


def build_path(user_id: str, ext: str) -> str:
    return f"{user_id}/{uuid.uuid4().hex}.{ext}"


def _storage_error(exc: Exception, action: str) -> CVStorageError:
    msg = str(exc)
    if "403" in msg or "Unauthorized" in msg or "JWS" in msg:
        return CVStorageError("CV storage not configured or bucket missing")
    if "404" in msg or "not found" in msg.lower():
        return CVStorageError("CV not found")
    return CVStorageError(f"CV {action} failed")


def upload_cv(path: str, data: bytes, content_type: str) -> None:
    client = _client()
    try:
        client.storage.from_(BUCKET).upload(
            path, data, {"content-type": content_type, "upsert": "true"}
        )
    except Exception as exc:
        logger.error("cv_upload_failed", path_prefix=path.split("/")[0])
        raise _storage_error(exc, "upload") from exc


def download_cv(path: str) -> bytes:
    client = _client()
    try:
        result = client.storage.from_(BUCKET).download(path)
    except Exception as exc:
        raise _storage_error(exc, "download") from exc
    if isinstance(result, bytes):
        return result
    if isinstance(result, dict) and isinstance(result.get("data"), bytes):
        return result["data"]
    raise CVStorageError("CV download failed")


def delete_cv(path: str) -> None:
    client = _client()
    try:
        client.storage.from_(BUCKET).remove([path])
    except Exception as exc:
        logger.error("cv_delete_failed", path_prefix=path.split("/")[0])
        raise CVStorageError("CV delete failed") from exc


def assert_owns_path(path: str, user_id: str) -> None:
    if not path.startswith(f"{user_id}/"):
        raise CVStorageError("Forbidden")
