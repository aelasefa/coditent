"""PostgreSQL proofs for the write races that matter in multi-user operation.

These tests intentionally use independent sessions and release competing
transactions together. SQLite cannot exercise row locks or partial unique
indexes, so the suite requires ``MULTI_USER_TEST_DATABASE_URL``.
"""

from __future__ import annotations

import asyncio
import os
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import Application, CandidateRequest, Company, Offer, RequestStatus, User, UserRole
from app.routers import applications, invitations, requests
from app.schemas import ApplicationStatusUpdate, CandidateRequestStatusUpdate, EmployeeInviteExistingAcceptRequest


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

    monkeypatch.setattr(invitations, "log_audit", no_op)
    monkeypatch.setattr(applications, "log_audit", no_op)
    monkeypatch.setattr(applications, "create_notification", no_op)

    from app.routers import chat

    monkeypatch.setattr(chat, "broadcast_recruitment_state", no_op)


async def _release_together(
    actions: list[Callable[[asyncio.Event], Awaitable[object]]],
) -> list[object]:
    ready = 0
    ready_lock = asyncio.Lock()
    all_ready = asyncio.Event()
    release = asyncio.Event()

    async def run(action: Callable[[asyncio.Event], Awaitable[object]]) -> object:
        nonlocal ready
        async with ready_lock:
            ready += 1
            if ready == len(actions):
                all_ready.set()
        await release.wait()
        return await action(release)

    tasks = [asyncio.create_task(run(action)) for action in actions]
    await asyncio.wait_for(all_ready.wait(), timeout=5)
    release.set()
    return list(await asyncio.gather(*tasks))


async def _seed_company(
    session: AsyncSession,
    suffix: str,
    *,
    member_roles: tuple[str, ...] = (),
) -> tuple[Company, list[User]]:
    company = Company(name=f"Race Company {suffix}")
    session.add(company)
    await session.flush()
    members = [
        User(
            email=f"race-{role.lower()}-{suffix}-{index}@test.local",
            password_hash="test-hash",
            role=UserRole.COMPANY_USER,
            is_approved=True,
            is_active=True,
            full_name=f"Race {role} {index}",
            company_id=company.id,
            company_role=role,
        )
        for index, role in enumerate(member_roles)
    ]
    session.add_all(members)
    await session.flush()
    if members:
        company.owner_id = members[0].id
    return company, members


@pytest.mark.asyncio
async def test_invitation_race_keeps_one_pending_invitation(sessions) -> None:
    suffix = uuid.uuid4().hex
    email = f"parallel-invite-{suffix}@test.local"
    async with sessions() as setup:
        admin = User(
            email=f"admin-{suffix}@test.local",
            password_hash="test-hash",
            role=UserRole.PLATFORM_ADMIN,
            is_approved=True,
            is_active=True,
            full_name="Race Admin",
        )
        setup.add(admin)
        await setup.commit()
        admin_id = admin.id

    async def insert_invitation(_release: asyncio.Event) -> str:
        async with sessions() as session:
            try:
                await session.execute(
                    text(
                        "INSERT INTO company_invitations "
                        "(id, email, company_name, token_hash, status, invited_by, expires_at, created_at) "
                        "VALUES (:id, :email, :name, :token, 'pending', :admin, :expires, :created)"
                    ),
                    {
                        "id": str(uuid.uuid4()),
                        "email": email,
                        "name": f"Invited {suffix}",
                        "token": uuid.uuid4().hex,
                        "admin": str(admin_id),
                        "expires": datetime.utcnow() + timedelta(days=7),
                        "created": datetime.utcnow(),
                    },
                )
                await session.commit()
                return "created"
            except IntegrityError:
                await session.rollback()
                return "conflict"

    outcomes = await _release_together([insert_invitation, insert_invitation])
    assert sorted(outcomes) == ["conflict", "created"]
    async with sessions() as verify:
        count = int(
            (
                await verify.execute(
                    text(
                        "SELECT count(*) FROM company_invitations "
                        "WHERE lower(email)=lower(:email) AND status='pending'"
                    ),
                    {"email": email},
                )
            ).scalar_one()
        )
        assert count == 1


