"""HTTP permission regressions with isolated fixtures and no live API server."""
import uuid

import httpx
import pytest
import pytest_asyncio
from cryptography.fernet import Fernet
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.config import settings
from app.database import engine, get_db
from app.main import app
from app.models import Company, Offer, OfferType, User, UserRole
from app.services import authentication, email_outbox
from app.utils.jwt import create_access_token


def _headers(user):
    token = create_access_token({"sub": str(user.id), "auth_version": user.auth_version})
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def workspace(monkeypatch):
    # Keep JWT verification and permission checks; isolate external mail and
    # revocation storage so these permission tests have no service dependency.
    class SessionStore:
        async def get(self, key):
            return None

    monkeypatch.setattr(authentication, "get_async_redis", lambda: SessionStore())
    monkeypatch.setattr(settings, "email_outbox_encryption_key", Fernet.generate_key().decode())
    monkeypatch.setattr(email_outbox, "send_email", lambda *args, **kwargs: {"id": "test-mail"})
    async with engine.connect() as connection:
        transaction = await connection.begin()
        sessions = async_sessionmaker(
            connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
        )

        async def test_db():
            async with sessions() as session:
                yield session

        previous = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_db] = test_db
        try:
            async with sessions() as db:
                suffix = uuid.uuid4().hex
                companies = [Company(name=f"RBAC-{suffix}-{i}") for i in range(2)]
                db.add_all(companies)
                await db.flush()
                users = {}
                for name, role, company, company_role in (
                    ("owner", UserRole.COMPANY_USER, companies[0], "OWNER"),
                    ("other_owner", UserRole.COMPANY_USER, companies[1], "OWNER"),
                    ("hr", UserRole.COMPANY_USER, companies[0], "HR"),
                    ("candidate", UserRole.CANDIDATE, None, None),
                ):
                    user = User(
                        email=f"{name}-{suffix}@example.com", password_hash="unused",
                        full_name=name, role=role, is_active=True, is_approved=True,
                        company_id=company.id if company else None, company_role=company_role,
                    )
                    db.add(user)
                    users[name] = user
                await db.flush()
                offers = []
                for company, owner in zip(companies, (users["owner"], users["other_owner"])):
                    offer = Offer(
                        recruiter_id=owner.id, company_id=company.id,
                        title="Software Engineer", company=company.name, region="Remote",
                        field="Software Engineering", type=OfferType.JOB,
                        description="Build software", requirements="Python", active=True,
                    )
                    db.add(offer)
                    offers.append(offer)
                await db.commit()
            transport = httpx.ASGITransport(app=app, client=(f"rbac-{suffix}", 41000))
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                yield {"client": client, "companies": companies, "users": users,
                       "offers": offers, "sessions": sessions}
        finally:
            if previous is None:
                app.dependency_overrides.pop(get_db, None)
            else:
                app.dependency_overrides[get_db] = previous
            await transaction.rollback()


@pytest.mark.asyncio
async def test_health(workspace):
    response = await workspace["client"].get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_offers_public(workspace):
    response = await workspace["client"].get("/offers")
    assert response.status_code == 200
    ids = {offer["id"] for offer in response.json()["offers"]}
    assert {str(offer.id) for offer in workspace["offers"]} <= ids


@pytest.mark.asyncio
async def test_cross_company_offer_isolation(workspace):
    client = workspace["client"]
    for index, user in enumerate((workspace["users"]["owner"], workspace["users"]["other_owner"])):
        own = await client.get(f"/offers/{workspace['offers'][index].id}", headers=_headers(user))
        foreign = await client.get(f"/offers/{workspace['offers'][1-index].id}", headers=_headers(user))
        assert own.status_code == 200, own.text
        assert foreign.status_code == 404, foreign.text


@pytest.mark.asyncio
async def test_invitation_role_matrix(workspace):
    client = workspace["client"]
    email = f"invite-{uuid.uuid4().hex}@example.com"
    response = await client.post(
        "/invites/employee/invite", json={"email": email, "role": "HR"},
        headers=_headers(workspace["users"]["owner"]),
    )
    assert response.status_code == 200, response.text
    denied_email = f"denied-{uuid.uuid4().hex}@example.com"
    response = await client.post(
        "/invites/employee/invite", json={"email": denied_email, "role": "HR"},
        headers=_headers(workspace["users"]["hr"]),
    )
    assert response.status_code == 403, response.text
    async with workspace["sessions"]() as db:
        rows = (await db.execute(
            text("SELECT email FROM employee_invitations WHERE company_id=:id"),
            {"id": str(workspace["companies"][0].id)},
        )).scalars().all()
    assert email in rows
    assert denied_email not in rows


@pytest.mark.asyncio
async def test_candidate_cannot_escalate(workspace):
    client = workspace["client"]
    headers = _headers(workspace["users"]["candidate"])
    for company in workspace["companies"]:
        response = await client.get(f"/companies/{company.id}/members", headers=headers)
        assert response.status_code == 403, response.text
    response = await client.post(
        "/invites/employee/invite",
        json={"email": f"escalation-{uuid.uuid4().hex}@example.com", "role": "OWNER"},
        headers=headers,
    )
    assert response.status_code == 403, response.text
