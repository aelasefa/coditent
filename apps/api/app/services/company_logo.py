"""Company logo validation + Supabase Storage wrapper.

Reuses the candidate-CV storage architecture (``app.db.get_supabase_client``,
private bucket, ``{owner_id}/{uuid}.{ext}`` paths, DB stores path only).
Bucket is separate so CV retention policies never touch company branding.
"""
from __future__ import annotations

import uuid

from app.db import get_supabase_client
from app.observability import get_logger

BUCKET = "company-logos"

# Reasonable cap for a small logo: 2 MB.
MAX_LOGO_BYTES = 2 * 1024 * 1024

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}

ALLOWED_CONTENT_TYPES = {
    "image/png",
    "image/jpeg",
    "image/webp",
}

CONTENT_TYPE_BY_EXT = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
}

logger = get_logger("company_logo")


class LogoStorageError(RuntimeError):
    pass


def _client():
    try:
        return get_supabase_client()
    except RuntimeError as exc:
        raise LogoStorageError("Logo storage not configured") from exc


def validate_logo_file(filename: str | None, content_type: str | None, size: int) -> str:
    """Validate an uploaded logo. Return normalized extension or raise ValueError."""
    if not filename or "." not in filename:
        raise ValueError("Logo must be a PNG, JPG, or WebP image")
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError("Invalid file type. Only PNG, JPG, and WebP are supported")
    if content_type and content_type not in ALLOWED_CONTENT_TYPES and content_type != "application/octet-stream":
        raise ValueError("Invalid file type. Only PNG, JPG, and WebP are supported")
    if size <= 0:
        raise ValueError("Empty file")
    if size > MAX_LOGO_BYTES:
        raise ValueError("File too large. Maximum size is 2MB")
    return ext


def check_logo_magic_bytes(data: bytes, ext: str) -> None:
    """Reject files whose content does not match their extension."""
    normalized = ext.lower()
    if normalized == "png":
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError("Invalid PNG file")
        return
    if normalized in ("jpg", "jpeg"):
        if not data.startswith(b"\xff\xd8\xff"):
            raise ValueError("Invalid JPEG file")
        return
    if normalized == "webp":
        if not (data.startswith(b"RIFF") and len(data) >= 12 and data[8:12] == b"WEBP"):
            raise ValueError("Invalid WebP file")
        return
    raise ValueError("Invalid file type. Only PNG, JPG, and WebP are supported")


def build_logo_path(company_id: str, ext: str) -> str:
    """Randomized unique path scoped to the owning company."""
    return f"{company_id}/{uuid.uuid4().hex}.{ext.lower()}"


def _storage_error(exc: Exception, action: str) -> LogoStorageError:
    msg = str(exc)
    if "403" in msg or "Unauthorized" in msg or "JWS" in msg:
        return LogoStorageError("Logo storage not configured or bucket missing")
    if "404" in msg or "not found" in msg.lower():
        if action == "upload":
            # Uploads only 404 when the bucket itself is missing.
            return LogoStorageError("Logo storage not configured or bucket missing")
        return LogoStorageError("Logo not found")
    return LogoStorageError(f"Logo {action} failed")


def upload_logo(path: str, data: bytes, content_type: str) -> None:
    client = _client()
    try:
        client.storage.from_(BUCKET).upload(
            path, data, {"content-type": content_type, "upsert": "true"}
        )
    except Exception as exc:
        logger.error("logo_upload_failed", path_prefix=path.split("/")[0])
        raise _storage_error(exc, "upload") from exc


def download_logo(path: str) -> bytes:
    client = _client()
    try:
        result = client.storage.from_(BUCKET).download(path)
    except Exception as exc:
        raise _storage_error(exc, "download") from exc
    if isinstance(result, bytes):
        return result
    if isinstance(result, dict) and isinstance(result.get("data"), bytes):
        return result["data"]
    raise LogoStorageError("Logo download failed")


def delete_logo(path: str) -> None:
    client = _client()
    try:
        client.storage.from_(BUCKET).remove([path])
    except Exception as exc:
        logger.error("logo_delete_failed", path_prefix=path.split("/")[0])
        raise LogoStorageError("Logo delete failed") from exc


def assert_company_logo_path(path: str, company_id: str) -> None:
    """Scope check: a logo path must live under its owning company prefix."""
    if not path.startswith(f"{company_id}/"):
        raise LogoStorageError("Forbidden")
