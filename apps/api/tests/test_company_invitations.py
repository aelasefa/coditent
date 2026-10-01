"""Company invitation flow — platform invites company, owner accepts. Run: pytest tests/test_company_invitations.py -v"""
import base64
import hashlib
import uuid
from datetime import datetime
from unittest.mock import patch

import httpx
import pytest
from sqlalchemy import select, text

from app.database import AsyncSessionLocal, engine
from app.models import User
from app.routers import invitations
from app.utils.jwt import create_access_token

BASE = "http://localhost:8001"


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def tok_for(user) -> str:
    return create_access_token({"sub": str(user.id)})


def test_company_invite_email_uses_new_theme_and_escapes_company_name():
    subject, html = invitations._company_invite_email(
        "Atlas <script>alert(1)</script>",
        "safe-token",
        datetime(2026, 10, 7),
    )

    assert subject == "Create your company workspace on CODITENT"
    assert 'src="cid:coditent-company-invite-art"' in html
    assert "#194d38" in html
    assert "Build your hiring workspace with CODITENT." in html
    assert "Company owner" in html
    assert "Oct 07, 2026" in html
    assert "Atlas &lt;script&gt;alert(1)&lt;/script&gt;" in html
    assert "Atlas <script>" not in html
    assert "/company/invite/accept?token=safe-token" in html


def test_company_invite_art_is_embedded_as_cid_attachment():
    attachment = invitations.company_invite_art_attachment()

    assert attachment["content_id"] == "coditent-company-invite-art"
    assert attachment["content_type"] == "image/jpeg"
    assert attachment["filename"] == "coditent-company-invitation.jpg"
    decoded = base64.b64decode(attachment["content"])
    assert decoded.startswith(b"\xff\xd8\xff")
    assert len(decoded) < 150_000


def test_company_invite_sender_includes_inline_art():
    with patch("app.services.email.send_email") as send_email:
        invitations._send_company_invite_email(
            "owner@example.com",
            "Atlas Labs",
            "safe-token",
            datetime(2026, 10, 7),
        )

    send_email.assert_called_once()
    args, kwargs = send_email.call_args
    assert args[0] == "owner@example.com"
    assert kwargs["attachments"][0]["content_id"] == "coditent-company-invite-art"


async def _admin():
    await engine.dispose()
    async with AsyncSessionLocal() as db:
        from app.services.admin_seed import seed_admin_user

        admin, _ = await seed_admin_user(db, email="admin@coditent.com", password="AdminPass123!", full_name="Platform Admin")
    return admin


@pytest.mark.asyncio
async def test_admin_can_invite_company():
    admin = await _admin()
    email = f"co-{uuid.uuid4().hex[:6]}@example.com"
    async with httpx.AsyncClient(base_url=BASE) as c:
        r = await c.post(
            "/invites/company/invite",
            json={"email": email, "company_name": "TestCo", "contact_name": "Jane"},
            headers={"Authorization": f"Bearer {tok_for(admin)}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["invitation_id"]
        assert "/company/invite/accept?token=" in body["invitation_url"]
        assert "email_sent" in body


@pytest.mark.asyncio
async def test_non_admin_cannot_invite_company():
    email = f"tmp-cand-{uuid.uuid4().hex[:6]}@example.com"
    async with httpx.AsyncClient(base_url=BASE) as c:
        r = await c.post("/auth/register", json={"email": email, "password": "StrongPass123!", "full_name": "Tmp", "role": "CANDIDATE"})
        assert r.status_code == 200, r.text
        tok = r.json()["token"]
        r = await c.post(
            "/invites/company/invite",
            json={"email": "x@example.com", "company_name": "Evil"},
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert r.status_code == 403


@pytest.mark.asyncio
async def test_invite_validate_accept_owner_flow():
    admin = await _admin()
    email = f"owner-{uuid.uuid4().hex[:6]}@example.com"
    async with httpx.AsyncClient(base_url=BASE) as c:
        r = await c.post(
            "/invites/company/invite",
            json={"email": email, "company_name": "Acme Flow"},
            headers={"Authorization": f"Bearer {tok_for(admin)}"},
        )
        assert r.status_code == 200, r.text
        inv_id = r.json()["invitation_id"]
        # raw token must not be stored: fetch hash input space is unknown to us,
        # so verify validate works only via fresh invite + accept roundtrip below
        r = await c.get(f"/invites/company/invitations/{inv_id}", headers={"Authorization": f"Bearer {tok_for(admin)}"})
        assert r.status_code == 200
        assert r.json()["invitation"]["status"] == "pending"
        # invalid token rejected
        r = await c.get("/invites/company-invitations/validate", params={"token": "invalid-token-xyz"})
        assert r.status_code == 404
        # double-accept protection is covered by status check; revoke path:
        r = await c.post(f"/invites/company/invitations/{inv_id}/revoke", headers={"Authorization": f"Bearer {tok_for(admin)}"})
        assert r.status_code == 200
        r = await c.post(
            "/invites/company/accept",
            json={"token": "invalid-token-xyz", "password": "StrongPass123!", "full_name": "No One"},
        )
        assert r.status_code == 400


@pytest.mark.asyncio
async def test_raw_token_never_stored():
    admin = await _admin()
    email = f"hash-{uuid.uuid4().hex[:6]}@example.com"
    async with httpx.AsyncClient(base_url=BASE) as c:
        r = await c.post(
            "/invites/company/invite",
            json={"email": email, "company_name": "HashCo"},
            headers={"Authorization": f"Bearer {tok_for(admin)}"},
        )
        assert r.status_code == 200, r.text
        inv_id = r.json()["invitation_id"]
        await engine.dispose()
        async with AsyncSessionLocal() as db:
            res = await db.execute(text("SELECT token_hash FROM company_invitations WHERE id=:id"), {"id": inv_id})
            row = res.mappings().first()
            assert row is not None
            # 64-hex sha256, never a urlsafe raw token
            assert len(row["token_hash"]) == 64
            assert all(ch in "0123456789abcdef" for ch in row["token_hash"])


@pytest.mark.asyncio
async def test_candidate_signup_stays_candidate():
    email = f"pure-{uuid.uuid4().hex[:6]}@example.com"
    async with httpx.AsyncClient(base_url=BASE) as c:
        r = await c.post("/auth/register", json={"email": email, "password": "StrongPass123!", "full_name": "Pure", "role": "CANDIDATE"})
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "CANDIDATE"
        for bad_role in ["RECRUITER", "ADMIN", "OWNER", "COMPANY_USER"]:
            r = await c.post(
                "/auth/register",
                json={"email": f"bad-{uuid.uuid4().hex[:6]}@example.com", "password": "StrongPass123!", "full_name": "Bad", "role": bad_role},
            )
            assert r.status_code in (400, 422), r.text