@pytest.mark.asyncio
async def test_membership_race_allows_one_company_to_claim_account(sessions) -> None:
    suffix = uuid.uuid4().hex
    email = f"membership-{suffix}@test.local"
    tokens = [f"membership-token-{suffix}-a", f"membership-token-{suffix}-b"]
    async with sessions() as setup:
        first, first_members = await _seed_company(setup, f"{suffix}-a", member_roles=("OWNER",))
        second, second_members = await _seed_company(setup, f"{suffix}-b", member_roles=("OWNER",))
        account = User(
            email=email,
            password_hash="test-hash",
            role=UserRole.CANDIDATE,
            is_approved=True,
            is_active=True,
            full_name="Membership Candidate",
        )
        setup.add(account)
        await setup.flush()
        for company, owner, token in zip(
            (first, second), (first_members[0], second_members[0]), tokens, strict=True
        ):
            await setup.execute(
                text(
                    "INSERT INTO employee_invitations "
                    "(id, company_id, email, role, token_hash, status, invited_by, expires_at, created_at) "
                    "VALUES (:id, :company, :email, 'HR', :token, 'pending', :owner, :expires, :created)"
                ),
                {
                    "id": str(uuid.uuid4()),
                    "company": str(company.id),
                    "email": email,
                    "token": invitations._hash(token),
                    "owner": str(owner.id),
                    "expires": datetime.utcnow() + timedelta(days=1),
                    "created": datetime.utcnow(),
                },
            )
        await setup.commit()
        account_id = account.id

    async def accept(token: str, _release: asyncio.Event) -> str:
        async with sessions() as session:
            user = (
                await session.execute(select(User).where(User.id == account_id))
            ).scalar_one()
            try:
                await invitations.accept_employee_existing(
                    EmployeeInviteExistingAcceptRequest(token=token), user, session
                )
                return "accepted"
            except HTTPException as exc:
                await session.rollback()
                assert exc.status_code == 400
                return "already-member"

    outcomes = await _release_together(
        [
            lambda release: accept(tokens[0], release),
            lambda release: accept(tokens[1], release),
        ]
    )
    assert sorted(outcomes) == ["accepted", "already-member"]
    async with sessions() as verify:
        account = (
            await verify.execute(select(User).where(User.id == account_id))
        ).scalar_one()
        assert account.company_id in {first.id, second.id}
        assert account.company_role == "HR"
        accepted = int(
            (
                await verify.execute(
                    text(
                        "SELECT count(*) FROM employee_invitations "
                        "WHERE email=:email AND status='accepted'"
                    ),
                    {"email": email},
                )
            ).scalar_one()
        )
        assert accepted == 1


