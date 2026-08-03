"""End-to-end smoke test for the applications feature.

Runs against an in-memory SQLite database; creates tables via Alembic-style
SQL using Base.metadata.create_all. Exports no test framework dependencies.

Usage:
    PYTHONPATH=apps/api \
    DATABASE_URL='sqlite+aiosqlite:///:memory:' \
    JWT_SECRET=test GEMINI_API_KEY=test \
    apps/api/venv/bin/python apps/api/scripts/test_applications_flow.py
"""
from __future__ import annotations

import asyncio
import os
import sys
import uuid

from httpx import ASGITransport, AsyncClient

# Ensure clean env for local run
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "test")
os.environ.setdefault("GEMINI_API_KEY", "test")
os.environ.setdefault("ACCESS_TOKEN_COOKIE_SECURE", "false")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from app import main as main_module  # noqa: E402
from app.database import AsyncSessionLocal, Base, engine  # noqa: E402
from app.models import (  # noqa: E402
    Application,
    ApplicationStatus,
    CandidateProfile,
    Offer,
    OfferType,
    StudyLevel,
    User,
    UserRole,
)
from app.utils.jwt import create_access_token  # noqa: E402
from passlib.context import CryptContext  # noqa: E402


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def banner(text: str) -> None:
    print(f"\n=== {text} ===")


async def seed() -> tuple[str, str, str]:
    """Create one candidate, one recruiter, and one offer. Return tokens+offer id."""
    async with AsyncSessionLocal() as db:  # type: AsyncSession
        candidate = User(
            email="candidate@coditent.test",
            password_hash=pwd_context.hash("superpassword"),
            role=UserRole.CANDIDATE,
            is_approved=True,
            full_name="Candidate Test",
        )
        recruiter = User(
            email="recruiter@coditent.test",
            password_hash=pwd_context.hash("superpassword"),
            role=UserRole.RECRUITER,
            is_approved=True,
            full_name="Recruiter Test",
        )
        db.add_all([candidate, recruiter])
        await db.flush()
        candidate_profile = CandidateProfile(
            user_id=candidate.id,
            city="Casablanca",
            phone="+212600000000",
            headline="Backend Engineer focused on fast APIs",
            bio="I build reliable Python services and love async patterns.",
            field_of_study="Software Engineering",
            university="ENSIAS",
            study_level=StudyLevel.MASTER,
            skills="Python, FastAPI, PostgreSQL, Docker",
            years_of_experience=3,
            linkedin_url="https://www.linkedin.com/in/candidate-test",
            portfolio_url="https://example.com/portfolio",
        )
        db.add(candidate_profile)
        offer = Offer(
            recruiter_id=recruiter.id,
            title="Backend Engineer",
            company="TestCorp",
            region="Casablanca",
            field="Software Engineering",
            type=OfferType.JOB,
            description="Build APIs with FastAPI and ship fast.",
            requirements="Python, FastAPI, async, testing discipline.",
            active=True,
        )
        db.add(offer)
        await db.commit()
        await db.refresh(offer)

        cand_token = create_access_token(
            {"sub": str(candidate.id), "email": candidate.email, "role": "CANDIDATE"}
        )
        recr_token = create_access_token(
            {"sub": str(recruiter.id), "email": recruiter.email, "role": "RECRUITER"}
        )
        return cand_token, recr_token, str(offer.id)


