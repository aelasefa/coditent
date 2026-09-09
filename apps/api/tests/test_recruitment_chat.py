"""Recruitment chat: Candidate ↔ Responsible HR after application acceptance.

Covers the security matrix from the feature spec using isolated fixtures
(unique company/users per test) against the real database via ASGI transport.

Run: python3 -m pytest tests/test_recruitment_chat.py -v
"""
import uuid

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import delete, select

from app.database import AsyncSessionLocal
from app.main import app
from app.models import Application, CandidateRequest, ChatMessage, Company, Offer, User, UserRole
from app.services.recruitment_chat import (
    can_access_recruitment_chat,
    is_chat_enabled_for_status,
)
from app.utils.jwt import create_access_token


async def _with_db_retries(label, fn, attempts=5):
    """Supabase pooler DNS/TLS from CI sandboxes is occasionally flaky;
    retry setup/teardown DB blocks instead of failing the suite."""
    import asyncio

    last = None
    for attempt in range(attempts):
        try:
            return await fn()
        except Exception as exc:  # noqa: BLE001 - retry transient network faults
            last = exc
            await asyncio.sleep(2 * (attempt + 1))
    raise AssertionError(f"DB unreachable for {label} after retries: {last}")


def _uid() -> str:
    return uuid.uuid4().hex[:8]


def tok(user: User) -> str:
    return create_access_token({"sub": str(user.id)})


def auth(user: User) -> dict:
    return {"Authorization": f"Bearer {tok(user)}"}


@pytest_asyncio.fixture(autouse=True)
async def _fresh_db_engine():
    """Dispose the shared engine pool around each test.

    The module-level engine otherwise keeps connections bound to a previous
    test's event loop (pytest-asyncio creates one loop per test), causing
    flaky 'attached to a different loop' / 'Event loop is closed' errors
    against the remote database.
    """
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
    """Full workflow fixture: company + owner + HR(+second HR) + candidate(+second)
    + other company + offer (responsible HR) + application. Yields dict, cleans up."""
    suffix = _uid()
    data: dict = {}

    async def setup():
        async with AsyncSessionLocal() as db:
            company = Company(name=f"ChatCo-{suffix}")
        db.add(company)
        await db.flush()

        other_company = Company(name=f"OtherCo-{suffix}")
        db.add(other_company)
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

        owner = mkuser(f"owner-{suffix}@t.local", UserRole.COMPANY_USER, company.id, "OWNER")
        hr = mkuser(f"hr-{suffix}@t.local", UserRole.COMPANY_USER, company.id, "HR")
        hr2 = mkuser(f"hr2-{suffix}@t.local", UserRole.COMPANY_USER, company.id, "HR")
        other_hr = mkuser(f"ohr-{suffix}@t.local", UserRole.COMPANY_USER, other_company.id, "HR")
        cand = mkuser(f"cand-{suffix}@t.local", UserRole.CANDIDATE)
        cand2 = mkuser(f"cand2-{suffix}@t.local", UserRole.CANDIDATE)
        db.add_all([owner, hr, hr2, other_hr, cand, cand2])
        await db.flush()
        company.owner_id = owner.id
        other_company.owner_id = other_hr.id

        offer = Offer(
            recruiter_id=hr.id,
            company_id=company.id,
            created_by=hr.id,
            responsible_hr_id=hr.id,
            title="Frontend Developer",
            company=company.name,
            region="Casablanca",
            field="Informatique",
            type="JOB",
            description="Build expressive UIs for Morocco.",
            requirements="React, TypeScript, 2y experience.",
        )
        db.add(offer)
        await db.flush()

        other_offer = Offer(
            recruiter_id=other_hr.id,
            company_id=other_company.id,
            created_by=other_hr.id,
            responsible_hr_id=other_hr.id,
            title="Backend Developer",
            company=other_company.name,
            region="Rabat",
            field="Informatique",
            type="JOB",
            description="Build robust APIs for Morocco.",
            requirements="Python, FastAPI, 2y experience.",
        )
        db.add(other_offer)
        await db.flush()

        application = Application(
            candidate_id=cand.id,
            opportunity_id=offer.id,
            company_id=company.id,
            status="applied",
        )
        db.add(application)
        await db.commit()
        for o in (owner, hr, hr2, other_hr, cand, cand2, company, other_company, offer, other_offer, application):
            await db.refresh(o)
        data.update({
            "owner": owner, "hr": hr, "hr2": hr2, "other_hr": other_hr,
            "cand": cand, "cand2": cand2, "company": company,
            "other_company": other_company, "offer": offer,
            "other_offer": other_offer, "application": application,
        })

    await _with_db_retries("flow.setup", setup)
    yield data

    async def teardown():
        async with AsyncSessionLocal() as db:
            uids = [data["owner"].id, data["hr"].id, data["hr2"].id, data["other_hr"].id, data["cand"].id, data["cand2"].id]
            app_id = data["application"].id
            await db.execute(delete(ChatMessage).where(ChatMessage.application_id == app_id))
            await db.execute(delete(Application).where(Application.id == app_id))
            await db.execute(delete(CandidateRequest).where(CandidateRequest.company_id.in_([data["company"].id, data["other_company"].id])))
            await db.execute(delete(Offer).where(Offer.id.in_([data["offer"].id, data["other_offer"].id])))
            # Audit rows reference fixture users (admin_activity_logs_admin_id_fkey).
            from app.models import AdminActivityLog

            await db.execute(delete(AdminActivityLog).where(AdminActivityLog.admin_id.in_(uids)))
            # Break owner reference before deleting users (companies.owner_id FK).
            from sqlalchemy import update as _update

            await db.execute(
                _update(Company)
                .where(Company.id.in_([data["company"].id, data["other_company"].id]))
                .values(owner_id=None)
            )
            await db.execute(delete(User).where(User.id.in_(uids)))
            await db.execute(delete(Company).where(Company.id.in_([data["company"].id, data["other_company"].id])))
            await db.commit()

    await _with_db_retries("flow.teardown", teardown)