@pytest.mark.asyncio
async def test_candidate_request_create_and_decision_races_have_one_winner(sessions) -> None:
    suffix = uuid.uuid4().hex
    async with sessions() as setup:
        company, recruiters = await _seed_company(
            setup, suffix, member_roles=("OWNER", "HR")
        )
        candidate = User(
            email=f"request-candidate-{suffix}@test.local",
            password_hash="test-hash",
            role=UserRole.CANDIDATE,
            is_approved=True,
            is_active=True,
            full_name="Request Candidate",
        )
        setup.add(candidate)
        await setup.commit()
        candidate_id, company_id = candidate.id, company.id
        recruiter_ids = [user.id for user in recruiters]

    async def insert_request(_release: asyncio.Event) -> str:
        async with sessions() as session:
            session.add(
                CandidateRequest(
                    candidate_id=candidate_id,
                    company_id=company_id,
                    status=RequestStatus.pending,
                    message="parallel request",
                )
            )
            try:
                await session.commit()
                return "created"
            except IntegrityError:
                await session.rollback()
                return "conflict"

    create_outcomes = await _release_together([insert_request, insert_request])
    assert sorted(create_outcomes) == ["conflict", "created"]
    async with sessions() as lookup:
        request_id = (
            await lookup.execute(
                select(CandidateRequest.id).where(
                    CandidateRequest.candidate_id == candidate_id,
                    CandidateRequest.company_id == company_id,
                    CandidateRequest.status == RequestStatus.pending,
                )
            )
        ).scalar_one()

    async def decide(recruiter_id: uuid.UUID, decision: str, _release: asyncio.Event) -> str:
        async with sessions() as session:
            recruiter = (
                await session.execute(select(User).where(User.id == recruiter_id))
            ).scalar_one()
            try:
                result = await requests.update_request_status(
                    request_id,
                    CandidateRequestStatusUpdate(status=decision),
                    recruiter,
                    session,
                )
                return result.status
            except HTTPException as exc:
                await session.rollback()
                assert exc.status_code == 409
                return "stale"

    decision_outcomes = await _release_together(
        [
            lambda release: decide(recruiter_ids[0], "accepted", release),
            lambda release: decide(recruiter_ids[1], "rejected", release),
        ]
    )
    assert decision_outcomes.count("stale") == 1
    assert set(decision_outcomes) & {"accepted", "rejected"}
    async with sessions() as verify:
        final = (
            await verify.execute(
                select(CandidateRequest).where(CandidateRequest.id == request_id)
            )
        ).scalar_one()
        assert final.status.value in {"accepted", "rejected"}


@pytest.mark.asyncio
async def test_application_stage_race_increments_version_once(sessions) -> None:
    suffix = uuid.uuid4().hex
    async with sessions() as setup:
        company, recruiters = await _seed_company(
            setup, suffix, member_roles=("OWNER", "HR")
        )
        candidate = User(
            email=f"stage-candidate-{suffix}@test.local",
            password_hash="test-hash",
            role=UserRole.CANDIDATE,
            is_approved=True,
            is_active=True,
            full_name="Stage Candidate",
        )
        setup.add(candidate)
        await setup.flush()
        offer = Offer(
            recruiter_id=recruiters[1].id,
            responsible_hr_id=recruiters[1].id,
            created_by=recruiters[1].id,
            company_id=company.id,
            title="Concurrency Engineer",
            company=company.name,
            region="Casablanca",
            field="Software",
            type="JOB",
            description="Test concurrent stage updates.",
            requirements="PostgreSQL",
        )
        setup.add(offer)
        await setup.flush()
        application = Application(
            candidate_id=candidate.id,
            opportunity_id=offer.id,
            company_id=company.id,
            status="applied",
            stage_version=1,
        )
        setup.add(application)
        await setup.commit()
        application_id = application.id
        recruiter_ids = [user.id for user in recruiters]

    async def move_stage(
        recruiter_id: uuid.UUID, new_status: str, _release: asyncio.Event
    ) -> str:
        async with sessions() as session:
            recruiter = (
                await session.execute(select(User).where(User.id == recruiter_id))
            ).scalar_one()
            try:
                result = await applications.update_application_status(
                    application_id,
                    ApplicationStatusUpdate(status=new_status, expected_version=1),
                    recruiter,
                    session,
                )
                return result.status
            except HTTPException as exc:
                await session.rollback()
                assert exc.status_code == 409
                assert exc.detail["code"] == "STALE_APPLICATION_STAGE"
                return "stale"

    outcomes = await _release_together(
        [
            lambda release: move_stage(recruiter_ids[0], "under_review", release),
            lambda release: move_stage(recruiter_ids[1], "rejected", release),
        ]
    )
    assert outcomes.count("stale") == 1
    assert set(outcomes) & {"under_review", "rejected"}
    async with sessions() as verify:
        final = (
            await verify.execute(
                select(Application).where(Application.id == application_id)
            )
        ).scalar_one()
        assert final.stage_version == 2
        assert final.status in {"under_review", "rejected"}
