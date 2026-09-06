"""Comprehensive invitation flow tests — production-ready
Run: DATABASE_URL=... JWT_SECRET=... GEMINI_API_KEY=... python -m pytest apps/api/tests/test_employee_invitations.py -v
"""
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
import httpx
from sqlalchemy import select, text

from app.database import AsyncSessionLocal, engine
from app.models import User

BASE = "http://localhost:8001"

def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

def tok_for(user) -> str:
    from app.utils.jwt import create_access_token
    return create_access_token({"sub": str(user.id)})

@pytest.mark.asyncio
async def test_invitation_creation_authorized_and_validation():
    await engine.dispose()
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.email == "owner@coditent.com"))
        owner = res.scalar_one_or_none()
        if not owner:
            pytest.skip("owner not seeded")
    async with httpx.AsyncClient(base_url=BASE) as c:
        tok = tok_for(owner)
        r = await c.post("/invites/employee/invite", json={"email": "test-hr-1@example.com", "role": "HR"}, headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200, r.text
        r = await c.post("/invites/employee/invite", json={"email": "bademail", "role": "HR"}, headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 400
        r = await c.post("/invites/employee/invite", json={"email": "test-bad-role@example.com", "role": "PLATFORM_ADMIN"}, headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 400
        r = await c.post("/invites/employee/invite", json={"email": "test-owner@example.com", "role": "OWNER"}, headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 400

@pytest.mark.asyncio
async def test_unauthorized_user_cannot_invite():
    await engine.dispose()
    # Create a fresh candidate via API to avoid DB conversion issues
    email = f"tmp-cand-{uuid.uuid4().hex[:6]}@example.com"
    async with httpx.AsyncClient(base_url=BASE) as c:
        r = await c.post("/auth/register", json={"email": email, "password": "Pass12345!", "full_name": "Tmp Cand", "role": "CANDIDATE"})
        assert r.status_code == 200, r.text
        tok = r.json()["token"]
        # Try to invite as candidate
        r = await c.post("/invites/employee/invite", json={"email": "nope@example.com", "role": "HR"}, headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 403

@pytest.mark.asyncio
async def test_duplicate_active_invitation_blocked():
    await engine.dispose()
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.email == "owner@coditent.com"))
        owner = res.scalar_one()
    tok = tok_for(owner)
    email = f"dup-{uuid.uuid4().hex[:6]}@example.com"
    async with httpx.AsyncClient(base_url=BASE) as c:
        r = await c.post("/invites/employee/invite", json={"email": email, "role": "RECRUITER"}, headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200
        r = await c.post("/invites/employee/invite", json={"email": email, "role": "RECRUITER"}, headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 400
        assert "Active invitation" in r.text

@pytest.mark.asyncio
async def test_cross_company_isolation():
    await engine.dispose()
    inv_id = None
    async with AsyncSessionLocal() as db:
        owner = (await db.execute(select(User).where(User.email == "owner@coditent.com"))).scalar_one()
        token = secrets.token_urlsafe(32)
        h = _hash(token)
        exp = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=72)
        inv_id = str(uuid.uuid4())
        await db.execute(text("INSERT INTO employee_invitations (id, company_id, email, role, token_hash, status, invited_by, expires_at, created_at) VALUES (:id,:cid,:email,:role,:hash,'pending',:by,:exp, now())"),
                         {"id": inv_id, "cid": str(owner.company_id), "email": f"cross-{uuid.uuid4().hex[:4]}@example.com", "role": "HR", "hash": h, "by": str(owner.id), "exp": exp})
        await db.commit()
    async with httpx.AsyncClient(base_url=BASE) as c:
        r = await c.post(f"/invites/employee/invitations/{inv_id}/revoke")
        assert r.status_code in (401, 403, 404)
    # cleanup
    async with AsyncSessionLocal() as db:
        await db.execute(text("DELETE FROM employee_invitations WHERE id=:id"), {"id": inv_id})
        await db.commit()

@pytest.mark.asyncio
async def test_token_security_invalid_expired_revoked_reuse():
    await engine.dispose()
    token_exp = "exp-token-" + secrets.token_urlsafe(8)
    token_rev = "rev-token-" + secrets.token_urlsafe(8)
    # setup
    async with AsyncSessionLocal() as db:
        owner = (await db.execute(select(User).where(User.email == "owner@coditent.com"))).scalar_one()
        h_exp = _hash(token_exp)
        exp_past = datetime.utcnow() - timedelta(hours=1)
        inv_exp_id = str(uuid.uuid4())
        await db.execute(text("INSERT INTO employee_invitations (id, company_id, email, role, token_hash, status, invited_by, expires_at, created_at) VALUES (:id,:cid,:email,:role,:hash,'pending',:by,:exp, now())"),
                         {"id": inv_exp_id, "cid": str(owner.company_id), "email": "expired@example.com", "role": "HR", "hash": h_exp, "by": str(owner.id), "exp": exp_past})
        h_rev = _hash(token_rev)
        inv_rev_id = str(uuid.uuid4())
        exp_fut = datetime.utcnow() + timedelta(hours=72)
        await db.execute(text("INSERT INTO employee_invitations (id, company_id, email, role, token_hash, status, invited_by, expires_at, created_at) VALUES (:id,:cid,:email,:role,:hash,'revoked',:by,:exp, now())"),
                         {"id": inv_rev_id, "cid": str(owner.company_id), "email": "revoked@example.com", "role": "HR", "hash": h_rev, "by": str(owner.id), "exp": exp_fut})
        await db.commit()
    async with httpx.AsyncClient(base_url=BASE) as c:
        r = await c.post("/invites/employee/accept", json={"token": "totally-invalid-token-xyz", "password": "Pass12345!", "full_name": "Test"})
        assert r.status_code == 400
        r = await c.post("/invites/employee/accept", json={"token": token_exp, "password": "Pass12345!", "full_name": "Test"})
        assert r.status_code == 400
        assert "expired" in r.text.lower()
        r = await c.post("/invites/employee/accept", json={"token": token_rev, "password": "Pass12345!", "full_name": "Test"})
        assert r.status_code == 400
    # cleanup
    async with AsyncSessionLocal() as db:
        await db.execute(text("DELETE FROM employee_invitations WHERE id IN (:a, :b)"), {"a": inv_exp_id, "b": inv_rev_id})
        await db.commit()

@pytest.mark.asyncio
async def test_new_user_account_creation_and_role_protection():
    await engine.dispose()
    email = f"newhire-{uuid.uuid4().hex[:6]}@example.com"
    token = "newhire-token-" + secrets.token_urlsafe(16)
    h = _hash(token)
    async with AsyncSessionLocal() as db:
        owner = (await db.execute(select(User).where(User.email == "owner@coditent.com"))).scalar_one()
        exp = datetime.utcnow() + timedelta(hours=72)
        await db.execute(text("INSERT INTO employee_invitations (id, company_id, email, role, token_hash, status, invited_by, expires_at, created_at) VALUES (:id,:cid,:email,:role,:hash,'pending',:by,:exp, now())"),
                         {"id": str(uuid.uuid4()), "cid": str(owner.company_id), "email": email, "role": "HR", "hash": h, "by": str(owner.id), "exp": exp})
        await db.commit()
    async with httpx.AsyncClient(base_url=BASE) as c:
        r = await c.post("/invites/employee/accept", json={"token": token, "password": "SecurePass123!", "full_name": "New Hire", "role": "PLATFORM_ADMIN", "company_id": "00000000-0000-0000-0000-000000000000"})
        assert r.status_code == 200
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.email == email))
        user = res.scalar_one()
        assert user.company_role == "HR"
        assert user.role.value == "COMPANY_USER"
        owner = (await db.execute(select(User).where(User.email == "owner@coditent.com"))).scalar_one()
        assert str(user.company_id) == str(owner.company_id)
        assert user.password_hash != "SecurePass123!"
        assert user.password_hash.startswith("$2b$")
        await db.execute(text("DELETE FROM users WHERE email=:e"), {"e": email})
        await db.execute(text("DELETE FROM employee_invitations WHERE token_hash=:h"), {"h": h})
        await db.commit()

@pytest.mark.asyncio
async def test_existing_user_acceptance_no_duplicate():
    await engine.dispose()
    from passlib.context import CryptContext
    pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
    email = f"exist-{uuid.uuid4().hex[:6]}@example.com"
    uid = uuid.uuid4()
    async with AsyncSessionLocal() as db:
        u = User(id=uid, email=email, password_hash=pwd.hash("Pass12345!"), full_name="Exist User", role="CANDIDATE", is_approved=True)
        db.add(u)
        await db.commit()
    # create invite
    token = "exist-token-" + secrets.token_urlsafe(16)
    h = _hash(token)
    async with AsyncSessionLocal() as db:
        owner = (await db.execute(select(User).where(User.email == "owner@coditent.com"))).scalar_one()
        exp = datetime.utcnow() + timedelta(hours=72)
        await db.execute(text("INSERT INTO employee_invitations (id, company_id, email, role, token_hash, status, invited_by, expires_at, created_at) VALUES (:id,:cid,:email,:role,:hash,'pending',:by,:exp, now())"),
                         {"id": str(uuid.uuid4()), "cid": str(owner.company_id), "email": email, "role": "RECRUITER", "hash": h, "by": str(owner.id), "exp": exp})
        await db.commit()
    from app.utils.jwt import create_access_token
    tok = create_access_token({"sub": str(uid)})
    async with httpx.AsyncClient(base_url=BASE) as c:
        r = await c.post("/invites/employee/accept-existing", json={"token": token}, headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200, r.text
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.email == email))
        users = res.scalars().all()
        assert len(users) == 1
        assert users[0].company_role == "RECRUITER"
        assert users[0].role.value == "COMPANY_USER"
        await db.execute(text("DELETE FROM users WHERE email=:e"), {"e": email})
        await db.execute(text("DELETE FROM employee_invitations WHERE token_hash=:h"), {"h": h})
        await db.commit()

@pytest.mark.asyncio
async def test_email_mismatch_rejected():
    await engine.dispose()
    token = "mismatch-token-" + secrets.token_urlsafe(16)
    h = _hash(token)
    async with AsyncSessionLocal() as db:
        owner = (await db.execute(select(User).where(User.email == "owner@coditent.com"))).scalar_one()
        exp = datetime.utcnow() + timedelta(hours=72)
        await db.execute(text("INSERT INTO employee_invitations (id, company_id, email, role, token_hash, status, invited_by, expires_at, created_at) VALUES (:id,:cid,:email,:role,:hash,'pending',:by,:exp, now())"),
                         {"id": str(uuid.uuid4()), "cid": str(owner.company_id), "email": "victim@example.com", "role": "HR", "hash": h, "by": str(owner.id), "exp": exp})
        await db.commit()
        from app.utils.jwt import create_access_token
        tok = create_access_token({"sub": str(owner.id)})
    async with httpx.AsyncClient(base_url=BASE) as c:
        r = await c.post("/invites/employee/accept-existing", json={"token": token}, headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 403
        assert "does not match" in r.text
    async with AsyncSessionLocal() as db:
        await db.execute(text("DELETE FROM employee_invitations WHERE token_hash=:h"), {"h": h})
        await db.commit()

@pytest.mark.asyncio
async def test_email_sending_mocked():
    await engine.dispose()
    async with AsyncSessionLocal() as db:
        owner = (await db.execute(select(User).where(User.email == "owner@coditent.com"))).scalar_one()
    tok = tok_for(owner)
    with patch("app.routers.invitations._send_employee_invite_email_safe") as mock_send:
        async with httpx.AsyncClient(base_url=BASE) as c:
            email = f"mock-{uuid.uuid4().hex[:6]}@example.com"
            r = await c.post("/invites/employee/invite", json={"email": email, "role": "HR"}, headers={"Authorization": f"Bearer {tok}"})
            assert r.status_code == 200
            assert mock_send.called
            call_args = mock_send.call_args[0]
            assert call_args[0] == email
            assert len(call_args[3]) > 20
    # cleanup
    async with AsyncSessionLocal() as db:
        await db.execute(text("DELETE FROM employee_invitations WHERE email=:e"), {"e": email})
        await db.commit()

@pytest.mark.asyncio
async def test_resend_invalidates_old():
    await engine.dispose()
    email = f"resend-{uuid.uuid4().hex[:6]}@example.com"
    token_old = "resend-old-" + secrets.token_urlsafe(16)
    h_old = _hash(token_old)
    inv_id = str(uuid.uuid4())
    async with AsyncSessionLocal() as db:
        owner = (await db.execute(select(User).where(User.email == "owner@coditent.com"))).scalar_one()
        exp = datetime.utcnow() + timedelta(hours=72)
        await db.execute(text("INSERT INTO employee_invitations (id, company_id, email, role, token_hash, status, invited_by, expires_at, created_at) VALUES (:id,:cid,:email,:role,:hash,'pending',:by,:exp, now())"),
                         {"id": inv_id, "cid": str(owner.company_id), "email": email, "role": "HR", "hash": h_old, "by": str(owner.id), "exp": exp})
        await db.commit()
    async with AsyncSessionLocal() as db:
        owner = (await db.execute(select(User).where(User.email == "owner@coditent.com"))).scalar_one()
        tok = tok_for(owner)
    async with httpx.AsyncClient(base_url=BASE) as c:
        r = await c.post("/invites/employee/resend", json={"invitation_id": inv_id}, headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200
        r = await c.post("/invites/employee/accept", json={"token": token_old, "password": "Pass12345!", "full_name": "Test"})
        assert r.status_code == 400
    async with AsyncSessionLocal() as db:
        row = await db.execute(text("SELECT status FROM employee_invitations WHERE id=:id"), {"id": inv_id})
        assert row.mappings().first()["status"] == "revoked"
        await db.execute(text("DELETE FROM employee_invitations WHERE email=:e"), {"e": email})
        await db.commit()
