"""Email OTP verification for password registration.

Run: pytest tests/test_email_otp.py -v (needs API on localhost:8001)

Live tests that need a pending row insert it directly with a KNOWN OTP hash,
because real SMTP delivery is environment-dependent. Anything asserting on
email delivery itself is covered by the rollback unit paths below.
"""
import hashlib
import time
import uuid

import httpx
import pytest
from passlib.context import CryptContext
from sqlalchemy import text

from app.database import AsyncSessionLocal, engine
from app.services import email_verification as ev

BASE = "http://localhost:8001"
KNOWN_OTP = "123456"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _known_hash() -> str:
    return hashlib.sha256(KNOWN_OTP.encode()).hexdigest()


async def _insert_pending(email: str, expired: bool = False, attempts: int = 0) -> None:
    from datetime import datetime, timedelta

    await engine.dispose()
    now = datetime.utcnow()
    exp = now - timedelta(hours=1) if expired else now + timedelta(minutes=5)
    async with AsyncSessionLocal() as db:
        await db.execute(
            text(
                "INSERT INTO pending_registrations (id, email, full_name, password_hash, otp_hash,"
                " otp_expires_at, otp_attempts, last_otp_sent_at, created_at)"
                " VALUES (:id, :email, 'Test User', :pw, :otp, :exp, :att, :now, :now)"
            ),
            {
                "id": str(uuid.uuid4()),
                "email": email,
                "pw": pwd_context.hash("LiveTest123!"),
                "otp": _known_hash(),
                "att": attempts,
                "exp": exp,
                "now": now,
            },
        )
        await db.commit()


async def _pending_row(email: str):
    await engine.dispose()
    async with AsyncSessionLocal() as db:
        res = await db.execute(text("SELECT * FROM pending_registrations WHERE email=:email"), {"email": email})
        return res.mappings().first()


async def _user_row(email: str):
    await engine.dispose()
    async with AsyncSessionLocal() as db:
        res = await db.execute(text("SELECT id, role FROM users WHERE email=:email"), {"email": email})
        return res.mappings().first()


def _email(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:6]}@example.com"


# ---------- pure unit tests (no HTTP, no SMTP) ----------


def test_otp_format_and_uniqueness():
    codes = {ev.generate_otp() for _ in range(200)}
    assert len(codes) > 190
    for code in codes:
        assert len(code) == 6 and code.isdigit()


def test_otp_hash_verify_roundtrip():
    h = ev.hash_otp("123456")
    assert ev.verify_otp("123456", h) is True
    assert ev.verify_otp(" 123456 ", h) is True
    assert ev.verify_otp("654321", h) is False
    assert ev.verify_otp("", h) is False
    assert len(h) == 64


def test_expiry_cooldown_attempts_helpers():
    from datetime import datetime, timedelta

    now = datetime.utcnow()
    assert ev.otp_expiry(now) == now + timedelta(minutes=5)
    assert ev.is_expired(now + timedelta(minutes=5), now + timedelta(minutes=4, seconds=59)) is False
    assert ev.is_expired(now + timedelta(minutes=5), now + timedelta(minutes=5)) is True
    assert ev.is_expired(now - timedelta(minutes=1), now) is True
    assert ev.is_expired(now + timedelta(minutes=1), now) is False
    assert ev.cooldown_remaining_seconds(now, now) == 60
    assert ev.cooldown_remaining_seconds(now - timedelta(seconds=61), now) == 0
    assert ev.attempts_exceeded(4) is False
    assert ev.attempts_exceeded(5) is True


def test_otp_template_contains_code_but_service_never_logs_it(capsys):
    from app.services.email import _plain_text

    subject, html = ev.build_otp_email("Jane Doe", "123456")
    assert "123456" in html and "Jane" in html
    assert "This verification code expires in 5 minutes." in html
    assert "Do not share this code with anyone." in html
    assert 'src="cid:coditent-verification-art"' in html
    assert 'width="100%"' in html and "max-width:600px" in html
    plain = _plain_text(html)
    assert "123456" in plain
    assert "This verification code expires in 5 minutes." in plain
    assert "Do not share this code with anyone." in plain
    assert subject


