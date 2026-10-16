"""Support API integration tests with isolated, in-memory storage.

Run with pytest, aiosqlite and the API dependencies installed. No real database
or production credentials are used by the fixtures below.
"""
import importlib.util
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import create_engine, inspect, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.database import Base, get_db
from app.limiter import limiter
from app.models import AdminActivityLog, Company, SupportTicket, User, UserRole
from app.routers.support import router
from app.utils.jwt import create_access_token


@pytest.fixture
def support_client():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    company_id = uuid.uuid4()
    users = {
        "candidate": User(id=uuid.uuid4(), email="candidate@example.test", full_name="Candidate", password_hash="unused", role=UserRole.CANDIDATE, is_approved=True, is_active=True, auth_version=0),
        "company": User(id=uuid.uuid4(), email="company@example.test", full_name="Company user", password_hash="unused", role=UserRole.COMPANY_USER, company_id=company_id, company_role="OWNER", is_approved=True, is_active=True, auth_version=0),
        "colleague": User(id=uuid.uuid4(), email="colleague@example.test", full_name="Colleague", password_hash="unused", role=UserRole.COMPANY_USER, company_id=company_id, company_role="HR", is_approved=True, is_active=True, auth_version=0),
        "admin": User(id=uuid.uuid4(), email="admin@example.test", full_name="Admin", password_hash="unused", role=UserRole.PLATFORM_ADMIN, is_approved=True, is_active=True, auth_version=0),
    }

    @asynccontextmanager
    async def lifespan(app):
        async with engine.begin() as conn:
            await conn.run_sync(lambda connection: Base.metadata.create_all(connection, tables=[Company.__table__, User.__table__, SupportTicket.__table__, AdminActivityLog.__table__]))
        async with sessions() as db:
            db.add(Company(id=company_id, name="Test company"))
            await db.flush()
            db.add_all(users.values())
            await db.commit()
        yield
        await engine.dispose()

    async def db_override():
        async with sessions() as db:
            yield db

    app = FastAPI(lifespan=lifespan)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.dependency_overrides[get_db] = db_override
    app.include_router(router)
    limiter.reset()
    headers = {name: {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"} for name, user in users.items()}
    with TestClient(app) as client:
        yield client, headers, sessions
    limiter.reset()


def report(**overrides):
    return {
        "request_id": str(uuid.uuid4()),
        "subject": "Resume upload does not finish",
        "description": "I selected a PDF on my profile, but the upload never finishes.",
        "category": "technical",
        "page_path": "/dashboard/profile",
        **overrides,
    }


def test_authentication_and_admin_permissions(support_client):
    client, headers, _ = support_client
    assert client.post("/support", json=report()).status_code == 401
    assert client.get("/support").status_code == 401
    for role in ("candidate", "company", "colleague"):
        assert client.get("/admin/support", headers=headers[role]).status_code == 403
        assert client.patch(f"/admin/support/{uuid.uuid4()}", json={"status": "resolved"}, headers=headers[role]).status_code == 403


def test_ownership_and_admin_company_context(support_client):
    client, headers, _ = support_client
    first = client.post("/support", json=report(), headers=headers["candidate"])
    second = client.post("/support", json=report(page_path="/company/jobs"), headers=headers["company"])
    assert first.status_code == second.status_code == 201
    for role, ticket in (("candidate", first), ("company", second)):
        page = client.get("/support", headers=headers[role]).json()
        assert page["total"] == 1
        assert page["tickets"][0]["id"] == ticket.json()["id"]
        assert "reporter_email" not in page["tickets"][0]
    assert client.get("/support", headers=headers["colleague"]).json()["total"] == 0
    admin_page = client.get("/admin/support", headers=headers["admin"]).json()
    assert admin_page["total"] == 2
    company_report = next(t for t in admin_page["tickets"] if t["id"] == second.json()["id"])
    assert company_report["company_name"] == "Test company"
    assert company_report["reporter_email"] == "company@example.test"


def test_retry_is_idempotent_and_cannot_read_another_report(support_client):
    client, headers, _ = support_client
    payload = report()
    first = client.post("/support", json=payload, headers=headers["candidate"])
    retry = client.post("/support", json=payload, headers=headers["candidate"])
    assert first.json() == retry.json()
    assert client.get("/support", headers=headers["candidate"]).json()["total"] == 1
    assert client.post("/support", json=payload, headers=headers["company"]).status_code == 409


def test_admin_reply_status_filters_and_audit(support_client):
    client, headers, sessions = support_client
    ticket = client.post("/support", json=report(), headers=headers["candidate"]).json()
    for status in ("in_progress", "resolved", "open"):
        response = client.patch(f"/admin/support/{ticket['id']}", json={"status": status, "response": "Please try again; uploads are available."}, headers=headers["admin"])
        assert response.status_code == 200
        assert response.json()["status"] == status
        mine = client.get("/support", headers=headers["candidate"]).json()["tickets"][0]
        assert mine["response"] == "Please try again; uploads are available."
        assert mine["status"] == status
        assert client.get("/admin/support", params={"status": status}, headers=headers["admin"]).json()["total"] == 1
    assert client.get("/admin/support?status=resolved", headers=headers["admin"]).json()["total"] == 0

    async def logs():
        async with sessions() as db:
            return (await db.scalars(select(AdminActivityLog))).all()
    assert len(client.portal.call(logs)) == 3
    assert client.patch(f"/admin/support/{uuid.uuid4()}", json={"status": "resolved"}, headers=headers["admin"]).status_code == 404


@pytest.mark.parametrize("invalid", [
    {"subject": "     "}, {"description": " " * 30}, {"description": "x" * 5001},
    {"category": "invalid"}, {"reporter_id": str(uuid.uuid4())},
    {"company_id": str(uuid.uuid4())}, {"status": "resolved"},
    {"page_path": "https://example.com"}, {"page_path": "//example.com"},
    {"page_path": "/login?token=secret"}, {"page_path": "/page#secret"},
])
def test_invalid_or_spoofed_payload_is_rejected(support_client, invalid):
    client, headers, _ = support_client
    assert client.post("/support", json=report(**invalid), headers=headers["candidate"]).status_code == 422


def test_pagination_limits_and_rate_limit(support_client):
    client, headers, _ = support_client
    for i in range(5):
        assert client.post("/support", json=report(subject=f"Upload issue {i}"), headers=headers["candidate"]).status_code == 201
    assert client.post("/support", json=report(), headers=headers["candidate"]).status_code == 429
    first = client.get("/support?limit=2", headers=headers["candidate"]).json()
    second = client.get("/support?limit=2&offset=2", headers=headers["candidate"]).json()
    assert first["total"] == second["total"] == 5
    assert len(first["tickets"]) == len(second["tickets"]) == 2
    assert not ({t["id"] for t in first["tickets"]} & {t["id"] for t in second["tickets"]})
    assert client.get("/support?limit=500", headers=headers["candidate"]).status_code == 422
    assert client.get("/admin/support?status=unknown", headers=headers["admin"]).status_code == 422
    assert client.patch(f"/admin/support/{first['tickets'][0]['id']}", json={"status": "invalid"}, headers=headers["admin"]).status_code == 422


def test_migration_upgrade_and_downgrade():
    path = Path(__file__).resolve().parents[1] / "alembic/versions/ab1b2c3d4e5f_support_tickets.py"
    spec = importlib.util.spec_from_file_location("support_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            migration.upgrade()
            assert "support_tickets" in inspect(conn).get_table_names()
            assert len(inspect(conn).get_indexes("support_tickets")) == 2
            migration.downgrade()
            assert "support_tickets" not in inspect(conn).get_table_names()