async def _set_status(application_id, new_status):
    async def _do():
        async with AsyncSessionLocal() as db:
            a = (await db.execute(select(Application).where(Application.id == application_id))).scalar_one()
            a.status = new_status
            await db.commit()

    await _with_db_retries(f"set_status:{new_status}", _do)


# --- Stage gate unit checks -------------------------------------------------

@pytest.mark.asyncio
async def test_stage_gate_allows_post_review_only():
    for s in ["shortlisted", "assessment_required", "assessment_completed", "interview", "accepted"]:
        assert is_chat_enabled_for_status(s) is True
    for s in ["applied", "under_review", "rejected", None, "", "withdrawn", "hired"]:
        assert is_chat_enabled_for_status(s) is False


# --- Allowed ----------------------------------------------------------------

@pytest.mark.asyncio
async def test_candidate_accesses_own_accepted_chat(client, flow):
    await _set_status(flow["application"].id, "accepted")
    r = await client.get(f"/chat/recruitment/{flow['application'].id}", headers=auth(flow["cand"]))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["chat_enabled"] is True
    assert body["status"] == "accepted"
    assert body["offer_title"] == "Frontend Developer"
    assert body["company_name"] == flow["company"].name
    assert body["peer"]["id"] == str(flow["hr"].id)
    assert body["peer"]["full_name"] == flow["hr"].full_name


@pytest.mark.asyncio
async def test_responsible_hr_accesses_chat(client, flow):
    await _set_status(flow["application"].id, "interview")
    r = await client.get(f"/chat/recruitment/{flow['application'].id}", headers=auth(flow["hr"]))
    assert r.status_code == 200, r.text
    assert r.json()["peer"]["id"] == str(flow["cand"].id)


@pytest.mark.asyncio
async def test_candidate_sends_to_responsible_hr(client, flow):
    await _set_status(flow["application"].id, "shortlisted")
    r = await client.post(
        f"/chat/recruitment/{flow['application'].id}",
        json={"content": "Hello, excited for the interview!"},
        headers=auth(flow["cand"]),
    )
    assert r.status_code == 200, r.text
    msg = r.json()
    assert msg["receiver_id"] == str(flow["hr"].id)
    assert msg["sender_id"] == str(flow["cand"].id)
    assert msg["application_id"] == str(flow["application"].id)


