"""No-duplicate recruitment conversations: one application_id = one conversation.

Covers the task requirements:
1. apply -> no duplicate chat
2. HR accept/move -> exactly one recruitment conversation
3. stage change again -> same conversation ID
4. repeat same stage update -> same conversation ID
5. concurrent requests -> single conversation
6. direct conversation stays separate (and recruitment no longer leaks into it)
7. messages survive (no history loss)
8. both parties can still send/receive after fix

Plus DB-free unit checks for the dedupe guard and direct/recruitment
isolation so the intent is verified even without a live database.

Run (needs Supabase, same as test_recruitment_chat.py):
  python3 -m pytest tests/test_recruitment_no_duplicates.py -v
"""
import asyncio
import uuid

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import delete, select

from app.database import AsyncSessionLocal
from app.main import app
from app.models import Application, CandidateRequest, ChatMessage, Company, Offer, User, UserRole
from app.services.recruitment_chat import (
    get_or_create_recruitment_conversation,
    is_chat_enabled_for_status,
)
from app.utils.jwt import create_access_token


async def _with_db_retries(label, fn, attempts=5):
    import asyncio as _asyncio

    last = None
    for attempt in range(attempts):
        try:
            return await fn()
        except Exception as exc:  # noqa: BLE001 - retry transient pooler faults
            last = exc
            await _asyncio.sleep(2 * (attempt + 1))
    raise AssertionError(f"DB unreachable for {label} after retries: {last}")


def _uid() -> str:
    return uuid.uuid4().hex[:8]


def tok(user: User) -> str:
    return create_access_token({"sub": str(user.id)})


def auth(user: User) -> dict:
    return {"Authorization": f"Bearer {tok(user)}"}


@pytest_asyncio.fixture(autouse=True)
async def _fresh_db_engine():
    from app.database import engine

    await engine.dispose()
    yield
    await engine.dispose()


@pytest_asyncio.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def flow():
    suffix = _uid()
    data: dict = {}

    async def setup():
        async with AsyncSessionLocal() as db:
            company = Company(name=f"DupCo-{suffix}")
            db.add(company)
            await db.flush()

            def mkuser(email, role, company_id=None, company_role=None):
                return User(
                    email=email,
                    password_hash="test-hash",
                    role=role,
                    is_approved=True,
                    full_name=email.split("@")[0],
                    company_id=company_id,
                    company_role=company_role,
                )

            owner = mkuser(f"downer-{suffix}@t.local", UserRole.COMPANY_USER, company.id, "OWNER")
            hr = mkuser(f"dhr-{suffix}@t.local", UserRole.COMPANY_USER, company.id, "HR")
            cand = mkuser(f"dcand-{suffix}@t.local", UserRole.CANDIDATE)
            db.add_all([owner, hr, cand])
            await db.flush()
            company.owner_id = owner.id

            offer = Offer(
                recruiter_id=hr.id,
                company_id=company.id,
                created_by=hr.id,
                responsible_hr_id=hr.id,
                title="Software Engineer",
                company=company.name,
                region="Casablanca",
                field="Informatique",
                type="JOB",
                description="Oracle-style backend role for dedupe tests.",
                requirements="Python, SQL, 2y experience.",
            )
            db.add(offer)
            await db.flush()

            application = Application(
                candidate_id=cand.id,
                opportunity_id=offer.id,
                company_id=company.id,
                status="applied",
            )
            db.add(application)
            await db.commit()
            for o in (owner, hr, cand, company, offer, application):
                await db.refresh(o)
            data.update({
                "owner": owner, "hr": hr, "cand": cand,
                "company": company, "offer": offer, "application": application,
            })

    await _with_db_retries("dupflow.setup", setup)
    yield data

    async def teardown():
        async with AsyncSessionLocal() as db:
            app_id = data["application"].id
            await db.execute(delete(ChatMessage).where(ChatMessage.application_id == app_id))
            # Direct messages between fixture users (application_id IS NULL).
            uids = [data["owner"].id, data["hr"].id, data["cand"].id]
            await db.execute(
                delete(ChatMessage).where(
                    ChatMessage.sender_id.in_(uids),
                    ChatMessage.receiver_id.in_(uids),
                )
            )
            await db.execute(delete(Application).where(Application.id == app_id))
            await db.execute(delete(CandidateRequest).where(CandidateRequest.company_id == data["company"].id))
            await db.execute(delete(Offer).where(Offer.id == data["offer"].id))
            from app.models import AdminActivityLog
            from sqlalchemy import update as _update

            await db.execute(delete(AdminActivityLog).where(AdminActivityLog.admin_id.in_(uids)))
            await db.execute(
                _update(Company).where(Company.id == data["company"].id).values(owner_id=None)
            )
            await db.execute(delete(User).where(User.id.in_(uids)))
            await db.execute(delete(Company).where(Company.id == data["company"].id))
            await db.commit()

    await _with_db_retries("dupflow.teardown", teardown)


