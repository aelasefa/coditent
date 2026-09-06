"""Focused RBAC regression — mirrors Docker manual suite. Run: pytest tests/test_security.py -v"""
import httpx, pytest, uuid, hashlib
from sqlalchemy import select, text
from app.database import AsyncSessionLocal
from app.models import User
from app.utils.jwt import create_access_token
from app.core.permissions import can

BASE = "http://localhost:8001"

def tok(user): return create_access_token({"sub": str(user.id)})

@pytest.mark.asyncio
async def test_rbac_matrix():
    assert can("OWNER", "create_offers") is True
    assert can("ADMIN", "create_offers") is True
    assert can("RECRUITER", "create_offers") is True
    assert can("HR", "create_offers") is False
    assert can("HIRING_MANAGER", "create_offers") is False
    assert can("OWNER", "invite_employees") is True
    assert can("ADMIN", "invite_employees") is True
    for r in ["HR", "RECRUITER", "HIRING_MANAGER"]:
        assert can(r, "invite_employees") is False

@pytest.mark.asyncio
async def test_cross_company_offer_isolation():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.email.in_(["owner-a@test.local", "owner-b@test.local"])))
        mp = {u.email: u for u in res.scalars().all()}
        if len(mp) < 2:
            pytest.skip("test companies not seeded")
        res = await db.execute(text("SELECT id FROM offers WHERE company_id=:cid LIMIT 1"), {"cid": str(mp["owner-a@test.local"].company_id)})
        oa = res.mappings().first()
        res = await db.execute(text("SELECT id FROM offers WHERE company_id=:cid LIMIT 1"), {"cid": str(mp["owner-b@test.local"].company_id)})
        ob = res.mappings().first()
        if not oa or not ob:
            pytest.skip("offers not seeded")
        async with httpx.AsyncClient(base_url=BASE) as c:
            r = await c.get(f"/offers/{oa['id']}", headers={"Authorization": f"Bearer {tok(mp['owner-a@test.local'])}"})
            assert r.status_code == 200
            r = await c.get(f"/offers/{ob['id']}", headers={"Authorization": f"Bearer {tok(mp['owner-a@test.local'])}"})
            assert r.status_code == 404

@pytest.mark.asyncio
async def test_invitation_role_matrix():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.email.in_(["owner-a@test.local", "hr-a@test.local"])))
        mp = {u.email: u for u in res.scalars().all()}
        if "owner-a@test.local" not in mp:
            pytest.skip("no owner")
        async with httpx.AsyncClient(base_url=BASE) as c:
            r = await c.post("/invites/employee/invite", json={"email": f"pytest-{uuid.uuid4().hex[:4]}@example.com", "role": "HR"}, headers={"Authorization": f"Bearer {tok(mp['owner-a@test.local'])}"})
            assert r.status_code == 200
            if "hr-a@test.local" in mp:
                r = await c.post("/invites/employee/invite", json={"email": f"pytest-{uuid.uuid4().hex[:4]}@example.com", "role": "HR"}, headers={"Authorization": f"Bearer {tok(mp['hr-a@test.local'])}"})
                assert r.status_code == 403

@pytest.mark.asyncio
async def test_legacy_join_deprecated():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.email == "owner-a@test.local"))
        u = res.scalar_one_or_none()
        if not u:
            pytest.skip("no user")
        res = await db.execute(text("SELECT id FROM companies LIMIT 1"))
        cid = res.mappings().first()["id"]
    async with httpx.AsyncClient(base_url=BASE) as c:
        r = await c.post(f"/companies/{cid}/join", headers={"Authorization": f"Bearer {tok(u)}"})
        assert r.status_code == 410
        assert "invitation-only" in r.text

@pytest.mark.asyncio
async def test_mass_assignment_rejected():
    async with httpx.AsyncClient(base_url=BASE) as c:
        r = await c.post("/auth/register", json={"email": f"bad-{uuid.uuid4().hex[:4]}@example.com", "password": "Pass12345!", "full_name": "Bad", "role": "COMPANY_USER"})
        assert r.status_code == 422
