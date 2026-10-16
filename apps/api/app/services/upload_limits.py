"""Bounded helpers for multipart uploads.

Starlette's ``UploadFile`` may spool data to disk, but calling ``read()``
without a size still copies the entire request into application memory.  Keep
the limit enforcement here so every upload route uses the same MAX+1-style
behaviour and never accumulates bytes beyond its declared cap.
"""
from __future__ import annotations

from typing import Protocol


DEFAULT_UPLOAD_CHUNK_BYTES = 64 * 1024


class AsyncReadableUpload(Protocol):
    async def read(self, size: int = -1) -> bytes: ...


class UploadTooLargeError(ValueError):
    """Raised as soon as an upload crosses its route-specific byte limit."""


async def read_upload_limited(
    upload: AsyncReadableUpload,
    max_bytes: int,
    *,
    chunk_bytes: int = DEFAULT_UPLOAD_CHUNK_BYTES,
) -> bytes:
    if max_bytes < 1 or chunk_bytes < 1:
        raise ValueError("Upload limits must be positive")

    chunks: list[bytes] = []
    total = 0
    while True:
        # Once close to the cap, read only enough to establish that the
        # request crossed it. This bounds peak application memory to MAX+1
        # rather than MAX plus an entire final chunk.
        read_size = min(chunk_bytes, max_bytes - total + 1)
        chunk = await upload.read(read_size)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            # Do not retain the chunk that crossed the limit.
            raise UploadTooLargeError("Upload exceeds the maximum allowed size")
        chunks.append(chunk)
    return b"".join(chunks)
