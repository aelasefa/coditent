"""Deterministic CV/logo ownership and replacement lifecycle regressions."""
from __future__ import annotations

import sys
import types
import uuid
from collections.abc import AsyncGenerator
from types import SimpleNamespace

import pytest


_config = types.ModuleType("app.config")
_config.settings = SimpleNamespace(
    gemini_api_key="test",
    gemini_model="gemini-3-flash-preview",
    ai_provider_timeout_seconds=30,
    database_url="sqlite://",
    redis_url="redis://localhost:6379/0",
    secret_key="test-secret",
    algorithm="HS256",
    access_token_expire_minutes=60,
    access_token_cookie_name="access_token",
    access_token_cookie_secure=False,
    access_token_cookie_samesite="lax",
)
sys.modules["app.config"] = _config

_observability = types.ModuleType("app.observability")


class _Log:
    def info(self, *_args, **_kwargs): ...
    def error(self, *_args, **_kwargs): ...
    def warning(self, *_args, **_kwargs): ...
    def exception(self, *_args, **_kwargs): ...


_observability.get_logger = lambda _name="test": _Log()
_observability.configure_logging = lambda: None
sys.modules["app.observability"] = _observability

from sqlalchemy.orm import DeclarativeBase  # noqa: E402


# Keep one declarative registry when this module is collected together with
# other isolated service tests. Replacing ``app.database`` after ``app.models``
# has already been imported creates an empty metadata registry and makes table
# setup silently create no tables.
_existing_database = sys.modules.get("app.database")
if _existing_database is not None and hasattr(_existing_database, "Base"):
    _Base = _existing_database.Base
    _database = _existing_database
else:
    class _Base(DeclarativeBase):
        pass

    _database = types.ModuleType("app.database")
    _database.Base = _Base
    _database.engine = None
    _database.AsyncSessionLocal = None


async def _get_db():
    raise RuntimeError("No production database in lifecycle tests")


_database.get_db = _get_db
sys.modules["app.database"] = _database

_storage_db = types.ModuleType("app.db")
_storage_db.get_supabase_client = lambda: (_ for _ in ()).throw(RuntimeError("disabled"))
sys.modules["app.db"] = _storage_db

import pytest_asyncio  # noqa: E402
from fastapi import HTTPException  # noqa: E402
from sqlalchemy import event, select  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.models import (  # noqa: E402
    Application,
    CVAsset,
    CandidateProfile,
    Company,
    Offer,
    OfferType,
    User,
    UserRole,
)
from app.routers import applications, candidates, companies  # noqa: E402
from app.schemas import ApplicationCreate  # noqa: E402
from app.services import cv_assets, cv_storage, screening  # noqa: E402


class _Upload:
    def __init__(self, data: bytes, filename: str, content_type: str) -> None:
        self.data = data
        self.filename = filename
        self.content_type = content_type
        self.offset = 0

    async def read(self, size: int = -1) -> bytes:
        if self.offset >= len(self.data):
            return b""
        end = len(self.data) if size < 0 else min(len(self.data), self.offset + size)
        chunk = self.data[self.offset:end]
        self.offset = end
        return chunk

    async def close(self) -> None:
        return None


@pytest_asyncio.fixture()
async def db() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
    )
    async with engine.begin() as connection:
        await connection.run_sync(_Base.metadata.create_all)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as session:
        yield session
    await engine.dispose()


async def _seed_candidate(
    db: AsyncSession,
) -> tuple[User, CandidateProfile, CVAsset, Offer]:
    candidate = User(
        email=f"candidate-{uuid.uuid4().hex}@test.local",
        password_hash="x",
        role=UserRole.CANDIDATE,
        is_approved=True,
        full_name="Candidate",
    )
    db.add(candidate)
    await db.flush()
    old_asset = CVAsset(
        owner_id=candidate.id,
        version=1,
        storage_path=f"{candidate.id}/old.pdf",
        original_filename="old.pdf",
        content_type="application/pdf",
        size_bytes=100,
    )
    db.add(old_asset)
    await db.flush()
    profile = CandidateProfile(
        user_id=candidate.id,
        current_cv_asset_id=old_asset.id,
        cv_url=old_asset.storage_path,
    )
    offer = Offer(
        recruiter_id=candidate.id,
        title="Engineer",
        company="Acme",
        region="Remote",
        field="Engineering",
        type=OfferType.JOB,
        description="Build things",
        requirements="Python",
        active=True,
    )
    db.add_all([profile, offer])
    await db.commit()
    return candidate, profile, old_asset, offer


