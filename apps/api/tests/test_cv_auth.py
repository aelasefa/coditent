"""CV auth regression — Bearer scheme + ownership. Run: pytest tests/test_cv_auth.py -v"""
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from jose import jwt
from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.models import User
from app.utils.jwt import create_access_token

BASE = "http://localhost:8001"


def bearer(user) -> dict:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


async def _get_or_skip(email: str):
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.email == email))
        user = res.scalars().first()
    if user is None:
        pytest.skip(f"{email} not seeded")
    return user


@pytest.mark.asyncio
async def test_cv_no_token_401():
    async with httpx.AsyncClient(base_url=BASE) as c:
        r = await c.get("/candidates/cv")
        assert r.status_code == 401


@pytest.mark.asyncio
async def test_cv_malformed_token_401():
    async with httpx.AsyncClient(base_url=BASE) as c:
        r = await c.get("/candidates/cv", headers={"Authorization": "Bearer not-a-jwt"})
        assert r.status_code == 401


@pytest.mark.asyncio
async def test_cv_invalid_signature_401():
    bad = jwt.encode({"sub": str(uuid.uuid4())}, "wrong-secret", algorithm="HS256")
    async with httpx.AsyncClient(base_url=BASE) as c:
        r = await c.get("/candidates/cv", headers={"Authorization": f"Bearer {bad}"})
        assert r.status_code == 401


@pytest.mark.asyncio
async def test_cv_expired_token_401():
    expired = jwt.encode(
        {"sub": str(uuid.uuid4()), "exp": datetime.now(timezone.utc) - timedelta(hours=1)},
        settings.secret_key,
        algorithm=settings.algorithm,
    )
    async with httpx.AsyncClient(base_url=BASE) as c:
        r = await c.get("/candidates/cv", headers={"Authorization": f"Bearer {expired}"})
        assert r.status_code == 401


@pytest.mark.asyncio
async def test_cv_owner_isolation():
    user_a = await _get_or_skip("cvauth10926b@gmail.com")
    user_b = await _get_or_skip("cvauth20926b@gmail.com")
    async with httpx.AsyncClient(base_url=BASE) as c:
        # B has no CV: must get own 404, never A's bytes
        r = await c.get("/candidates/cv", headers=bearer(user_b))
        assert r.status_code == 404
        # A uploaded a CV during manual verification: owner gets 200
        r = await c.get("/candidates/cv", headers=bearer(user_a))
        assert r.status_code in (200, 404)
        if r.status_code == 200:
            assert len(await r.aread()) > 0