@pytest.mark.asyncio
async def test_hr_replies_and_messages_persist(client, flow):
    await _set_status(flow["application"].id, "accepted")
    r = await client.post(
        f"/chat/recruitment/{flow['application'].id}",
        json={"content": "Welcome aboard!"},
        headers=auth(flow["hr"]),
    )
    assert r.status_code == 200, r.text
    assert r.json()["receiver_id"] == str(flow["cand"].id)
    # Persistence: visible to the candidate after "refresh/relogin".
    r = await client.get(f"/chat/recruitment/{flow['application'].id}", headers=auth(flow["cand"]))
    assert r.status_code == 200
    contents = [m["content"] for m in r.json()["messages"]]
    assert "Welcome aboard!" in contents


@pytest.mark.asyncio
async def test_no_duplicate_conversation_on_retry(client, flow):
    await _set_status(flow["application"].id, "accepted")
    for i in range(2):
        r = await client.post(
            f"/chat/recruitment/{flow['application'].id}",
            json={"content": f"retry-safe {i}"},
            headers=auth(flow["cand"]),
        )
        assert r.status_code == 200, r.text
    # One logical conversation: single context, single peer, one list entry.
    r = await client.get(f"/chat/recruitment/{flow['application'].id}", headers=auth(flow["cand"]))
    assert r.status_code == 200
    assert r.json()["peer"]["id"] == str(flow["hr"].id)
    r = await client.get("/chat/recruitment", headers=auth(flow["cand"]))
    assert r.status_code == 200
    entries = [e for e in r.json()["recruitment_chats"] if e["application_id"] == str(flow["application"].id)]
    assert len(entries) == 1


@pytest.mark.asyncio
async def test_recruitment_list_separates_multiple_applications(client, flow):
    """Same candidate, two offers → two separate chats, never merged."""
    await _set_status(flow["application"].id, "accepted")
    app2_id = None

    async def _make_second():
        nonlocal app2_id
        async with AsyncSessionLocal() as db:
            app2 = Application(
                candidate_id=flow["cand"].id,
                opportunity_id=flow["other_offer"].id,
                company_id=flow["other_company"].id,
                status="accepted",
            )
            db.add(app2)
            await db.commit()
            await db.refresh(app2)
            app2_id = app2.id

    await _with_db_retries("second_application", _make_second)
    try:
        r = await client.get("/chat/recruitment", headers=auth(flow["cand"]))
        assert r.status_code == 200
        ids = {e["application_id"] for e in r.json()["recruitment_chats"]}
        assert str(flow["application"].id) in ids
        assert str(app2_id) in ids
    finally:
        async def _cleanup_second():
            async with AsyncSessionLocal() as db:
                await db.execute(delete(ChatMessage).where(ChatMessage.application_id == app2_id))
                await db.execute(delete(Application).where(Application.id == app2_id))
                await db.commit()

        await _with_db_retries("second_application.cleanup", _cleanup_second)


# --- Forbidden ---------------------------------------------------------------

@pytest.mark.asyncio
async def test_other_candidate_cannot_access(client, flow):
    await _set_status(flow["application"].id, "accepted")
    r = await client.get(f"/chat/recruitment/{flow['application'].id}", headers=auth(flow["cand2"]))
    assert r.status_code == 404
    r = await client.post(
        f"/chat/recruitment/{flow['application'].id}",
        json={"content": "hijack"},
        headers=auth(flow["cand2"]),
    )
    assert r.status_code in (403, 404)


