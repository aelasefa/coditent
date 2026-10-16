"""Private, owner-scoped storage for uploaded profile avatars."""

from __future__ import annotations

import uuid

from app.db import get_supabase_client
from app.observability import get_logger


BUCKET = "user-avatars"
logger = get_logger("avatar_storage")


class AvatarStorageError(RuntimeError):
    pass


def _client():
    try:
        return get_supabase_client()
    except RuntimeError as exc:
        raise AvatarStorageError("Avatar storage not configured") from exc


def build_avatar_path(user_id: str, ext: str) -> str:
    return f"{user_id}/{uuid.uuid4().hex}.{ext.lower()}"


def assert_avatar_path(path: str, user_id: str) -> None:
    normalized = path.replace("\\", "/")
    parts = normalized.split("/")
    if (
        normalized != path
        or len(parts) != 2
        or parts[0] != user_id
        or any(part in {"", ".", ".."} for part in parts)
        or any(ord(character) < 32 or ord(character) == 127 for character in path)
    ):
        raise AvatarStorageError("Forbidden")


def _storage_error(exc: Exception, action: str) -> AvatarStorageError:
    message = str(exc).lower()
    if "403" in message or "unauthorized" in message or "jws" in message:
        return AvatarStorageError("Avatar storage not configured or bucket missing")
    if "404" in message or "not found" in message:
        return AvatarStorageError("Avatar not found")
    return AvatarStorageError(f"Avatar {action} failed")


def upload_avatar(path: str, data: bytes, content_type: str) -> None:
    try:
        _client().storage.from_(BUCKET).upload(
            path, data, {"content-type": content_type, "upsert": "false"}
        )
    except Exception as exc:
        logger.warning("avatar_upload_failed", owner_id=path.split("/", 1)[0])
        raise _storage_error(exc, "upload") from exc


def download_avatar(path: str) -> bytes:
    try:
        result = _client().storage.from_(BUCKET).download(path)
    except Exception as exc:
        raise _storage_error(exc, "download") from exc
    if isinstance(result, bytes):
        return result
    if isinstance(result, dict) and isinstance(result.get("data"), bytes):
        return result["data"]
    raise AvatarStorageError("Avatar download failed")


def delete_avatar(path: str) -> None:
    try:
        _client().storage.from_(BUCKET).remove([path])
    except Exception as exc:
        logger.warning("avatar_delete_failed", owner_id=path.split("/", 1)[0])
        raise _storage_error(exc, "delete") from exc
