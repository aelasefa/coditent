"""PostgreSQL proofs for database constraints, cascades, and row locks."""

from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timedelta

import pytest
import pytest_asyncio
from fastapi import HTTPException, Response
from pydantic import ValidationError
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import (
    Application,
    Company,
    Offer,
    OfferType,
    SavedRecommendation,
    User,
    UserRole,
)
from app.routers import auth, companies, offers
from app.schemas import CompanyUpdate, EmailChangeConfirm, OfferUpdate
from app.services.email_verification import hash_otp


def _database_url() -> str:
    value = os.getenv("MULTI_USER_TEST_DATABASE_URL", "")
    if not value.startswith("postgresql"):
        pytest.skip("MULTI_USER_TEST_DATABASE_URL must point to PostgreSQL")
    return value


@pytest_asyncio.fixture
async def sessions():
    engine = create_async_engine(
        _database_url(),
        pool_pre_ping=True,
        connect_args={"statement_cache_size": 0, "prepared_statement_cache_size": 0},
    )
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        yield maker
    finally:
        await engine.dispose()


@pytest.fixture(autouse=True)
def no_external_side_effects(monkeypatch):
    async def no_op(*_args, **_kwargs):
        return None

    monkeypatch.setattr(offers, "log_audit", no_op)
    monkeypatch.setattr(offers, "_bust_recommendation_cache", no_op)
    monkeypatch.setattr(companies, "log_audit", no_op)


async def _seed_company(
    session: AsyncSession, suffix: str
) -> tuple[Company, User, User]:
    company = Company(name=f"Integrity Company {suffix}")
    session.add(company)
    await session.flush()
    owner = User(
        email=f"integrity-owner-{suffix}@test.local",
        password_hash="test-hash",
        role=UserRole.COMPANY_USER,
        is_approved=True,
        is_active=True,
        full_name="Integrity Owner",
        company_id=company.id,
        company_role="OWNER",
    )
    member = User(
        email=f"integrity-member-{suffix}@test.local",
        password_hash="test-hash",
        role=UserRole.COMPANY_USER,
        is_approved=True,
        is_active=True,
        full_name="Integrity HR",
        company_id=company.id,
        company_role="HR",
    )
    session.add_all([owner, member])
    await session.flush()
    company.owner_id = owner.id
    return company, owner, member


def _offer(company: Company, recruiter: User, suffix: str) -> Offer:
    return Offer(
        recruiter_id=recruiter.id,
        company_id=company.id,
        created_by=recruiter.id,
        responsible_hr_id=recruiter.id,
        title=f"Integrity Offer {suffix}",
        company=company.name,
        region="Casablanca",
        field="engineering",
        type=OfferType.JOB,
        description="Database integrity proof",
        requirements="PostgreSQL",
    )


def test_patch_schemas_reject_null_for_required_database_fields() -> None:
    with pytest.raises(ValidationError, match="Fields cannot be null"):
        OfferUpdate(title=None)
    with pytest.raises(ValidationError, match="Company name cannot be null"):
        CompanyUpdate(name=None)


def test_company_description_supports_detailed_profiles_up_to_ten_thousand_characters() -> None:
    description = "x" * 10_000
    assert CompanyUpdate(description=description).description == description

    with pytest.raises(ValidationError):
        CompanyUpdate(description="x" * 10_001)


@pytest.mark.asyncio
async def test_deleting_offer_cascades_saved_recommendations(sessions) -> None:
    suffix = uuid.uuid4().hex
    async with sessions() as session:
        company, owner, _member = await _seed_company(session, suffix)
        candidate = User(
            email=f"integrity-candidate-{suffix}@test.local",
            password_hash="test-hash",
            role=UserRole.CANDIDATE,
            is_approved=True,
            is_active=True,
            full_name="Integrity Candidate",
        )
        admin = User(
            email=f"integrity-admin-{suffix}@test.local",
            password_hash="test-hash",
            role=UserRole.PLATFORM_ADMIN,
            is_approved=True,
            is_active=True,
            full_name="Integrity Admin",
        )
        offer = _offer(company, owner, suffix)
        session.add_all([candidate, admin, offer])
        await session.flush()
        recommendation = SavedRecommendation(
            candidate_id=candidate.id,
            offer_id=offer.id,
            ai_score=88,
            ai_reasoning="Strong match",
            status="completed",
        )
        session.add(recommendation)
        await session.commit()
        offer_id = offer.id
        recommendation_id = recommendation.id

        await offers.delete_offer(offer_id, admin, session)

        assert await session.get(Offer, offer_id) is None
    # A database cascade does not evict an already-loaded child from another
    # identity map; verify the committed state from a fresh transaction.
    async with sessions() as verify:
        assert await verify.get(SavedRecommendation, recommendation_id) is None


