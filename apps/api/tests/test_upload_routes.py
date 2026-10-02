from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.routers import candidates, companies
from app.services.cv_parser import MAX_CV_BYTES, NoExtractableTextError
from app.services.company_logo import MAX_LOGO_BYTES


class _Upload:
    def __init__(self, data: bytes, *, filename: str, content_type: str) -> None:
        self._data = data
        self._offset = 0
        self.filename = filename
        self.content_type = content_type
        self.closed = False

    async def read(self, size: int = -1) -> bytes:
        if self._offset >= len(self._data):
            return b""
        end = len(self._data) if size < 0 else min(len(self._data), self._offset + size)
        chunk = self._data[self._offset:end]
        self._offset = end
        return chunk

    async def close(self) -> None:
        self.closed = True


@pytest.mark.asyncio
async def test_candidate_upload_returns_413_before_db_or_storage() -> None:
    upload = _Upload(
        b"x" * (MAX_CV_BYTES + 1),
        filename="large.pdf",
        content_type="application/pdf",
    )
    with pytest.raises(HTTPException) as caught:
        await candidates.upload_candidate_cv(
            upload, SimpleNamespace(id=uuid4()), SimpleNamespace()
        )
    assert caught.value.status_code == 413
    assert upload.closed is True


@pytest.mark.asyncio
async def test_candidate_upload_rejects_spoofed_pdf_before_db_or_storage() -> None:
    upload = _Upload(
        b"this is not a pdf",
        filename="spoofed.pdf",
        content_type="application/pdf",
    )
    with pytest.raises(HTTPException) as caught:
        await candidates.upload_candidate_cv(
            upload, SimpleNamespace(id=uuid4()), SimpleNamespace()
        )
    assert caught.value.status_code == 400
    assert "Invalid PDF" in str(caught.value.detail)


@pytest.mark.asyncio
async def test_logo_upload_returns_413_before_db_or_storage() -> None:
    company_id = uuid4()
    upload = _Upload(
        b"x" * (MAX_LOGO_BYTES + 1),
        filename="large.png",
        content_type="image/png",
    )
    user = SimpleNamespace(id=uuid4(), company_id=company_id, company_role="OWNER")
    with pytest.raises(HTTPException) as caught:
        await companies.upload_company_logo(company_id, upload, user, SimpleNamespace())
    assert caught.value.status_code == 413
    assert upload.closed is True


@pytest.mark.asyncio
async def test_logo_upload_rejects_spoofed_png_before_db_or_storage() -> None:
    company_id = uuid4()
    upload = _Upload(
        b"this is not a png",
        filename="spoofed.png",
        content_type="image/png",
    )
    user = SimpleNamespace(id=uuid4(), company_id=company_id, company_role="OWNER")
    with pytest.raises(HTTPException) as caught:
        await companies.upload_company_logo(company_id, upload, user, SimpleNamespace())
    assert caught.value.status_code == 400
    assert "Invalid PNG" in str(caught.value.detail)


@pytest.mark.asyncio
async def test_no_text_cv_route_returns_documented_422(monkeypatch) -> None:
    user_id = uuid4()
    asset_id = uuid4()
    profile = SimpleNamespace(
        user_id=user_id,
        current_cv_asset_id=asset_id,
        cv_url=f"{user_id}/blank.pdf",
    )
    asset = SimpleNamespace(
        id=asset_id,
        owner_id=user_id,
        storage_path=profile.cv_url,
        original_filename="blank.pdf",
        content_type="application/pdf",
    )

    async def fake_profile(_db, _user_id):
        return profile

    async def fake_current_asset(_db, _profile, _owner_id):
        return asset

    async def no_text(_filename: str, _data: bytes):
        raise NoExtractableTextError("No extractable text found")

    monkeypatch.setattr(candidates, "_get_profile", fake_profile)
    monkeypatch.setattr(candidates, "get_current_cv_asset", fake_current_asset)
    monkeypatch.setattr(candidates, "download_cv", lambda _path: b"%PDF-1.7")
    monkeypatch.setattr(candidates, "extract_text_with_meta_async", no_text)

    with pytest.raises(HTTPException) as caught:
        await candidates.parse_candidate_cv(
            SimpleNamespace(id=user_id), SimpleNamespace()
        )
    assert caught.value.status_code == 422
    assert caught.value.detail == {
        "code": "CV_NO_TEXT",
        "message": "No extractable text found",
    }