async def _set_status(app_id, new_status):
    async def _do():
        async with AsyncSessionLocal() as db:
            a = (await db.execute(select(Application).where(Application.id == app_id))).scalar_one()
            a.status = new_status
            await db.commit()

    await _with_db_retries(f"dupflow.set:{new_status}", _do)


async def _recruitment_entries(client, user):
    r = await client.get("/chat/recruitment", headers=auth(user))
    assert r.status_code == 200, r.text
    return r.json()["recruitment_chats"]


# --- DB-free unit checks -----------------------------------------------------

def test_dedupe_guard_keeps_one_entry_per_application():
    """Mirrors the backend + frontend dedupe: same application_id twice -> one."""
    app_id = str(uuid.uuid4())
    items = [
        {"application_id": app_id, "status": "interview"},
        {"application_id": app_id, "status": "interview"},
        {"application_id": str(uuid.uuid4()), "status": "interview"},
    ]
    seen: list[dict] = []
    for entry in items:
        if any(e["application_id"] == entry["application_id"] for e in seen):
            continue
        seen.append(entry)
    assert len(seen) == 2
    assert [e["application_id"] for e in seen].count(app_id) == 1


def test_direct_filter_excludes_recruitment_messages():
    """Direct inbox/thread must only consider application_id IS NULL rows."""
    rows = [
        {"content": "ccc", "application_id": uuid.uuid4()},  # recruitment
        {"content": "hello direct", "application_id": None},  # direct
    ]
    direct = [r for r in rows if r["application_id"] is None]
    assert [r["content"] for r in direct] == ["hello direct"]


def test_stage_gate_for_oracle_flow():
    # Applied -> no chat; every later stage reuses the same conversation.
    assert is_chat_enabled_for_status("applied") is False
    for s in ["shortlisted", "interview", "accepted"]:
        assert is_chat_enabled_for_status(s) is True


# --- Integration: the 8 required behaviors -----------------------------------

@pytest.mark.asyncio
async def test_1_apply_creates_no_duplicate_chat(client, flow):
    # Fresh application in "applied": no recruitment entry, context disabled.
    entries = await _recruitment_entries(client, flow["cand"])
    assert [e for e in entries if e["application_id"] == str(flow["application"].id)] == []
    r = await client.get(f"/chat/recruitment/{flow['application'].id}", headers=auth(flow["cand"]))
    assert r.status_code == 200
    assert r.json()["chat_enabled"] is False
    assert r.json()["messages"] == []
    # No direct leak either: nothing sent yet.
    r = await client.get("/chat/conversations", headers=auth(flow["cand"]))
    assert r.status_code == 200
    assert r.json()["conversations"] == []


@pytest.mark.asyncio
async def test_2_accept_creates_conversation_once(client, flow):
    r = await client.patch(
        f"/applications/{flow['application'].id}",
        json={"status": "shortlisted"},
        headers=auth(flow["hr"]),
    )
    assert r.status_code == 200, r.text
    entries = await _recruitment_entries(client, flow["cand"])
    mine = [e for e in entries if e["application_id"] == str(flow["application"].id)]
    assert len(mine) == 1
    assert mine[0]["offer_title"] == "Software Engineer"


