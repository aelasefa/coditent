"""Recruiter candidate-data visibility tests. Offline: sqlite, no Supabase.

Run: python -m pytest tests/test_recruiter_candidate_data.py -v
(from apps/api, with pytest, pytest-asyncio, sqlalchemy, aiosqlite installed)

Regression cover for: recruiter sees the candidate's existing profile skills,
applications use immutable owner-bound CV snapshots, no raw storage URLs are
exposed, and company/candidate isolation holds in payload builders.
"""
import sys
import types
import uuid
from collections.abc import AsyncGenerator
from pathlib import Path

import pytest

# --- Stub environment-dependent modules before importing app code ---
_cfg = types.ModuleType("app.config")
_cfg.settings = types.SimpleNamespace(
    gemini_api_key="test",
    database_url="sqlite://",
    redis_url="redis://localhost:6379/0",
    secret_key="test-secret",
    algorithm="HS256",
    access_token_expire_minutes=60,
    access_token_cookie_name="access_token",
    access_token_cookie_secure=False,
    access_token_cookie_samesite="lax",
)
sys.modules["app.config"] = _cfg

_obs = types.ModuleType("app.observability")


class _Log:
    def info(self, *a, **k): ...
    def error(self, *a, **k): ...
    def warning(self, *a, **k): ...
    def exception(self, *a, **k): ...


_obs.get_logger = lambda name="t": _Log()
_obs.configure_logging = lambda: None
sys.modules["app.observability"] = _obs

from sqlalchemy.orm import DeclarativeBase  # noqa: E402


# Reuse a shared stub when another test module already installed one, so both
# modules bind app.models to the same Base in a single pytest process.
_existing_db = sys.modules.get("app.database")
if _existing_db is not None and hasattr(_existing_db, "Base"):
    _Base = _existing_db.Base
    _db = _existing_db
else:
    class _Base(DeclarativeBase):
        pass

    _db = types.ModuleType("app.database")
    _db.Base = _Base
    _db.engine = None
    _db.AsyncSessionLocal = None


async def _get_db() -> AsyncGenerator:
    raise RuntimeError("no live db in tests")


_db.get_db = _get_db
sys.modules["app.database"] = _db

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest_asyncio  # noqa: E402
from sqlalchemy import select  # noqa: E402
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
    Offer,
    OfferType,
    User,
    UserRole,
)
from app.routers.applications import (  # noqa: E402
    _effective_cv_path,
    _profiles_by_user_id,
    _serialize_application,
)


@pytest_asyncio.fixture()
async def db() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(_Base.metadata.create_all)
    maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as session:
        yield session
    await engine.dispose()


SKILLS = "React, Next.js, TypeScript"
PROFILE_CV = "cand-1/aaa_cv.pdf"
APP_CV = "cand-1/bbb_snapshot.pdf"


async def _setup(
    db: AsyncSession, *, app_cv: str | None = APP_CV, profile_cv: str | None = PROFILE_CV
) -> tuple[User, Offer, Application, CandidateProfile, CVAsset | None]:
    user = User(
        email="cand@test.local",
        password_hash="x",
        role=UserRole.CANDIDATE,
        is_approved=True,
        full_name="Cand One",
    )
    db.add(user)
    await db.flush()
    profile_asset: CVAsset | None = None
    if profile_cv:
        profile_asset = CVAsset(
            owner_id=user.id,
            version=1,
            storage_path=f"{user.id}/{profile_cv.rsplit('/', 1)[-1]}",
            original_filename=profile_cv.rsplit("/", 1)[-1],
            content_type="application/pdf",
            size_bytes=100,
        )
        db.add(profile_asset)
        await db.flush()
    profile = CandidateProfile(
        user_id=user.id,
        skills=SKILLS,
        current_cv_asset_id=profile_asset.id if profile_asset else None,
        cv_url=profile_asset.storage_path if profile_asset else None,
    )
    db.add(profile)
    offer = Offer(
        recruiter_id=user.id,
        title="Software enginer",
        company="Oracle",
        region="On Site",
        field="Software Engineering",
        type=OfferType.JOB,
        description="Build.",
        requirements="React.",
        active=True,
    )
    db.add(offer)
    await db.flush()
    app_asset = profile_asset
    if app_cv and (profile_asset is None or app_cv.rsplit("/", 1)[-1] != profile_asset.original_filename):
        app_asset = CVAsset(
            owner_id=user.id,
            version=2 if profile_asset else 1,
            storage_path=f"{user.id}/{app_cv.rsplit('/', 1)[-1]}",
            original_filename=app_cv.rsplit("/", 1)[-1],
            content_type="application/pdf",
            size_bytes=100,
        )
        db.add(app_asset)
        await db.flush()
    app = Application(
        candidate_id=user.id,
        opportunity_id=offer.id,
        status="applied",
        cv_asset_id=app_asset.id if app_asset else None,
        cv_url=app_asset.storage_path if app_asset else None,
    )
    db.add(app)
    await db.commit()
    return user, offer, app, profile, app_asset


def test_effective_cv_uses_owner_bound_application_snapshot() -> None:
    owner_id = uuid.uuid4()
    asset = CVAsset(
        id=uuid.uuid4(),
        owner_id=owner_id,
        version=1,
        storage_path=f"{owner_id}/snapshot.pdf",
        original_filename="snapshot.pdf",
        content_type="application/pdf",
    )
    app = Application(candidate_id=owner_id, cv_asset_id=asset.id, cv_url="foreign/key.pdf")
    assert _effective_cv_path(app, asset) == asset.storage_path


