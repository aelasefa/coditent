import httpx, pytest, asyncio, uuid, hashlib
from sqlalchemy import select, text
from app.database import AsyncSessionLocal
from app.models import User
from app.utils.jwt import create_access_token

BASE = "http://localhost:8001"

@pytest.fixture
async def client():
    async with httpx.AsyncClient(base_url=BASE) as c:
        yield c

def tok_for(user):
    return create_access_token({"sub": str(user.id)})

@pytest.mark.asyncio
async def test_health():
    async with httpx.AsyncClient(base_url=BASE) as c:
        r = await c.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

@pytest.mark.asyncio
async def test_offers_public():
    async with httpx.AsyncClient(base_url=BASE) as c:
        r = await c.get("/offers")
        assert r.status_code == 200
        assert "offers" in r.json()

@pytest.mark.asyncio
async def test_cross_company_offer_isolation():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.email.in_(["owner-a@test.local","owner-b@test.local"])))
        mp = {u.email: u for u in res.scalars().all()}
        if len(mp) < 2:
            pytest.skip("test companies not seeded")
        # Ensure offers exist
        res = await db.execute(text("SELECT id FROM offers WHERE company_id=:cid LIMIT 1"), {"cid": str(mp["owner-a@test.local"].company_id)})
        row = res.mappings().first()
        if not row:
            pytest.skip("no offer for A")
        oa_id = row["id"]
        res = await db.execute(text("SELECT id FROM offers WHERE company_id=:cid LIMIT 1"), {"cid": str(mp["owner-b@test.local"].company_id)})
        row = res.mappings().first()
        if not row:
            pytest.skip("no offer for B")
        ob_id = row["id"]
    async with httpx.AsyncClient(base_url=BASE) as c:
        t_a = tok_for(mp["owner-a@test.local"])
        r = await c.get(f"/offers/{oa_id}", headers={"Authorization": f"Bearer {t_a}"})
        assert r.status_code == 200
        r = await c.get(f"/offers/{ob_id}", headers={"Authorization": f"Bearer {t_a}"})
        assert r.status_code == 404

@pytest.mark.asyncio
async def test_invitation_role_matrix():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.email.in_(["owner-a@test.local","hr-a@test.local"])))
        mp = {u.email: u for u in res.scalars().all()}
        if "owner-a@test.local" not in mp:
            pytest.skip("no test users")
    async with httpx.AsyncClient(base_url=BASE) as c:
        # OWNER can invite
        r = await c.post("/invites/employee/invite", json={"email": f"pytest-{uuid.uuid4().hex[:4]}@example.com", "role": "HR"}, headers={"Authorization": f"Bearer {tok_for(mp['owner-a@test.local'])}"})
        assert r.status_code == 200
        # HR cannot
        if "hr-a@test.local" in mp:
            r = await c.post("/invites/employee/invite", json={"email": f"pytest-{uuid.uuid4().hex[:4]}@example.com", "role": "HR"}, headers={"Authorization": f"Bearer {tok_for(mp['hr-a@test.local'])}"})
            assert r.status_code == 403

@pytest.mark.asyncio
async def test_candidate_cannot_escalate():
    async with httpx.AsyncClient(base_url=BASE) as c:
        # Register as candidate, try to use company endpoint
        email = f"pytest-cand-{uuid.uuid4().hex[:6]}@example.com"
        r = await c.post("/auth/register", json={"email": email, "password":"Pass12345!","full_name":"Test","role":"CANDIDATE"})
        assert r.status_code == 200
        token = r.json()["token"]
        # Try to access company members
        async with AsyncSessionLocal() as db:
            res = await db.execute(text("SELECT id FROM companies LIMIT 1"))
            cid = res.mappings().first()["id"]
        r = await c.get(f"/companies/{cid}/members", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code in (403, 404)
