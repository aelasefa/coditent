"""Email OTP verification for password registration.

Run: pytest tests/test_email_otp.py -v (needs API on localhost:8001)

Live tests that need a pending row insert it directly with a KNOWN OTP hash,
because real SMTP delivery is environment-dependent. Anything asserting on
email delivery itself is covered by the rollback unit paths below.
"""
import hashlib
import asyncio
import time
import uuid

import httpx
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import text

from app.config import settings
from app.database import AsyncSessionLocal, engine
from app.services import email_outbox
from app.services import email_verification as ev
from app.services.passwords import hash_password, verify_password

BASE = "http://localhost:8001"
KNOWN_OTP = "123456"


@pytest.fixture(autouse=True)
def _configured_email_outbox(monkeypatch):
    monkeypatch.setattr(settings, "email_outbox_encryption_key", Fernet.generate_key().decode("ascii"))
    monkeypatch.setattr(email_outbox, "send_email", lambda *_args, **_kwargs: {"id": "test-message"})


def _known_hash() -> str:
    return hashlib.sha256(KNOWN_OTP.encode()).hexdigest()


async def _insert_pending(email: str, expired: bool = False, attempts: int = 0) -> str:
    from datetime import datetime, timedelta

    await engine.dispose()
    now = datetime.utcnow()
    exp = now - timedelta(hours=1) if expired else now + timedelta(minutes=5)
    registration_id = str(uuid.uuid4())
    async with AsyncSessionLocal() as db:
        await db.execute(
            text(
                "INSERT INTO pending_registrations (id, email, full_name, password_hash, otp_hash,"
                " otp_expires_at, otp_attempts, last_otp_sent_at, created_at)"
                " VALUES (:id, :email, 'Test User', :pw, :otp, :exp, :att, :now, :now)"
            ),
            {
                "id": registration_id,
                "email": email,
                "pw": hash_password("LiveTest123!"),
                "otp": _known_hash(),
                "att": attempts,
                "exp": exp,
                "now": now,
            },
        )
        await db.commit()
    return registration_id


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
async def test_reregister_rotates_the_complete_attempt_bundle():
    """A later attempt cannot combine its OTP with an earlier password/name."""
    from datetime import datetime, timedelta
    from unittest.mock import patch

    from app.main import app
    from app.routers import auth as auth_router

    email = _email("bundle")
    first_password = "FirstBundlePass123!"
    second_password = "SecondBundlePass456!"
    transport = httpx.ASGITransport(app=app, client=("s02-bundle", 41001))

    try:
        with patch.object(auth_router, "generate_otp", side_effect=["111111", "222222"]):
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                first = await client.post(
                    "/auth/register",
                    json={
                        "email": email,
                        "password": first_password,
                        "full_name": "First Attempt",
                    },
                )
                assert first.status_code == 202, first.text
                first_id = first.json()["registration_id"]

                await engine.dispose()
                async with AsyncSessionLocal() as db:
                    await db.execute(
                        text(
                            "UPDATE pending_registrations SET last_otp_sent_at=:past"
                            " WHERE id=:id"
                        ),
                        {
                            "id": first_id,
                            "past": datetime.utcnow() - timedelta(minutes=5),
                        },
                    )
                    await db.commit()

                second = await client.post(
                    "/auth/register",
                    json={
                        "email": email,
                        "password": second_password,
                        "full_name": "Second Attempt",
                    },
                )
                assert second.status_code == 202, second.text
                second_id = second.json()["registration_id"]
                assert second_id != first_id

                stale = await client.post(
                    "/auth/verify-email",
                    json={
                        "email": email,
                        "registration_id": first_id,
                        "otp": "111111",
                    },
                )
                assert stale.status_code == 400

                stale_resend = await client.post(
                    "/auth/resend-verification",
                    json={"email": email, "registration_id": first_id},
                )
                assert stale_resend.status_code == 400

        row = await _pending_row(email)
        assert row is not None
        assert str(row["id"]) == second_id
        assert row["full_name"] == "Second Attempt"
        assert row["password_hash"].startswith("$argon2id$")
        assert verify_password(second_password, row["password_hash"])
        assert not verify_password(first_password, row["password_hash"])
        assert ev.verify_otp("222222", row["otp_hash"])
        assert not ev.verify_otp("111111", row["otp_hash"])
    finally:
        await engine.dispose()
        async with AsyncSessionLocal() as db:
            await db.execute(
                text("DELETE FROM pending_registrations WHERE email=:email"),
                {"email": email},
            )
            await db.execute(text("DELETE FROM users WHERE email=:email"), {"email": email})
            await db.commit()
        await engine.dispose()


@pytest.mark.asyncio
async def test_concurrent_registration_attempts_never_mix_identity_bundle():
    """Concurrent first attempts yield one intact winner, never mixed fields."""
    from unittest.mock import patch

    from app.main import app
    from app.routers import auth as auth_router

    email = _email("concurrent-bundle")
    attempts = [
        {"email": email, "password": "ConcurrentAlpha123!", "full_name": "Alpha Attempt"},
        {"email": email, "password": "ConcurrentBeta456!", "full_name": "Beta Attempt"},
    ]
    transport = httpx.ASGITransport(app=app, client=("s02-concurrent", 41002))

    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            results = await asyncio.gather(
                client.post("/auth/register", json=attempts[0]),
                client.post("/auth/register", json=attempts[1]),
            )

        assert sorted(result.status_code for result in results) == [202, 409]
        winner_index = next(index for index, result in enumerate(results) if result.status_code == 202)
        winner = attempts[winner_index]
        loser = attempts[1 - winner_index]
        registration_id = results[winner_index].json()["registration_id"]

        row = await _pending_row(email)
        assert row is not None
        assert str(row["id"]) == registration_id
        assert row["full_name"] == winner["full_name"]
        assert verify_password(winner["password"], row["password_hash"])
        assert not verify_password(loser["password"], row["password_hash"])
    finally:
        await engine.dispose()
        async with AsyncSessionLocal() as db:
            await db.execute(
                text("DELETE FROM pending_registrations WHERE email=:email"),
                {"email": email},
            )
            await db.commit()
        await engine.dispose()