@pytest.mark.asyncio
async def test_candidate_cannot_use_manipulated_application_id(client, flow):
    """Candidate 2 renames the path ID to candidate 1's application → denied."""
    await _set_status(flow["application"].id, "accepted")
    r = await client.post(
        f"/chat/recruitment/{flow['application'].id}",
        json={"content": "I am not the applicant"},
        headers=auth(flow["cand2"]),
    )
    assert r.status_code in (403, 404)
    # And candidate 1 cannot reach the other company's application either.
    r = await client.get(f"/chat/recruitment/{flow['other_offer'].id}", headers=auth(flow["cand"]))
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_other_company_hr_cannot_access(client, flow):
    await _set_status(flow["application"].id, "accepted")
    r = await client.get(f"/chat/recruitment/{flow['application'].id}", headers=auth(flow["other_hr"]))
    assert r.status_code == 403
    r = await client.post(
        f"/chat/recruitment/{flow['application'].id}",
        json={"content": "cross-company"},
        headers=auth(flow["other_hr"]),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_non_responsible_hr_same_company_denied(client, flow):
    await _set_status(flow["application"].id, "accepted")
    r = await client.get(f"/chat/recruitment/{flow['application'].id}", headers=auth(flow["hr2"]))
    assert r.status_code == 403
    r = await client.post(
        f"/chat/recruitment/{flow['application'].id}",
        json={"content": "not my pipeline"},
        headers=auth(flow["hr2"]),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_unauthenticated_denied(client, flow):
    r = await client.get(f"/chat/recruitment/{flow['application'].id}")
    assert r.status_code == 401
    r = await client.post(f"/chat/recruitment/{flow['application'].id}", json={"content": "x"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_pre_acceptance_chat_disabled(client, flow):
    # status is "applied": context visible, messaging blocked both directions.
    r = await client.get(f"/chat/recruitment/{flow['application'].id}", headers=auth(flow["cand"]))
    assert r.status_code == 200
    assert r.json()["chat_enabled"] is False
    assert r.json()["messages"] == []
    r = await client.post(
        f"/chat/recruitment/{flow['application'].id}",
        json={"content": "too early"},
        headers=auth(flow["cand"]),
    )
    assert r.status_code == 403
    r = await client.post(
        f"/chat/recruitment/{flow['application'].id}",
        json={"content": "too early"},
        headers=auth(flow["hr"]),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_rejected_candidate_locked_out(client, flow):
    await _set_status(flow["application"].id, "accepted")
    r = await client.post(
        f"/chat/recruitment/{flow['application'].id}",
        json={"content": "before rejection"},
        headers=auth(flow["cand"]),
    )
    assert r.status_code == 200
    await _set_status(flow["application"].id, "rejected")
    r = await client.post(
        f"/chat/recruitment/{flow['application'].id}",
        json={"content": "after rejection"},
        headers=auth(flow["cand"]),
    )
    assert r.status_code == 403
    r = await client.post(
        f"/chat/recruitment/{flow['application'].id}",
        json={"content": "after rejection"},
        headers=auth(flow["hr"]),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_removed_hr_loses_access(client, flow):
    await _set_status(flow["application"].id, "accepted")

    async def _remove():
        async with AsyncSessionLocal() as db:
            hr = (await db.execute(select(User).where(User.id == flow["hr"].id))).scalar_one()
            hr.company_id = None
            hr.company_role = None
            await db.commit()

    await _with_db_retries("hr.remove", _remove)
    try:
        flow["hr"].company_id = None
        flow["hr"].company_role = None
        r = await client.get(f"/chat/recruitment/{flow['application'].id}", headers=auth(flow["hr"]))
        assert r.status_code == 403
    finally:
        async def _restore():
            async with AsyncSessionLocal() as db:
                hr = (await db.execute(select(User).where(User.id == flow["hr"].id))).scalar_one()
                hr.company_id = flow["company"].id
                hr.company_role = "HR"
                await db.commit()

        await _with_db_retries("hr.restore", _restore)
        flow["hr"].company_id = flow["company"].id
        flow["hr"].company_role = "HR"


@pytest.mark.asyncio
async def test_owner_without_responsibility_denied(client, flow):
    """Even the company owner cannot enter a conversation they are not responsible for."""
    await _set_status(flow["application"].id, "accepted")
    r = await client.get(f"/chat/recruitment/{flow['application'].id}", headers=auth(flow["owner"]))
    assert r.status_code == 403


# --- Responsible-HR lifecycle --------------------------------------------------

@pytest.mark.asyncio
async def test_reassign_transfers_access(client, flow):
    await _set_status(flow["application"].id, "accepted")
    # HR cannot reassign (admin-only); owner can, same-company only.
    r = await client.patch(
        f"/offers/{flow['offer'].id}/responsible-hr",
        json={"responsible_hr_id": str(flow["hr2"].id)},
        headers=auth(flow["hr"]),
    )
    assert r.status_code == 403
    r = await client.patch(
        f"/offers/{flow['offer'].id}/responsible-hr",
        json={"responsible_hr_id": str(flow["other_hr"].id)},
        headers=auth(flow["owner"]),
    )
    assert r.status_code == 422
    r = await client.patch(
        f"/offers/{flow['offer'].id}/responsible-hr",
        json={"responsible_hr_id": str(flow["hr2"].id)},
        headers=auth(flow["owner"]),
    )
    assert r.status_code == 200, r.text
    assert r.json()["responsible_hr_id"] == str(flow["hr2"].id)
    # New HR in, previous HR out.
    r = await client.get(f"/chat/recruitment/{flow['application'].id}", headers=auth(flow["hr2"]))
    assert r.status_code == 200
    r = await client.get(f"/chat/recruitment/{flow['application'].id}", headers=auth(flow["hr"]))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_hr_can_create_offer_and_move_stage(client, flow):
    """The HR role must be able to run the recruitment workflow end to end."""
    payload = {
        "title": "HR-created role",
        "company": flow["company"].name,
        "region": "Casablanca",
        "field": "Informatique",
        "type": "JOB",
        "description": "Created by HR directly.",
        "requirements": "HR workflow validation here.",
    }
    r = await client.post("/offers", json=payload, headers=auth(flow["hr"]))
    assert r.status_code == 200, r.text
    assert r.json()["responsible_hr_id"] == str(flow["hr"].id)
    offer_id = r.json()["id"]
    try:
        r = await client.patch(
            f"/applications/{flow['application'].id}",
            json={"status": "shortlisted"},
            headers=auth(flow["hr"]),
        )
        assert r.status_code == 200, r.text
        assert r.json()["chat_enabled"] is True
    finally:
        async def _cleanup_offer():
            async with AsyncSessionLocal() as db:
                await db.execute(delete(Offer).where(Offer.id == offer_id))
                await db.commit()

        await _with_db_retries("offer.cleanup", _cleanup_offer)


# --- Pure authorization unit checks (no HTTP) ----------------------------------

def _fake_user(uid, role, company_id=None, company_role=None):
    return User(
        id=uid,
        email=f"fake-{uid}.t.local",
        password_hash="x",
        role=UserRole(role),
        is_approved=True,
        full_name="Fake",
        company_id=company_id,
        company_role=company_role,
    )


def _fake_offer(responsible_hr_id, company_id):
    return Offer(
        recruiter_id=responsible_hr_id,
        created_by=responsible_hr_id,
        responsible_hr_id=responsible_hr_id,
        company_id=company_id,
        title="Fake",
        company="FakeCo",
        region="Casa",
        field="IT",
        type="JOB",
        description="Fake offer for unit authz checks.",
        requirements="Fake requirements here.",
    )


def _fake_app(candidate_id, company_id, status):
    return Application(
        candidate_id=candidate_id,
        opportunity_id=uuid.uuid4(),
        company_id=company_id,
        status=status,
    )


def test_authz_matrix_unit():
    cand_id, hr_id, stranger_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    comp_id, other_id = uuid.uuid4(), uuid.uuid4()
    cand = _fake_user(cand_id, "CANDIDATE")
    hr = _fake_user(hr_id, "COMPANY_USER", comp_id, "HR")
    ex_hr = _fake_user(hr_id, "COMPANY_USER", None, None)
    moved_hr = _fake_user(hr_id, "COMPANY_USER", other_id, "HR")
    stranger = _fake_user(stranger_id, "CANDIDATE")
    admin = _fake_user(uuid.uuid4(), "PLATFORM_ADMIN")
    offer = _fake_offer(hr_id, comp_id)
    ok_app = _fake_app(cand_id, comp_id, "accepted")
    pending_app = _fake_app(cand_id, comp_id, "applied")

    assert can_access_recruitment_chat(cand, ok_app, offer).allowed is True
    assert can_access_recruitment_chat(hr, ok_app, offer).allowed is True
    assert can_access_recruitment_chat(cand, pending_app, offer).allowed is False
    assert can_access_recruitment_chat(stranger, ok_app, offer).allowed is False
    assert can_access_recruitment_chat(ex_hr, ok_app, offer).allowed is False
    assert can_access_recruitment_chat(moved_hr, ok_app, offer).allowed is False
    assert can_access_recruitment_chat(admin, ok_app, offer).allowed is False
    old_hr_app = _fake_app(cand_id, comp_id, "accepted")
    new_offer = _fake_offer(uuid.uuid4(), comp_id)  # reassigned: old HR out
    assert can_access_recruitment_chat(hr, old_hr_app, new_offer).allowed is False