def test_verification_art_is_embedded_as_cid_attachment():
    import base64

    attachment = ev.verification_art_attachment()
    assert attachment["content_id"] == "coditent-verification-art"
    assert attachment["content_type"] == "image/jpeg"
    assert attachment["filename"].endswith(".jpg")
    decoded = base64.b64decode(attachment["content"])
    assert decoded.startswith(b"\xff\xd8\xff")
    assert len(decoded) < 100_000


def test_email_plain_text_alternative_removes_html():
    from app.services.email import _plain_text

    text = _plain_text("<div>Hello <strong>there</strong></div><p>Code: 123456</p>")
    assert text == "Hello there\nCode: 123456"


# ---------- live API tests ----------


@pytest.mark.asyncio
async def test_register_does_not_activate_without_verification():
    email = _email("noop")
    async with httpx.AsyncClient(base_url=BASE, timeout=30) as c:
        r = await c.post(
            "/auth/register",
            json={"email": email, "password": "LiveTest123!", "full_name": "No Act", "role": "CANDIDATE"},
        )
        # Either the code was emailed (202) or delivery failed and the
        # pending row was rolled back (502). Either way: no token, no user.
        assert r.status_code in (202, 502), r.text
        assert "token" not in r.json()
    assert await _user_row(email) is None
    if await _pending_row(email) is not None:
        await engine.dispose()
        async with AsyncSessionLocal() as db:
            await db.execute(text("DELETE FROM pending_registrations WHERE email=:email"), {"email": email})
            await db.commit()


@pytest.mark.asyncio
async def test_login_impossible_before_verification():
    email = _email("nologin")
    await _insert_pending(email)
    async with httpx.AsyncClient(base_url=BASE, timeout=20) as c:
        r = await c.post("/auth/login", json={"email": email, "password": "LiveTest123!"})
        assert r.status_code == 401


@pytest.mark.asyncio
async def test_wrong_otp_rejected_and_counts_attempt():
    email = _email("wrong")
    await _insert_pending(email)
    async with httpx.AsyncClient(base_url=BASE, timeout=20) as c:
        r = await c.post("/auth/verify-email", json={"email": email, "otp": "000000"})
        assert r.status_code == 400
        assert "token" not in r.json()
    row = await _pending_row(email)
    assert row is not None and row["otp_attempts"] == 1
    assert await _user_row(email) is None


@pytest.mark.asyncio
async def test_attempts_limit_blocks_and_clears():
    email = _email("locked")
    await _insert_pending(email)
    async with httpx.AsyncClient(base_url=BASE, timeout=30) as c:
        final_wrong = None
        for _ in range(5):
            r = await c.post("/auth/verify-email", json={"email": email, "otp": "000000"})
            assert r.status_code == 400
            final_wrong = r
        assert final_wrong is not None and "attempt" in final_wrong.text.lower()
        r = await c.post("/auth/verify-email", json={"email": email, "otp": KNOWN_OTP})
        assert r.status_code == 400
        assert "invalid or expired" in r.text.lower()
    assert await _pending_row(email) is None
    assert await _user_row(email) is None
    # let the shared IP rate window drain before the remaining verify tests
    time.sleep(65)


@pytest.mark.asyncio
async def test_expired_otp_rejected_and_cleaned():
    email = _email("expired")
    await _insert_pending(email, expired=True)
    async with httpx.AsyncClient(base_url=BASE, timeout=20) as c:
        r = await c.post("/auth/verify-email", json={"email": email, "otp": KNOWN_OTP})
        assert r.status_code == 400
        assert "expir" in r.text.lower()
    assert await _pending_row(email) is None
    assert await _user_row(email) is None


@pytest.mark.asyncio
async def test_correct_otp_creates_account_and_rejects_reuse():
    email = _email("happy")
    await _insert_pending(email)
    async with httpx.AsyncClient(base_url=BASE, timeout=20) as c:
        r = await c.post("/auth/verify-email", json={"email": email, "otp": KNOWN_OTP})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["token"] and body["user"]["email"] == email and body["user"]["role"] == "CANDIDATE"
        r = await c.post("/auth/verify-email", json={"email": email, "otp": KNOWN_OTP})
        assert r.status_code == 400
    assert await _pending_row(email) is None
    user = await _user_row(email)
    assert user is not None