async def run() -> None:
    banner("Creating schema")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("OK: tables created")

    cand_token, recr_token, offer_id = await seed()
    print(f"OK: candidate + recruiter + offer {offer_id} seeded")

    transport = ASGITransport(app=main_module.app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        cand_headers = {"Authorization": f"Bearer {cand_token}"}
        recr_headers = {"Authorization": f"Bearer {recr_token}"}

        banner("1) Candidate applies")
        r = await client.post(
            f"/offers/{offer_id}/apply",
            json={"cover_letter": "I am excited about this role."},
            headers=cand_headers,
        )
        print("status:", r.status_code, "body:", r.json())
        assert r.status_code == 200, r.text
        application = r.json()
        app_id = application["id"]
        assert application["status"] == "PENDING"
        assert application["offer"]["id"] == offer_id

        banner("2) Candidate applies AGAIN (idempotent)")
        r = await client.post(
            f"/offers/{offer_id}/apply", json={}, headers=cand_headers
        )
        print("status:", r.status_code)
        assert r.status_code == 200
        assert r.json()["id"] == app_id

        banner("3) Anonymous cannot apply")
        r = await client.post(f"/offers/{offer_id}/apply", json={})
        print("status:", r.status_code, "body:", r.json())
        assert r.status_code == 401, r.text

        banner("4) Candidate cannot list offer applicants (recruiter-only)")
        r = await client.get(
            f"/offers/{offer_id}/applications", headers=cand_headers
        )
        print("status:", r.status_code)
        assert r.status_code == 403, r.text

        banner("5) Recruiter lists applicants")
        r = await client.get(
            f"/offers/{offer_id}/applications", headers=recr_headers
        )
        print("status:", r.status_code, "body:", r.json())
        assert r.status_code == 200, r.text
        apps = r.json()["applications"]
        assert len(apps) == 1
        assert apps[0]["candidate"]["email"] == "candidate@coditent.test"

        banner("5b) Recruiter can see full candidate profile")
        profile = apps[0].get("candidate_profile")
        assert profile is not None, "candidate_profile missing from response"
        assert profile["headline"] == "Backend Engineer focused on fast APIs"
        assert profile["bio"].startswith("I build reliable Python services")
        assert profile["field_of_study"] == "Software Engineering"
        assert profile["university"] == "ENSIAS"
        assert profile["study_level"] == "MASTER"
        assert profile["skills"] == "Python, FastAPI, PostgreSQL, Docker"
        assert profile["years_of_experience"] == 3
        assert profile["city"] == "Casablanca"
        assert profile["linkedin_url"] == "https://www.linkedin.com/in/candidate-test"
        assert profile["portfolio_url"] == "https://example.com/portfolio"
        assert apps[0]["candidate"]["email"] in ("candidate@coditent.test",)
        print("OK: recruiter sees complete candidate profile")

        banner("6) Recruiter updates status to REVIEWED")
        r = await client.patch(
            f"/applications/{app_id}/status",
            json={"status": "REVIEWED", "recruiter_note": "Looks promising."},
            headers=recr_headers,
        )
        print("status:", r.status_code)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "REVIEWED"
        assert r.json()["recruiter_note"] == "Looks promising."

        banner("7) Candidate sees REVIEWED in /me/applications")
        r = await client.get("/me/applications", headers=cand_headers)
        print("status:", r.status_code)
        assert r.status_code == 200
        items = r.json()["applications"]
        assert len(items) == 1
        assert items[0]["status"] == "REVIEWED"

        banner("8) Recruiter cannot fetch another offer's application (unknown offer)")
        r = await client.get(
            "/applications/00000000-0000-0000-0000-000000000000",
            headers=recr_headers,
        )
        print("status:", r.status_code)
        assert r.status_code == 404

        banner("9) Candidate withdraws application")
        r = await client.delete(f"/applications/{app_id}", headers=cand_headers)
        print("status:", r.status_code, "body:", r.json())
        assert r.status_code == 200
        assert r.json()["status"] == "WITHDRAWN"

        banner("10) Candidate re-applies after withdrawal")
        r = await client.post(
            f"/offers/{offer_id}/apply",
            json={"cover_letter": "Reapplying after withdrawing."},
            headers=cand_headers,
        )
        print("status:", r.status_code)
        assert r.status_code == 200
        assert r.json()["status"] == "PENDING"
        assert r.json()["id"] == app_id

        banner("11) Applying to non-existent offer 404s")
        bogus = str(uuid.uuid4())
        r = await client.post(
            f"/offers/{bogus}/apply", json={}, headers=cand_headers
        )
        print("status:", r.status_code)
        assert r.status_code == 404, r.text

    print("\nAll application-flow checks passed 🎉")


if __name__ == "__main__":
    asyncio.run(run())
