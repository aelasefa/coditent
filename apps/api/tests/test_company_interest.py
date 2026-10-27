"""Public company-interest queue tests using isolated in-memory storage."""

import uuid
from contextlib import asynccontextmanager

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.database import Base, get_db
from app.dependencies import require_platform_admin
from app.limiter import limiter
from app.models import AdminActivityLog, Company, CompanyInterestRequest, User, UserRole
from app.routers.company_interest import router


@pytest.fixture
def company_interest_client():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    admin = User(
        id=uuid.uuid4(),
        email="admin@example.test",
        full_name="Admin",
        password_hash="unused",
        role=UserRole.PLATFORM_ADMIN,
        is_approved=True,
        is_active=True,
        auth_version=0,
    )

    @asynccontextmanager
    async def lifespan(app):
        async with engine.begin() as connection:
            await connection.run_sync(
                lambda sync_connection: Base.metadata.create_all(
                    sync_connection,
                    tables=[Company.__table__, User.__table__, CompanyInterestRequest.__table__, AdminActivityLog.__table__],
                )
            )
        async with sessions() as db:
            db.add(admin)
            await db.commit()
        yield
        await engine.dispose()

    async def db_override():
        async with sessions() as db:
            yield db

    async def admin_override():
        return admin

    app = FastAPI(lifespan=lifespan)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[require_platform_admin] = admin_override
    app.include_router(router)
    limiter.reset()
    with TestClient(app) as client:
        yield client, sessions
    limiter.reset()


def test_public_submission_is_normalized_and_idempotent(company_interest_client):
    client, sessions = company_interest_client
    first = client.post("/company-interest", json={"email": "  Hiring@Example.COM "})
    duplicate = client.post("/company-interest", json={"email": "hiring@example.com"})

    assert first.status_code == duplicate.status_code == 202
    assert "contact you" in first.json()["detail"]

    async def stored_request():
        async with sessions() as db:
            count = await db.scalar(select(func.count()).select_from(CompanyInterestRequest))
            request = await db.scalar(select(CompanyInterestRequest))
            return count, request

    import asyncio

    count, request = asyncio.run(stored_request())
    assert count == 1
    assert request.email == "hiring@example.com"
    assert request.status == "pending"


def test_admin_can_review_and_dismiss_request(company_interest_client):
    client, _ = company_interest_client
    assert client.post("/company-interest", json={"email": "team@example.com"}).status_code == 202
    page = client.get("/admin/company-interest")
    assert page.status_code == 200
    request_id = page.json()["requests"][0]["id"]

    dismissed = client.patch(
        f"/admin/company-interest/{request_id}",
        json={"status": "dismissed"},
    )
    assert dismissed.status_code == 200
    assert dismissed.json()["status"] == "dismissed"
    assert dismissed.json()["reviewed_at"] is not None


def test_invalid_company_email_is_rejected(company_interest_client):
    client, _ = company_interest_client
    response = client.post("/company-interest", json={"email": "not-an-email"})
    assert response.status_code == 422