def test_effective_cv_rejects_foreign_or_unbound_asset() -> None:
    owner_id = uuid.uuid4()
    foreign_owner = uuid.uuid4()
    asset = CVAsset(
        id=uuid.uuid4(),
        owner_id=foreign_owner,
        version=1,
        storage_path=f"{foreign_owner}/foreign.pdf",
        original_filename="foreign.pdf",
        content_type="application/pdf",
    )
    app = Application(candidate_id=owner_id, cv_asset_id=asset.id, cv_url=asset.storage_path)
    assert _effective_cv_path(app, asset) is None


def test_effective_cv_none_when_no_cv_anywhere() -> None:
    assert _effective_cv_path(Application(cv_url="foreign/key.pdf"), None) is None


@pytest.mark.asyncio
async def test_recruiter_payload_carries_existing_skills(db: AsyncSession) -> None:
    user, _offer, app, profile, asset = await _setup(db)
    payload = _serialize_application(app, user, profile, asset)
    # Same single source of truth the candidate sees on their own profile.
    assert payload["candidate"]["skills"] == SKILLS
    assert payload["profile"]["skills"] == SKILLS
    assert payload["candidate"]["full_name"] == "Cand One"
    assert payload["candidate"]["email"] == "cand@test.local"


@pytest.mark.asyncio
async def test_recruiter_payload_exposes_cv_without_raw_url(db: AsyncSession) -> None:
    user, _offer, app, profile, asset = await _setup(db)
    payload = _serialize_application(app, user, profile, asset)
    assert payload["cv"] == {
        "filename": "bbb_snapshot.pdf",
        "download_url": f"/applications/{app.id}/cv",
    }
    # Raw private storage path must never be linkable from the payload.
    assert PROFILE_CV not in str(payload["cv"])
    assert APP_CV not in str(payload["cv"])


@pytest.mark.asyncio
async def test_application_freezes_current_profile_asset(db: AsyncSession) -> None:
    user, _offer, app, profile, asset = await _setup(db, app_cv=None)
    payload = _serialize_application(app, user, profile, asset)
    assert payload["cv"] is not None
    assert payload["cv"]["filename"] == "aaa_cv.pdf"


@pytest.mark.asyncio
async def test_recruiter_payload_no_cv_is_genuinely_empty(db: AsyncSession) -> None:
    user, _offer, app, _profile, asset = await _setup(db, app_cv=None, profile_cv=None)
    profiles = await _profiles_by_user_id(db, {user.id})
    payload = _serialize_application(app, user, profiles.get(user.id), asset)
    assert payload["cv"] is None


@pytest.mark.asyncio
async def test_empty_skills_are_genuinely_empty(db: AsyncSession) -> None:
    user, _offer, app, profile, asset = await _setup(db)
    profile.skills = None
    await db.commit()
    payload = _serialize_application(app, user, profile, asset)
    assert payload["candidate"]["skills"] is None
    assert payload["profile"]["skills"] is None


@pytest.mark.asyncio
async def test_profiles_map_scoped_per_candidate(db: AsyncSession) -> None:
    user, _offer, app, _profile, asset = await _setup(db)
    other = User(
        email="other@test.local",
        password_hash="x",
        role=UserRole.CANDIDATE,
        is_approved=True,
        full_name="Other",
    )
    db.add(other)
    await db.commit()
    profiles = await _profiles_by_user_id(db, {user.id, other.id, uuid.uuid4()})
    assert set(profiles) == {user.id}
    payload = _serialize_application(app, user, profiles.get(user.id), asset)
    assert payload["candidate"]["skills"] == SKILLS


@pytest.mark.asyncio
async def test_payload_survives_stage_changes(db: AsyncSession) -> None:
    user, _offer, app, profile, asset = await _setup(db)
    for stage in ("under_review", "shortlisted", "interview", "accepted"):
        app.status = stage
        await db.commit()
        payload = _serialize_application(app, user, profile, asset)
        assert payload["candidate"]["skills"] == SKILLS
        assert payload["cv"] is not None
        assert payload["status"] == stage


@pytest.mark.asyncio
async def test_missing_candidate_does_not_crash(db: AsyncSession) -> None:
    _user, _offer, app, profile, asset = await _setup(db)
    payload = _serialize_application(app, None, profile, asset)
    assert payload["candidate"] is None
    assert payload["profile"]["skills"] == SKILLS


@pytest.mark.asyncio
async def test_company_isolation_at_query_level(db: AsyncSession) -> None:
    """Company B's offer-scoped query must never return Company A's rows."""
    user, offer_a, app_a, profile, asset = await _setup(db)
    result = await db.execute(
        select(Application).where(
            Application.opportunity_id.in_(
                select(Offer.id).where(Offer.id == uuid.uuid4())
            )
        )
    )
    assert result.scalars().all() == []
    own = await db.execute(
        select(Application).where(Application.opportunity_id == offer_a.id)
    )
    assert [a.id for a in own.scalars().all()] == [app_a.id]
    payload = _serialize_application(app_a, user, profile, asset)
    assert payload["candidate_id"] == str(user.id)
