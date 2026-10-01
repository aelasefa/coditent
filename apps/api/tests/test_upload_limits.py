import pytest

from app.services.upload_limits import UploadTooLargeError, read_upload_limited


class _Upload:
    def __init__(self, data: bytes) -> None:
        self.data = data
        self.offset = 0
        self.read_sizes: list[int] = []

    async def read(self, size: int = -1) -> bytes:
        self.read_sizes.append(size)
        if self.offset >= len(self.data):
            return b""
        end = len(self.data) if size < 0 else min(len(self.data), self.offset + size)
        chunk = self.data[self.offset:end]
        self.offset = end
        return chunk


@pytest.mark.asyncio
async def test_bounded_upload_reads_in_chunks() -> None:
    upload = _Upload(b"a" * 10_000)
    result = await read_upload_limited(upload, 10_000, chunk_bytes=1024)
    assert result == b"a" * 10_000
    assert upload.read_sizes
    assert all(0 < size <= 1024 for size in upload.read_sizes)
    assert upload.read_sizes[-1] == 1


@pytest.mark.asyncio
async def test_bounded_upload_stops_as_soon_as_limit_is_crossed() -> None:
    upload = _Upload(b"a" * 50_000)
    with pytest.raises(UploadTooLargeError):
        await read_upload_limited(upload, 4_096, chunk_bytes=1024)
    assert upload.offset == 4_097
    assert upload.offset < len(upload.data)