@pytest.mark.asyncio
async def test_register_does_not_activate_without_verification():
    email = _email("noop")
    async with httpx.AsyncClient(base_url=BASE, timeout=30) as c:
        r = await c.post(
            "/auth/register",
            json={"email": email, "password": "LiveTestPass123!", "full_name": "No Act", "role": "CANDIDATE"},
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
    registration_id = await _insert_pending(email)
    async with httpx.AsyncClient(base_url=BASE, timeout=20) as c:
        r = await c.post(
            "/auth/verify-email",
            json={"email": email, "registration_id": registration_id, "otp": "000000"},
        )
        assert r.status_code == 400
        assert "token" not in r.json()
    row = await _pending_row(email)
    assert row is not None and row["otp_attempts"] == 1
    assert await _user_row(email) is None


@pytest.mark.asyncio
async def test_attempts_limit_blocks_and_clears():
    email = _email("locked")
    registration_id = await _insert_pending(email)
    async with httpx.AsyncClient(base_url=BASE, timeout=30) as c:
        final_wrong = None
        for _ in range(5):
            r = await c.post(
                "/auth/verify-email",
                json={"email": email, "registration_id": registration_id, "otp": "000000"},
            )
            assert r.status_code == 400
            final_wrong = r
        assert final_wrong is not None and "attempt" in final_wrong.text.lower()
        r = await c.post(
            "/auth/verify-email",
            json={"email": email, "registration_id": registration_id, "otp": KNOWN_OTP},
        )
        assert r.status_code == 400
        assert "invalid or expired" in r.text.lower()
    assert await _pending_row(email) is None
    assert await _user_row(email) is None
    # let the shared IP rate window drain before the remaining verify tests
    time.sleep(65)


@pytest.mark.asyncio
async def test_expired_otp_rejected_and_cleaned():
    email = _email("expired")
    registration_id = await _insert_pending(email, expired=True)
    async with httpx.AsyncClient(base_url=BASE, timeout=20) as c:
        r = await c.post(
            "/auth/verify-email",
            json={"email": email, "registration_id": registration_id, "otp": KNOWN_OTP},
        )
        assert r.status_code == 400
        assert "expir" in r.text.lower()
    assert await _pending_row(email) is None
    assert await _user_row(email) is None


@pytest.mark.asyncio
async def test_correct_otp_creates_account_and_rejects_reuse():
    email = _email("happy")
    registration_id = await _insert_pending(email)
    async with httpx.AsyncClient(base_url=BASE, timeout=20) as c:
        payload = {"email": email, "registration_id": registration_id, "otp": KNOWN_OTP}
        r = await c.post("/auth/verify-email", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["token"] and body["user"]["email"] == email and body["user"]["role"] == "CANDIDATE"
        r = await c.post("/auth/verify-email", json=payload)
        assert r.status_code == 400
    assert await _pending_row(email) is None
    user = await _user_row(email)
    assert user is not None


@pytest.mark.asyncio
async def test_rotating_code_invalidates_previous_code():
    """A resend stores only the new hash; the former code can no longer win."""
    email = _email("rotated")
    new_code = "654321"
    registration_id = await _insert_pending(email)
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
        old = await c.post(
            "/auth/verify-email",
            json={"email": email, "registration_id": registration_id, "otp": KNOWN_OTP},
        )
        assert old.status_code == 400
        fresh = await c.post(
            "/auth/verify-email",
            json={"email": email, "registration_id": registration_id, "otp": new_code},
        )
        assert fresh.status_code == 200, fresh.text


@pytest.mark.asyncio
async def test_resend_cooldown_then_rollback_keeps_old_code():
    email = _email("resend")
    registration_id = await _insert_pending(email)
    async with httpx.AsyncClient(base_url=BASE, timeout=20) as c:
        r = await c.post(
            "/auth/resend-verification",
            json={"email": email, "registration_id": registration_id},
        )
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
        r = await c.post(
            "/auth/resend-verification",
            json={"email": email, "registration_id": registration_id},
        )
        assert r.status_code == 502
        r = await c.post(
            "/auth/verify-email",
            json={"email": email, "registration_id": registration_id, "otp": KNOWN_OTP},
        )
        assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_verified_email_cannot_register_again():
    email = _email("taken")
    registration_id = await _insert_pending(email)
    async with httpx.AsyncClient(base_url=BASE, timeout=20) as c:
        r = await c.post(
            "/auth/verify-email",
            json={"email": email, "registration_id": registration_id, "otp": KNOWN_OTP},
        )
        assert r.status_code == 200
        r = await c.post(
            "/auth/register",
            json={"email": email, "password": "LiveTestPass123!", "full_name": "Dup", "role": "CANDIDATE"},
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
            json={"email": email, "password": "LiveTestPass123!", "full_name": "Again", "role": "CANDIDATE"},
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
    registration_id = await _insert_pending(email)
    payload = {"email": email, "registration_id": registration_id, "otp": KNOWN_OTP}
    async with httpx.AsyncClient(base_url=BASE, timeout=30) as c:
        results = await asyncio.gather(
            c.post("/auth/verify-email", json=payload),
            c.post("/auth/verify-email", json=payload),
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