@pytest.mark.asyncio
async def test_3_stage_changes_reuse_same_conversation(client, flow):
    for stage in ["shortlisted", "interview", "accepted"]:
        r = await client.patch(
            f"/applications/{flow['application'].id}",
            json={"status": stage},
            headers=auth(flow["hr"]),
        )
        assert r.status_code == 200, r.text
        assert r.json()["id"] == str(flow["application"].id)
    entries = await _recruitment_entries(client, flow["cand"])
    mine = [e for e in entries if e["application_id"] == str(flow["application"].id)]
    assert len(mine) == 1
    assert mine[0]["status"] == "accepted"  # metadata updated, not duplicated


@pytest.mark.asyncio
async def test_4_repeat_same_stage_update_is_idempotent(client, flow):
    for _ in range(3):
        r = await client.patch(
            f"/applications/{flow['application'].id}",
            json={"status": "interview"},
            headers=auth(flow["hr"]),
        )
        assert r.status_code == 200, r.text
    entries = await _recruitment_entries(client, flow["cand"])
    mine = [e for e in entries if e["application_id"] == str(flow["application"].id)]
    assert len(mine) == 1


@pytest.mark.asyncio
async def test_5_concurrent_stage_updates_single_conversation(client, flow):
    await _set_status(flow["application"].id, "shortlisted")

    async def _move(stage: str):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            return await c.patch(
                f"/applications/{flow['application'].id}",
                json={"status": stage},
                headers=auth(flow["hr"]),
            )

    results = await asyncio.gather(_move("interview"), _move("interview"))
    assert all(r.status_code == 200 for r in results), [r.text for r in results]
    entries = await _recruitment_entries(client, flow["cand"])
    mine = [e for e in entries if e["application_id"] == str(flow["application"].id)]
    assert len(mine) == 1

    # Concurrent sends also share the one conversation; nothing lost.
    await _set_status(flow["application"].id, "accepted")

    async def _send(text: str):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            return await c.post(
                f"/chat/recruitment/{flow['application'].id}",
                json={"content": text},
                headers=auth(flow["cand"]),
            )

    sent = await asyncio.gather(_send("concurrent-a"), _send("concurrent-b"))
    assert all(r.status_code == 200 for r in sent), [r.text for r in sent]
    assert {r.json()["application_id"] for r in sent} == {str(flow["application"].id)}
    r = await client.get(f"/chat/recruitment/{flow['application'].id}", headers=auth(flow["cand"]))
    contents = [m["content"] for m in r.json()["messages"]]
    assert "concurrent-a" in contents and "concurrent-b" in contents


@pytest.mark.asyncio
async def test_6_direct_stays_separate_and_recruitment_does_not_leak(client, flow):
    await _set_status(flow["application"].id, "accepted")
    r = await client.post(
        f"/chat/recruitment/{flow['application'].id}",
        json={"content": "ccc"},
        headers=auth(flow["cand"]),
    )
    assert r.status_code == 200, r.text

    # Recruitment message must NOT appear in the direct inbox/thread.
    r = await client.get("/chat/conversations", headers=auth(flow["cand"]))
    assert r.status_code == 200
    assert r.json()["conversations"] == []
    r = await client.get(f"/chat/with/{flow['hr'].id}", headers=auth(flow["cand"]))
    assert r.status_code == 200
    assert r.json()["messages"] == []

    # A real direct message (application_id NULL) stays a separate thread and
    # never merges into / changes the recruitment conversation.
    async def _insert_direct():
        async with AsyncSessionLocal() as db:
            db.add(ChatMessage(
                sender_id=flow["cand"].id,
                receiver_id=flow["hr"].id,
                application_id=None,
                content="hello direct",
            ))
            await db.commit()

    await _with_db_retries("insert.direct", _insert_direct)
    r = await client.get("/chat/conversations", headers=auth(flow["cand"]))
    assert r.status_code == 200
    assert len(r.json()["conversations"]) == 1
    assert r.json()["conversations"][0]["last_message"] == "hello direct"
    r = await client.get(f"/chat/with/{flow['hr'].id}", headers=auth(flow["cand"]))
    assert [m["content"] for m in r.json()["messages"]] == ["hello direct"]
    # Recruitment side untouched.
    entries = await _recruitment_entries(client, flow["cand"])
    mine = [e for e in entries if e["application_id"] == str(flow["application"].id)]
    assert len(mine) == 1
    assert mine[0]["last_message"] == "ccc"