async def _no_audit(*_args, **_kwargs) -> None:
    return None


async def _valid_content(*_args, **_kwargs) -> None:
    return None


@pytest.mark.asyncio
async def test_apply_ignores_foreign_key_then_replace_and_delete_retains_snapshot(
    db: AsyncSession,
    monkeypatch,
) -> None:
    candidate, _profile, old_asset, offer = await _seed_candidate(db)
    queued: list[uuid.UUID] = []
    uploaded: list[str] = []
    deleted: list[str] = []
    monkeypatch.setattr(applications, "log_audit", _no_audit)

    async def enqueue_test_job(_db, *, resource_id, **_kwargs):
        queued.append(resource_id)
        return SimpleNamespace(id=uuid.uuid4())

    monkeypatch.setattr(applications, "enqueue_ai_job", enqueue_test_job)
    monkeypatch.setattr(candidates, "validate_cv_content_async", _valid_content)
    monkeypatch.setattr(candidates, "upload_cv", lambda path, *_args: uploaded.append(path))
    monkeypatch.setattr(candidates, "delete_cv", lambda path: deleted.append(path))
    monkeypatch.setattr(cv_assets, "delete_cv", lambda path: deleted.append(path))

    result = await applications.create_application(
        ApplicationCreate(
            opportunity_id=offer.id,
            cv_url=f"{uuid.uuid4()}/foreign.pdf",
        ),
        candidate,
        db,
    )
    application = await db.scalar(
        select(Application).where(Application.id == result.id)
    )
    assert application is not None
    assert application.cv_asset_id == old_asset.id
    assert application.cv_url == old_asset.storage_path
    assert queued == [application.id]

    await candidates.upload_candidate_cv(
        _Upload(b"%PDF-1.7 replacement", "replacement.pdf", "application/pdf"),
        candidate,
        db,
    )
    profile = await db.scalar(
        select(CandidateProfile).where(CandidateProfile.user_id == candidate.id)
    )
    assert profile is not None
    replacement_id = profile.current_cv_asset_id
    assert replacement_id is not None and replacement_id != old_asset.id
    assert deleted == []
    assert await db.get(CVAsset, old_asset.id) is not None

    await candidates.delete_candidate_cv(candidate, db)
    assert await db.get(CVAsset, old_asset.id) is not None
    assert deleted == [uploaded[0]]
    application = await db.get(Application, application.id)
    assert application is not None and application.cv_asset_id == old_asset.id


@pytest.mark.asyncio
async def test_failed_cv_replacement_preserves_previous_asset(
    db: AsyncSession,
    monkeypatch,
) -> None:
    candidate, _profile, old_asset, _offer = await _seed_candidate(db)
    candidate_id = candidate.id
    old_asset_id = old_asset.id
    old_path = old_asset.storage_path
    uploaded: list[str] = []
    deleted: list[str] = []
    monkeypatch.setattr(candidates, "validate_cv_content_async", _valid_content)
    monkeypatch.setattr(candidates, "upload_cv", lambda path, *_args: uploaded.append(path))
    monkeypatch.setattr(candidates, "delete_cv", lambda path: deleted.append(path))

    def fail_commit(_session) -> None:
        raise RuntimeError("database unavailable")

    event.listen(db.sync_session, "before_commit", fail_commit)
    try:
        with pytest.raises(HTTPException) as caught:
            await candidates.upload_candidate_cv(
                _Upload(b"%PDF-1.7 replacement", "replacement.pdf", "application/pdf"),
                candidate,
                db,
            )
    finally:
        event.remove(db.sync_session, "before_commit", fail_commit)

    assert caught.value.status_code == 503
    assert len(uploaded) == 1
    assert deleted == uploaded
    profile = await db.scalar(
        select(CandidateProfile).where(CandidateProfile.user_id == candidate_id)
    )
    assert profile is not None
    assert profile.current_cv_asset_id == old_asset_id
    assert profile.cv_url == old_path
    assert old_path not in deleted