@pytest.mark.asyncio
async def test_database_rejects_invalid_nulls_counters_and_relationships(sessions) -> None:
    suffix = uuid.uuid4().hex
    async with sessions() as setup:
        company, owner, _member = await _seed_company(setup, suffix)
        candidate = User(
            email=f"integrity-invalid-{suffix}@test.local",
            password_hash="test-hash",
            role=UserRole.CANDIDATE,
            is_approved=True,
            is_active=True,
            full_name="Integrity Invalid Candidate",
        )
        offer = _offer(company, owner, suffix)
        setup.add_all([candidate, offer])
        await setup.flush()
        application = Application(
            candidate_id=candidate.id,
            opportunity_id=offer.id,
            company_id=company.id,
        )
        recommendation = SavedRecommendation(
            candidate_id=candidate.id,
            offer_id=offer.id,
            ai_score=50,
            ai_reasoning="Valid seed",
        )
        setup.add_all([application, recommendation])
        await setup.commit()
        candidate_id = candidate.id
        application_id = application.id
        recommendation_id = recommendation.id

    invalid_writes = [
        (
            "UPDATE users SET auth_version=-1 WHERE id=:id",
            {"id": candidate_id},
            "ck_users_auth_version",
        ),
        (
            "UPDATE users SET company_role='HR' WHERE id=:id",
            {"id": candidate_id},
            "ck_users_company_membership_pair",
        ),
        (
            "UPDATE users SET pending_email='new@example.com' WHERE id=:id",
            {"id": candidate_id},
            "ck_users_pending_email_bundle",
        ),
        (
            "UPDATE applications SET updated_at=NULL WHERE id=:id",
            {"id": application_id},
            'null value in column "updated_at"',
        ),
        (
            "UPDATE saved_recommendations SET updated_at=NULL WHERE id=:id",
            {"id": recommendation_id},
            'null value in column "updated_at"',
        ),
        (
            "UPDATE saved_recommendations SET ai_score=101 WHERE id=:id",
            {"id": recommendation_id},
            "ck_saved_recommendations_ai_score",
        ),
        (
            "UPDATE saved_recommendations SET status='unknown' WHERE id=:id",
            {"id": recommendation_id},
            "ck_saved_recommendations_status",
        ),
        (
            "UPDATE applications SET status='unknown' WHERE id=:id",
            {"id": application_id},
            "ck_applications_status",
        ),
    ]
    for statement, parameters, expected_marker in invalid_writes:
        async with sessions() as session:
            with pytest.raises(IntegrityError) as raised:
                await session.execute(text(statement), parameters)
                await session.commit()
            await session.rollback()
            assert expected_marker in str(raised.value)


@pytest.mark.asyncio
async def test_removing_responsible_member_reassigns_offer_atomically(sessions) -> None:
    suffix = uuid.uuid4().hex
    async with sessions() as session:
        company, owner, member = await _seed_company(session, suffix)
        offer = _offer(company, owner, suffix)
        offer.responsible_hr_id = member.id
        session.add(offer)
        await session.commit()
        company_id = company.id
        member_id = member.id
        offer_id = offer.id

        await companies.remove_member(company_id, member_id, owner, session)

        await session.refresh(member)
        await session.refresh(offer)
        assert member.company_id is None
        assert member.company_role is None
        assert offer.responsible_hr_id == owner.id


@pytest.mark.asyncio
async def test_parallel_email_failures_increment_attempt_counter_without_loss(sessions) -> None:
    suffix = uuid.uuid4().hex
    async with sessions() as setup:
        user = User(
            email=f"integrity-counter-{suffix}@test.local",
            password_hash="test-hash",
            role=UserRole.CANDIDATE,
            is_approved=True,
            is_active=True,
            full_name="Integrity Counter Candidate",
            pending_email=f"integrity-new-{suffix}@test.local",
            pending_email_otp_hash=hash_otp("123456"),
            pending_email_expires_at=datetime.utcnow() + timedelta(minutes=10),
            pending_email_attempts=0,
        )
        setup.add(user)
        await setup.commit()
        user_id = user.id

    release = asyncio.Event()
    ready = 0
    ready_lock = asyncio.Lock()
    both_ready = asyncio.Event()

    async def fail_confirmation() -> int:
        nonlocal ready
        async with sessions() as session:
            current_user = await session.get(User, user_id)
            assert current_user is not None
            async with ready_lock:
                ready += 1
                if ready == 2:
                    both_ready.set()
            await release.wait()
            try:
                await auth.confirm_email_change.__wrapped__(
                    EmailChangeConfirm(otp="000000"),
                    None,
                    Response(),
                    current_user,
                    session,
                )
            except HTTPException as exc:
                return exc.status_code
            raise AssertionError("invalid OTP unexpectedly succeeded")

    tasks = [asyncio.create_task(fail_confirmation()) for _ in range(2)]
    await asyncio.wait_for(both_ready.wait(), timeout=5)
    release.set()
    assert await asyncio.gather(*tasks) == [400, 400]

    async with sessions() as verify:
        attempts = await verify.scalar(
            select(User.pending_email_attempts).where(User.id == user_id)
        )
        assert attempts == 2