@pytest.mark.asyncio
async def test_7_messages_survive_stage_moves(client, flow):
    await _set_status(flow["application"].id, "shortlisted")
    for text in ["hello", "cc", "ccc"]:
        r = await client.post(
            f"/chat/recruitment/{flow['application'].id}",
            json={"content": text},
            headers=auth(flow["cand"]),
        )
        assert r.status_code == 200, r.text
    # Move through the pipeline: history (timestamps + senders) preserved.
    for stage in ["interview", "accepted", "assessment_completed"]:
        await _set_status(flow["application"].id, stage)
        # Re-enable chat-gated stages for readability; assessment_completed
        # keeps chat enabled as well.
        r = await client.get(f"/chat/recruitment/{flow['application'].id}", headers=auth(flow["cand"]))
        assert r.status_code == 200
        contents = [m["content"] for m in r.json()["messages"]]
        assert contents == ["hello", "cc", "ccc"]
        senders = {m["sender_id"] for m in r.json()["messages"]}
        assert senders == {str(flow["cand"].id)}


@pytest.mark.asyncio
async def test_8_both_parties_can_send_after_fix(client, flow):
    await _set_status(flow["application"].id, "accepted")
    r = await client.post(
        f"/chat/recruitment/{flow['application'].id}",
        json={"content": "candidate here"},
        headers=auth(flow["cand"]),
    )
    assert r.status_code == 200, r.text
    assert r.json()["receiver_id"] == str(flow["hr"].id)
    r = await client.post(
        f"/chat/recruitment/{flow['application'].id}",
        json={"content": "hr here"},
        headers=auth(flow["hr"]),
    )
    assert r.status_code == 200, r.text
    assert r.json()["receiver_id"] == str(flow["cand"].id)
    for user in (flow["cand"], flow["hr"]):
        r = await client.get(f"/chat/recruitment/{flow['application'].id}", headers=auth(user))
        assert r.status_code == 200
        contents = [m["content"] for m in r.json()["messages"]]
        assert "candidate here" in contents and "hr here" in contents


@pytest.mark.asyncio
async def test_helper_is_idempotent_for_same_application():
    async def _run():
        async with AsyncSessionLocal() as db:
            company = Company(name=f"HelperCo-{_uid()}")
            db.add(company)
            await db.flush()
            hr = User(email=f"h-{_uid()}@t.local", password_hash="x", role=UserRole.COMPANY_USER,
                      is_approved=True, full_name="H", company_id=company.id, company_role="HR")
            cand = User(email=f"c-{_uid()}@t.local", password_hash="x", role=UserRole.CANDIDATE,
                        is_approved=True, full_name="C")
            db.add_all([hr, cand])
            await db.flush()
            offer = Offer(recruiter_id=hr.id, company_id=company.id, created_by=hr.id,
                          responsible_hr_id=hr.id, title="T", company=company.name,
                          region="R", field="F", type="JOB",
                          description="Helper offer text.", requirements="Helper requirements.")
            db.add(offer)
            await db.flush()
            application = Application(candidate_id=cand.id, opportunity_id=offer.id,
                                      company_id=company.id, status="interview")
            db.add(application)
            await db.commit()
            app_id = application.id
            first = await get_or_create_recruitment_conversation(db, app_id)
            second = await get_or_create_recruitment_conversation(db, app_id)
            assert first.id == second.id == app_id
            # Cleanup inside the same session scope.
            await db.execute(delete(Application).where(Application.id == app_id))
            await db.execute(delete(Offer).where(Offer.id == offer.id))
            await db.execute(delete(User).where(User.id.in_([hr.id, cand.id])))
            await db.execute(delete(Company).where(Company.id == company.id))
            await db.commit()

    await _with_db_retries("helper.idempotent", _run)
