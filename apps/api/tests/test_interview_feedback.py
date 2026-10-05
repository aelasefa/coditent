from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Application, Company, Offer, OfferType, User, UserRole
from app.routers import applications
from app.schemas import InterviewFeedbackCreate, InterviewFeedbackUpdate


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session
    await engine.dispose()


async def _flow(db):
    company = Company(name=f"Interview-{uuid.uuid4().hex}", status="active")
    other_company = Company(name=f"Other-{uuid.uuid4().hex}", status="active")
    db.add_all([company, other_company])
    await db.flush()
    interviewer = User(email=f"hr-{uuid.uuid4().hex}@test.local", password_hash="x", role=UserRole.COMPANY_USER, is_approved=True, is_active=True, full_name="Interviewer", company_id=company.id, company_role="HR")
    other = User(email=f"other-{uuid.uuid4().hex}@test.local", password_hash="x", role=UserRole.COMPANY_USER, is_approved=True, is_active=True, full_name="Other interviewer", company_id=other_company.id, company_role="HR")
    candidate = User(email=f"candidate-{uuid.uuid4().hex}@test.local", password_hash="x", role=UserRole.CANDIDATE, is_approved=True, is_active=True, full_name="Candidate")
    db.add_all([interviewer, other, candidate])
    await db.flush()
    offer = Offer(recruiter_id=interviewer.id, company_id=company.id, created_by=interviewer.id, responsible_hr_id=interviewer.id, title="Engineer", company=company.name, region="Rabat", field="Engineering", type=OfferType.JOB, description="A structured engineering role.", requirements="Interview required.")
    db.add(offer)
    await db.flush()
    application = Application(candidate_id=candidate.id, opportunity_id=offer.id, company_id=company.id, status="interview", interview_scheduled_at=datetime.utcnow() + timedelta(days=1))
    db.add(application)
    await db.commit()
    return interviewer, other, application


@pytest.mark.asyncio
async def test_interviewer_creates_lists_and_updates_own_feedback(db):
    interviewer, _other, application = await _flow(db)
    created = await applications.create_interview_feedback(
        application.id,
        InterviewFeedbackCreate(rating=4, recommendation="yes", strengths="Clear system design", concerns="Limited observability depth", notes="Follow up on incident response."),
        interviewer,
        db,
    )
    assert created.rating == 4 and created.reviewer_name == "Interviewer"
    listed = await applications.list_interview_feedback(application.id, interviewer, db)
    assert [entry.id for entry in listed.feedback] == [created.id]
    updated = await applications.update_interview_feedback(
        application.id,
        created.id,
        InterviewFeedbackUpdate(expected_version=created.version, rating=5, recommendation="strong_yes", strengths="Excellent system design", concerns=None, notes="Proceed."),
        interviewer,
        db,
    )
    assert updated.version == 2 and updated.rating == 5
    with pytest.raises(HTTPException) as stale:
        await applications.update_interview_feedback(
            application.id,
            created.id,
            InterviewFeedbackUpdate(expected_version=1, rating=3, recommendation="neutral", strengths="Stale update", concerns=None, notes=None),
            interviewer,
            db,
        )
    assert stale.value.status_code == 409


@pytest.mark.asyncio
async def test_interview_feedback_is_company_scoped_and_one_per_reviewer(db):
    interviewer, other, application = await _flow(db)
    application_id = application.id
    payload = InterviewFeedbackCreate(rating=4, recommendation="yes", strengths="Strong communication", concerns=None, notes=None)
    await applications.create_interview_feedback(application_id, payload, interviewer, db)
    with pytest.raises(HTTPException) as hidden:
        await applications.list_interview_feedback(application_id, other, db)
    assert hidden.value.status_code == 404
    with pytest.raises(HTTPException) as duplicate:
        await applications.create_interview_feedback(application_id, payload, interviewer, db)
    assert duplicate.value.status_code == 409
