from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services import avatar_storage


class _Bucket:
    def __init__(self) -> None:
        self.uploaded: list[tuple[str, bytes, dict[str, str]]] = []
        self.removed: list[list[str]] = []
        self.objects: dict[str, bytes] = {}

    def upload(self, path: str, data: bytes, options: dict[str, str]) -> None:
        self.uploaded.append((path, data, options))
        self.objects[path] = data

    def download(self, path: str) -> bytes:
        return self.objects[path]

    def remove(self, paths: list[str]) -> None:
        self.removed.append(paths)
        for path in paths:
            self.objects.pop(path, None)


def test_avatar_paths_are_unique_and_owner_scoped() -> None:
    first = avatar_storage.build_avatar_path("user-a", "png")
    second = avatar_storage.build_avatar_path("user-a", "png")
    assert first != second
    assert first.startswith("user-a/") and first.endswith(".png")
    avatar_storage.assert_avatar_path(first, "user-a")
    with pytest.raises(avatar_storage.AvatarStorageError, match="Forbidden"):
        avatar_storage.assert_avatar_path(first, "user-b")
    with pytest.raises(avatar_storage.AvatarStorageError, match="Forbidden"):
        avatar_storage.assert_avatar_path("user-a/../user-b/photo.png", "user-a")


def test_avatar_storage_round_trip_uses_private_bucket(monkeypatch: pytest.MonkeyPatch) -> None:
    bucket = _Bucket()
    storage = SimpleNamespace(from_=lambda name: bucket if name == "user-avatars" else None)
    monkeypatch.setattr(avatar_storage, "_client", lambda: SimpleNamespace(storage=storage))
    path = avatar_storage.build_avatar_path("user-a", "webp")

    avatar_storage.upload_avatar(path, b"image-bytes", "image/webp")
    assert avatar_storage.download_avatar(path) == b"image-bytes"
    assert bucket.uploaded[0][2] == {"content-type": "image/webp", "upsert": "false"}

    avatar_storage.delete_avatar(path)
    assert bucket.removed == [[path]]
