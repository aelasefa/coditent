from types import SimpleNamespace

import httpx
import pytest
from storage3.exceptions import StorageApiError

from app.services import cv_storage
from app.services.cv_storage import (
    CVStorageNotFoundError,
    CVStorageUnavailableError,
)


class _Storage:
    def __init__(self, bucket) -> None:
        self.bucket = bucket

    def from_(self, _name: str):
        return self.bucket


def _client(bucket):
    return SimpleNamespace(storage=_Storage(bucket))


def test_download_retries_transport_errors_with_bounded_backoff(monkeypatch) -> None:
    class Bucket:
        calls = 0

        def download(self, _path: str) -> bytes:
            self.calls += 1
            if self.calls < 3:
                raise httpx.ConnectError("TLS connection failed")
            return b"cv-data"

    bucket = Bucket()
    delays: list[float] = []
    monkeypatch.setattr(cv_storage, "_client", lambda: _client(bucket))
    monkeypatch.setattr(cv_storage.time, "sleep", delays.append)

    assert cv_storage.download_cv("private/object.pdf") == b"cv-data"
    assert bucket.calls == 3
    assert delays == [0.2, 0.5]


def test_download_maps_confirmed_missing_object_without_retry(monkeypatch) -> None:
    class Bucket:
        calls = 0

        def download(self, _path: str) -> bytes:
            self.calls += 1
            raise StorageApiError("Object not found", "NoSuchKey", 404)

    bucket = Bucket()
    monkeypatch.setattr(cv_storage, "_client", lambda: _client(bucket))

    with pytest.raises(CVStorageNotFoundError):
        cv_storage.download_cv("private/missing.pdf")
    assert bucket.calls == 1


def test_download_maps_exhausted_transport_error_to_unavailable(monkeypatch) -> None:
    class Bucket:
        calls = 0

        def download(self, _path: str) -> bytes:
            self.calls += 1
            raise httpx.ReadTimeout("storage timed out")

    bucket = Bucket()
    monkeypatch.setattr(cv_storage, "_client", lambda: _client(bucket))
    monkeypatch.setattr(cv_storage.time, "sleep", lambda _delay: None)

    with pytest.raises(CVStorageUnavailableError):
        cv_storage.download_cv("private/object.pdf")
    assert bucket.calls == 3


def test_upload_retry_is_safe_because_upsert_is_enabled(monkeypatch) -> None:
    class Bucket:
        calls = 0
        options = None

        def upload(self, _path: str, _data: bytes, options: dict[str, str]) -> None:
            self.calls += 1
            self.options = options
            if self.calls == 1:
                raise httpx.ConnectError("connection reset")

    bucket = Bucket()
    monkeypatch.setattr(cv_storage, "_client", lambda: _client(bucket))
    monkeypatch.setattr(cv_storage.time, "sleep", lambda _delay: None)

    cv_storage.upload_cv("private/object.pdf", b"cv-data", "application/pdf")

    assert bucket.calls == 2
    assert bucket.options == {"content-type": "application/pdf", "upsert": "true"}