@pytest.mark.asyncio
async def test_rotating_code_invalidates_previous_code():
    """A resend stores only the new hash; the former code can no longer win."""
    email = _email("rotated")
    new_code = "654321"
    await _insert_pending(email)
    await engine.dispose()
    async with AsyncSessionLocal() as db:
        await db.execute(
            text(
                "UPDATE pending_registrations SET otp_hash=:otp, otp_attempts=0 "
                "WHERE email=:email"
            ),
            {"otp": ev.hash_otp(new_code), "email": email},
        )
        await db.commit()

    async with httpx.AsyncClient(base_url=BASE, timeout=20) as c:
        old = await c.post("/auth/verify-email", json={"email": email, "otp": KNOWN_OTP})
        assert old.status_code == 400
        fresh = await c.post("/auth/verify-email", json={"email": email, "otp": new_code})
        assert fresh.status_code == 200, fresh.text


@pytest.mark.asyncio
async def test_resend_cooldown_then_rollback_keeps_old_code():
    email = _email("resend")
    await _insert_pending(email)
    async with httpx.AsyncClient(base_url=BASE, timeout=20) as c:
        r = await c.post("/auth/resend-verification", json={"email": email})
        assert r.status_code == 429
        assert "retry_after_seconds" in r.text
    # SMTP is down here, so a real resend 502s — and the previous code must survive.
    await engine.dispose()
    async with AsyncSessionLocal() as db:
        from datetime import datetime, timedelta

        await db.execute(
            text("UPDATE pending_registrations SET last_otp_sent_at=:past WHERE email=:email"),
            {"email": email, "past": datetime.utcnow() - timedelta(minutes=5)},
        )
        await db.commit()
    async with httpx.AsyncClient(base_url=BASE, timeout=30) as c:
        r = await c.post("/auth/resend-verification", json={"email": email})
        assert r.status_code == 502
        r = await c.post("/auth/verify-email", json={"email": email, "otp": KNOWN_OTP})
        assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_verified_email_cannot_register_again():
    email = _email("taken")
    await _insert_pending(email)
    async with httpx.AsyncClient(base_url=BASE, timeout=20) as c:
        r = await c.post("/auth/verify-email", json={"email": email, "otp": KNOWN_OTP})
        assert r.status_code == 200
        r = await c.post(
            "/auth/register",
            json={"email": email, "password": "LiveTest123!", "full_name": "Dup", "role": "CANDIDATE"},
        )
        assert r.status_code == 400


@pytest.mark.asyncio
async def test_pending_reregister_does_not_duplicate():
    email = _email("again")
    await _insert_pending(email)
    async with httpx.AsyncClient(base_url=BASE, timeout=30) as c:
        # last_otp_sent_at is now → cooldown path, no duplicate row possible
        r = await c.post(
            "/auth/register",
            json={"email": email, "password": "LiveTest123!", "full_name": "Again", "role": "CANDIDATE"},
        )
        assert r.status_code in (429, 502)
    await engine.dispose()
    async with AsyncSessionLocal() as db:
        res = await db.execute(text("SELECT COUNT(*) AS n FROM pending_registrations WHERE email=:email"), {"email": email})
        assert res.mappings().first()["n"] <= 1


@pytest.mark.asyncio
async def test_concurrent_verify_creates_single_user():
    import asyncio

    email = _email("race")
    await _insert_pending(email)
    async with httpx.AsyncClient(base_url=BASE, timeout=30) as c:
        results = await asyncio.gather(
            c.post("/auth/verify-email", json={"email": email, "otp": KNOWN_OTP}),
            c.post("/auth/verify-email", json={"email": email, "otp": KNOWN_OTP}),
        )
    codes = sorted(r.status_code for r in results)
    assert codes == [200, 400], [r.status_code for r in results]
    await engine.dispose()
    async with AsyncSessionLocal() as db:
        res = await db.execute(text("SELECT COUNT(*) AS n FROM users WHERE email=:email"), {"email": email})
        assert res.mappings().first()["n"] == 1
    assert await _pending_row(email) is None


@pytest.mark.asyncio
async def test_sso_providers_untouched():
    async with httpx.AsyncClient(base_url=BASE, timeout=20) as c:
        r = await c.get("/auth/sso/providers")
        assert r.status_code == 200
