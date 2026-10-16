from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.models import Company, Offer, OfferType, User, UserRole
from app.services.entitlements import EntitlementDenied, entitlement_snapshot, require_capacity


@pytest_asyncio.fixture
async def sessions():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    async with engine.begin() as connection:
        await connection.run_sync(Company.__table__.create)
        await connection.run_sync(User.__table__.create)
        await connection.run_sync(Offer.__table__.create)
        await connection.execute(
            text(
                "CREATE TABLE employee_invitations ("
                "id VARCHAR PRIMARY KEY, company_id VARCHAR NOT NULL, status VARCHAR NOT NULL, expires_at DATETIME NOT NULL)"
            )
        )
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        yield factory
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_free_plan_limits_are_enforced_under_locked_capacity_check(sessions):
    async with sessions() as db:
        company = Company(
            id=uuid.uuid4(),
            name="Limited Company",
            status="active",
            subscription_plan="free",
            subscription_status="active",
        )
        owner = User(
            id=uuid.uuid4(),
            email="owner@example.com",
            password_hash="unused",
            role=UserRole.COMPANY_USER,
            is_approved=True,
            is_active=True,
            full_name="Owner",
            company_id=company.id,
            company_role="OWNER",
        )
        db.add_all([company, owner])
        for index in range(3):
            db.add(
                Offer(
                    recruiter_id=owner.id,
                    company_id=company.id,
                    title=f"Role {index}",
                    company=company.name,
                    region="Remote",
                    field="Engineering",
                    type=OfferType.JOB,
                    description="Long enough description",
                    requirements="Long enough requirements",
                    active=True,
                    opportunity_status="active",
                )
            )
        await db.commit()

        with pytest.raises(EntitlementDenied) as full:
            await require_capacity(db, company.id, "active_offers")
        assert full.value.code == "PLAN_LIMIT_REACHED"

        first_offer = (await db.execute(text("SELECT id FROM offers LIMIT 1"))).first()
        await db.execute(
            text("UPDATE offers SET active=0, opportunity_status='closed' WHERE id=:id"),
            {"id": first_offer[0]},
        )
        await db.commit()
        snapshot = await require_capacity(db, company.id, "active_offers")
        assert snapshot.usage["active_offers"] == 2


@pytest.mark.asyncio
async def test_pending_invites_reserve_member_capacity_and_inactive_subscription_blocks(sessions):
    async with sessions() as db:
        company = Company(
            id=uuid.uuid4(),
            name="Seat Company",
            status="active",
            subscription_plan="free",
            subscription_status="active",
        )
        db.add(company)
        for index in range(4):
            db.add(
                User(
                    email=f"member-{index}@example.com",
                    password_hash="unused",
                    role=UserRole.COMPANY_USER,
                    is_approved=True,
                    is_active=True,
                    full_name=f"Member {index}",
                    company_id=company.id,
                    company_role="HR",
                )
            )
        await db.flush()
        await db.execute(
            text(
                "INSERT INTO employee_invitations (id, company_id, status, expires_at) "
                "VALUES (:id, :company_id, 'pending', :expires_at)"
            ),
            {
                "id": str(uuid.uuid4()),
                "company_id": str(company.id),
                "expires_at": datetime.utcnow() + timedelta(days=1),
            },
        )
        await db.commit()

        snapshot = await entitlement_snapshot(db, company.id)
        assert snapshot.usage["reserved_members"] == 5
        with pytest.raises(EntitlementDenied) as full:
            await require_capacity(db, company.id, "members")
        assert full.value.code == "PLAN_LIMIT_REACHED"

        company.subscription_status = "past_due"
        await db.commit()
        with pytest.raises(EntitlementDenied) as inactive:
            await entitlement_snapshot(db, company.id)
        assert inactive.value.code == "SUBSCRIPTION_INACTIVE"