@pytest.mark.asyncio
async def test_failed_logo_reference_commit_preserves_previous_logo(
    db: AsyncSession,
    monkeypatch,
) -> None:
    company = Company(name=f"Company-{uuid.uuid4().hex}", logo_url=None)
    db.add(company)
    await db.flush()
    owner = User(
        email=f"owner-{uuid.uuid4().hex}@test.local",
        password_hash="x",
        role=UserRole.COMPANY_USER,
        is_approved=True,
        full_name="Owner",
        company_id=company.id,
        company_role="OWNER",
    )
    db.add(owner)
    company.owner_id = owner.id
    company.logo_url = f"{company.id}/old.png"
    await db.commit()
    company_id = company.id
    old_path = company.logo_url

    uploaded: list[str] = []
    deleted: list[str] = []
    monkeypatch.setattr(companies, "validate_logo_content_async", _valid_content)
    monkeypatch.setattr(companies, "upload_logo", lambda path, *_args: uploaded.append(path))
    monkeypatch.setattr(companies, "delete_logo", lambda path: deleted.append(path))

    def fail_commit(_session) -> None:
        raise RuntimeError("database unavailable")

    event.listen(db.sync_session, "before_commit", fail_commit)
    try:
        with pytest.raises(HTTPException) as caught:
            await companies.upload_company_logo(
                company.id,
                _Upload(b"\x89PNG\r\n\x1a\ncontent", "logo.png", "image/png"),
                owner,
                db,
            )
    finally:
        event.remove(db.sync_session, "before_commit", fail_commit)

    assert caught.value.status_code == 503
    assert len(uploaded) == 1
    assert deleted == uploaded
    stored_company = await db.get(Company, company_id)
    assert stored_company is not None
    assert stored_company.logo_url == old_path
    assert stored_company.logo_url not in deleted


@pytest.mark.asyncio
async def test_worker_rejects_foreign_asset_before_storage_or_ai(monkeypatch) -> None:
    app = SimpleNamespace(
        id=uuid.uuid4(),
        candidate_id=uuid.uuid4(),
        cv_asset_id=uuid.uuid4(),
    )

    class _Result:
        def scalar_one_or_none(self):
            return app

    class _DB:
        async def execute(self, _statement):
            return _Result()

    storage_called = False
    ai_called = False

    async def no_owned_asset(_db, _app):
        return None

    def forbidden_storage(*_args, **_kwargs):
        nonlocal storage_called
        storage_called = True
        raise AssertionError("storage must not be called")

    def forbidden_ai(*_args, **_kwargs):
        nonlocal ai_called
        ai_called = True
        raise AssertionError("AI must not be called")

    monkeypatch.setattr(screening, "get_application_cv_asset", no_owned_asset)
    monkeypatch.setattr(screening, "_cv_text", forbidden_storage)
    monkeypatch.setattr(screening, "generate_text", forbidden_ai)

    with pytest.raises(ValueError, match="ownership mismatch"):
        await screening.screen_application(_DB(), app.id)
    assert storage_called is False
    assert ai_called is False


@pytest.mark.asyncio
async def test_download_rejects_foreign_asset_before_storage(
    db: AsyncSession,
    monkeypatch,
) -> None:
    candidate, _profile, old_asset, offer = await _seed_candidate(db)
    application = Application(
        candidate_id=candidate.id,
        opportunity_id=offer.id,
        cv_asset_id=old_asset.id,
        cv_url=old_asset.storage_path,
        status="applied",
    )
    db.add(application)
    await db.commit()
    storage_called = False

    async def reject_foreign_asset(_db, _application):
        raise cv_assets.CVAssetOwnershipError("CV asset owner mismatch")

    def forbidden_storage(*_args, **_kwargs):
        nonlocal storage_called
        storage_called = True
        raise AssertionError("storage must not be called")

    monkeypatch.setattr(
        applications,
        "get_application_cv_asset",
        reject_foreign_asset,
    )
    monkeypatch.setattr(cv_storage, "download_cv", forbidden_storage)

    with pytest.raises(HTTPException) as caught:
        await applications.download_application_cv(
            application.id,
            candidate,
            db,
        )
    assert caught.value.status_code == 404
    assert storage_called is False
