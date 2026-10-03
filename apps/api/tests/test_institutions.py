from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import User, UserRole
from app.routers import institutions
from app.schemas import InstitutionCreate, InstitutionLicenseUpdate, InstitutionMembershipCreate


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session
    await engine.dispose()


async def _users(db):
    admin = User(email=f"admin-{uuid.uuid4().hex}@example.com", password_hash="x", role=UserRole.PLATFORM_ADMIN, is_approved=True, is_active=True, full_name="Platform Admin")
    school_admin = User(email=f"school-{uuid.uuid4().hex}@example.com", password_hash="x", role=UserRole.CANDIDATE, is_approved=True, is_active=True, full_name="School Admin")
    student = User(email=f"student-{uuid.uuid4().hex}@example.com", password_hash="x", role=UserRole.CANDIDATE, is_approved=True, is_active=True, full_name="Student")
    extra = User(email=f"extra-{uuid.uuid4().hex}@example.com", password_hash="x", role=UserRole.CANDIDATE, is_approved=True, is_active=True, full_name="Extra")
    db.add_all([admin, school_admin, student, extra])
    await db.commit()
    return admin, school_admin, student, extra


@pytest.mark.asyncio
async def test_institution_membership_enforces_license_seats_and_manager_scope(db):
    admin, school_admin, student, extra = await _users(db)
    institution = await institutions.create_institution(
        InstitutionCreate(name=f"School {uuid.uuid4().hex[:8]}", domain=f"{uuid.uuid4().hex}.edu", license_plan="standard", seat_limit=2),
        admin,
        db,
    )
    first = await institutions.add_institution_member(
        institution.id,
        InstitutionMembershipCreate(email=school_admin.email, role="ADMIN"),
        admin,
        db,
    )
    assert first.role == "ADMIN"
    second = await institutions.add_institution_member(
        institution.id,
        InstitutionMembershipCreate(email=student.email, role="STUDENT"),
        school_admin,
        db,
    )
    assert second.role == "STUDENT"
    with pytest.raises(HTTPException) as capacity:
        await institutions.add_institution_member(
            institution.id,
            InstitutionMembershipCreate(email=extra.email, role="STUDENT"),
            school_admin,
            db,
        )
    assert capacity.value.status_code == 402
    mine = await institutions.list_my_institutions(student, db)
    assert mine.institutions[0].seats_used == 2


@pytest.mark.asyncio
async def test_platform_license_controls_expiry_and_cannot_undercut_used_seats(db):
    admin, school_admin, student, _extra = await _users(db)
    institution = await institutions.create_institution(
        InstitutionCreate(name=f"Academy {uuid.uuid4().hex[:8]}", seat_limit=3), admin, db
    )
    await institutions.add_institution_member(institution.id, InstitutionMembershipCreate(email=school_admin.email, role="ADMIN"), admin, db)
    await institutions.add_institution_member(institution.id, InstitutionMembershipCreate(email=student.email, role="STUDENT"), school_admin, db)
    with pytest.raises(HTTPException) as seats:
        await institutions.update_institution_license(
            institution.id,
            InstitutionLicenseUpdate(status="active", license_plan="community", seat_limit=1),
            admin,
            db,
        )
    assert seats.value.status_code == 409
    inactive = await institutions.update_institution_license(
        institution.id,
        InstitutionLicenseUpdate(status="inactive", license_plan="standard", seat_limit=2, license_expires_at=datetime.utcnow() + timedelta(days=30)),
        admin,
        db,
    )
    assert inactive.status == "inactive" and inactive.seats_used == 2
