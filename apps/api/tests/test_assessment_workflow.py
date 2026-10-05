from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import (
    Application,
    Assessment,
    Company,
    Offer,
    OfferType,
    User,
    UserRole,
)
from app.routers import applications, assessments
from app.schemas import (
    ApplicationStatusUpdate,
    AssessmentCreate,
    AssessmentReview,
    AssessmentSubmit,
)
from app.services import assessment_grading


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", poolclass=StaticPool
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session
    await engine.dispose()


async def _seed(db: AsyncSession):
    company = Company(name=f"Company-{uuid.uuid4().hex}", status="active")
    candidate = User(
        email=f"candidate-{uuid.uuid4().hex}@test.local",
        password_hash="x",
        role=UserRole.CANDIDATE,
        is_approved=True,
        full_name="Candidate",
    )
    db.add_all([company, candidate])
    await db.flush()
    reviewer = User(
        email=f"reviewer-{uuid.uuid4().hex}@test.local",
        password_hash="x",
        role=UserRole.COMPANY_USER,
        is_approved=True,
        full_name="Reviewer",
        company_id=company.id,
        company_role="HR",
    )
    db.add(reviewer)
    await db.flush()
    offer = Offer(
        recruiter_id=reviewer.id,
        created_by=reviewer.id,
        responsible_hr_id=reviewer.id,
        company_id=company.id,
        title="Engineer",
        company=company.name,
        region="Remote",
        field="Engineering",
        type=OfferType.JOB,
        description="Build reliable systems",
        requirements="Provide a written design",
        active=True,
        opportunity_status="active",
    )
    db.add(offer)
    await db.flush()
    application = Application(
        candidate_id=candidate.id,
        opportunity_id=offer.id,
        company_id=company.id,
        status="under_review",
    )
    db.add(application)
    await db.commit()
    return reviewer, candidate, application


async def _no_audit(*_args, **_kwargs):
    return None


@pytest.mark.asyncio
async def test_assessment_stage_requires_an_actual_assignment(db):
    reviewer, _candidate, application = await _seed(db)

    with pytest.raises(HTTPException) as caught:
        await applications.update_application_status(
            application.id,
            ApplicationStatusUpdate(
                status="assessment_required",
                expected_version=application.stage_version,
            ),
            reviewer,
            db,
        )

    assert caught.value.status_code == 409
    assert "Assign an assessment" in str(caught.value.detail)
    await db.refresh(application)
    assert application.status == "under_review"
    assert application.stage_version == 1


@pytest.mark.asyncio
async def test_assignment_submission_async_grade_and_hr_review(db, monkeypatch):
    reviewer, candidate, application = await _seed(db)
    monkeypatch.setattr(assessments, "log_audit", _no_audit)
    created = await assessments.create_assessment(
        AssessmentCreate(
            application_id=application.id,
            title="API design exercise",
            description="Describe a secure and reliable API design.",
            rubric=["Explains authorization", "Handles concurrent updates"],
            due_at=datetime.utcnow() + timedelta(days=2),
        ),
        reviewer,
        db,
    )
    assert created.status == "assigned"
    await db.refresh(application)
    assert application.status == "assessment_required"
    assert application.stage_version == 2

    queued: list[uuid.UUID] = []

    async def enqueue(_db, *, resource_id, **_kwargs):
        queued.append(resource_id)
        return SimpleNamespace(id=uuid.uuid4())

    monkeypatch.setattr(assessments, "enqueue_ai_job", enqueue)
    submitted = await assessments.submit_assessment(
        created.id,
        AssessmentSubmit(
            submission_text="I would enforce owner-scoped authorization and optimistic concurrency."
        ),
        candidate,
        db,
    )
    assert submitted.status == "submitted"
    assert submitted.grading_status == "queued"
    assert queued == [created.id]

    async def generate(*_args, **_kwargs):
        return (
            '{"score":84,"reasoning":"Covers authorization and concurrency with concrete evidence.","analysis_method":"ai"}',
            None,
        )

    monkeypatch.setattr(assessment_grading, "generate_text", generate)
    graded = await assessment_grading.grade_assessment(db, created.id)
    assert graded == {"score": 84, "analysis_method": "ai"}

    row = await db.get(Assessment, created.id)
    assert row is not None and row.status == "graded"
    reviewed = await assessments.review_assessment(
        created.id,
        AssessmentReview(
            expected_version=row.version,
            score=88,
            feedback="Strong design; add clearer recovery objectives.",
        ),
        reviewer,
        db,
    )
    assert reviewed.status == "reviewed"
    assert reviewed.score == 88
    assert reviewed.feedback.startswith("Strong design")


@pytest.mark.asyncio
async def test_expired_or_replayed_submission_is_rejected(db, monkeypatch):
    reviewer, candidate, application = await _seed(db)
    monkeypatch.setattr(assessments, "log_audit", _no_audit)
    item = Assessment(
        application_id=application.id,
        candidate_id=candidate.id,
        created_by=reviewer.id,
        title="Expired task",
        description="This task has expired.",
        rubric='["Evidence"]',
        max_score=100,
        due_at=datetime.utcnow() - timedelta(seconds=1),
        status="assigned",
    )
    db.add(item)
    await db.commit()
    with pytest.raises(HTTPException) as caught:
        await assessments.submit_assessment(
            item.id,
            AssessmentSubmit(submission_text="This submission is intentionally late."),
            candidate,
            db,
        )
    assert caught.value.status_code == 409
    await db.refresh(item)
    assert item.status == "expired"


@pytest.mark.asyncio
async def test_assessment_company_boundary_is_hidden(db):
    _reviewer, _candidate, application = await _seed(db)
    assessment = Assessment(
        application_id=application.id,
        candidate_id=application.candidate_id,
        title="Private task",
        description="Company-private assessment",
        rubric='["Evidence"]',
        status="assigned",
    )
    other_company = Company(name=f"Other-{uuid.uuid4().hex}", status="active")
    db.add_all([assessment, other_company])
    await db.flush()
    outsider = User(
        email=f"outsider-{uuid.uuid4().hex}@test.local",
        password_hash="x",
        role=UserRole.COMPANY_USER,
        is_approved=True,
        full_name="Outsider",
        company_id=other_company.id,
        company_role="HR",
    )
    db.add(outsider)
    await db.commit()
    with pytest.raises(HTTPException) as caught:
        await assessments.get_assessment(assessment.id, outsider, db)
    assert caught.value.status_code == 404
