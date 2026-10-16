#!/usr/bin/env python3
"""Run a two-user HTTP/WebSocket proof against a disposable Coditent stack.

Required environment:
  DATABASE_URL, JWT_SECRET, REDIS_URL

Optional environment:
  MULTI_USER_PROOF_HTTP_URL (default http://127.0.0.1:8001)
  MULTI_USER_PROOF_WS_URL   (default ws://127.0.0.1:8001)

The script creates uniquely named proof accounts and prints a token-free JSON
report suitable for an evaluation record.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx
import websockets
from sqlalchemy.ext.asyncio import AsyncSession


API_ROOT = Path(__file__).resolve().parents[1] / "apps" / "api"
sys.path.insert(0, str(API_ROOT))

from app.database import AsyncSessionLocal  # noqa: E402
from app.models import Company, Offer, User, UserRole  # noqa: E402
from app.services.authentication import issue_access_token  # noqa: E402


HTTP_URL = os.getenv("MULTI_USER_PROOF_HTTP_URL", "http://127.0.0.1:8001").rstrip("/")
WS_URL = os.getenv("MULTI_USER_PROOF_WS_URL", "ws://127.0.0.1:8001").rstrip("/")


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _expect(response: httpx.Response, status: int) -> dict[str, Any]:
    if response.status_code != status:
        raise RuntimeError(
            f"{response.request.method} {response.request.url} returned "
            f"{response.status_code}: {response.text}"
        )
    return response.json() if response.content else {}


async def _seed() -> dict[str, Any]:
    run_id = uuid.uuid4().hex[:12]
    async with AsyncSessionLocal() as db:
        company = Company(name=f"Multi User Proof {run_id}")
        db.add(company)
        await db.flush()
        alice = User(
            email=f"alice-{run_id}@proof.local",
            password_hash="proof-only",
            role=UserRole.CANDIDATE,
            is_approved=True,
            is_active=True,
            full_name="Proof Alice",
        )
        bob = User(
            email=f"bob-{run_id}@proof.local",
            password_hash="proof-only",
            role=UserRole.CANDIDATE,
            is_approved=True,
            is_active=True,
            full_name="Proof Bob",
        )
        hr = User(
            email=f"hr-{run_id}@proof.local",
            password_hash="proof-only",
            role=UserRole.COMPANY_USER,
            is_approved=True,
            is_active=True,
            full_name="Proof Recruiter",
            company_id=company.id,
            company_role="OWNER",
        )
        db.add_all([alice, bob, hr])
        await db.flush()
        company.owner_id = hr.id
        offer = Offer(
            recruiter_id=hr.id,
            responsible_hr_id=hr.id,
            created_by=hr.id,
            company_id=company.id,
            title=f"Realtime Engineer {run_id}",
            company=company.name,
            region="Casablanca",
            field="Software",
            type="JOB",
            description="Two-client concurrency and realtime proof.",
            requirements="Reliable distributed systems",
            deadline=(datetime.now(timezone.utc) + timedelta(days=30)).replace(
                tzinfo=None
            ),
        )
        db.add(offer)
        await db.commit()
        for value in (alice, bob, hr, offer):
            await db.refresh(value)
        return {
            "run_id": run_id,
            "alice_id": alice.id,
            "bob_id": bob.id,
            "hr_id": hr.id,
            "offer_id": offer.id,
            "alice_token": issue_access_token(alice),
            "bob_token": issue_access_token(bob),
            "hr_token": issue_access_token(hr),
        }


async def _ticket(
    client: httpx.AsyncClient, token: str, path: str
) -> str:
    payload = await _expect(await client.post(path, headers=_auth(token)), 200)
    return str(payload["ticket"])


async def _receive_types(socket, expected: set[str], *, timeout: float = 5) -> list[dict]:
    events: list[dict] = []
    found: set[str] = set()
    while found != expected:
        event = json.loads(await asyncio.wait_for(socket.recv(), timeout=timeout))
        if event.get("type") == "ping":
            await socket.send(json.dumps({"type": "pong"}))
            continue
        events.append(event)
        if event.get("type") in expected:
            found.add(str(event["type"]))
    return events


def _ordered(messages: list[dict]) -> bool:
    keys = [(message["created_at"], message["id"]) for message in messages]
    return keys == sorted(keys)


async def main() -> None:
    seeded = await _seed()
    alice_id = str(seeded["alice_id"])
    bob_id = str(seeded["bob_id"])
    offer_id = str(seeded["offer_id"])
    alice_token = str(seeded["alice_token"])
    bob_token = str(seeded["bob_token"])
    hr_token = str(seeded["hr_token"])
    report: dict[str, Any] = {"run_id": seeded["run_id"]}

    async with httpx.AsyncClient(base_url=HTTP_URL, timeout=15) as client:
        friend_request = await _expect(
            await client.post(f"/friends/requests/{bob_id}", headers=_auth(alice_token)),
            201,
        )
        accepted = await _expect(
            await client.post(
                f"/friends/requests/{friend_request['id']}/accept",
                headers=_auth(bob_token),
            ),
            200,
        )
        report["friend_request"] = {
            "request_id": friend_request["id"],
            "created": friend_request["status"] == "PENDING",
            "accepted": accepted["status"] == "ACCEPTED",
        }

        application = await _expect(
            await client.post(
                "/applications",
                json={"opportunity_id": offer_id, "cover_letter": "Concurrent proof"},
                headers=_auth(alice_token),
            ),
            201,
        )
        application_id = str(application["id"])
        under_review = await _expect(
            await client.patch(
                f"/applications/{application_id}",
                json={"status": "under_review", "expected_version": 1},
                headers=_auth(hr_token),
            ),
            200,
        )
        shortlisted = await _expect(
            await client.patch(
                f"/applications/{application_id}",
                json={"status": "shortlisted", "expected_version": 2},
                headers=_auth(hr_token),
            ),
            200,
        )
        report["application"] = {
            "application_id": application_id,
            "created_status": application["status"],
            "stage_sequence": [under_review["status"], shortlisted["status"]],
            "stage_version": shortlisted["stage_version"],
        }

        alice_friend_ticket, bob_friend_ticket = await asyncio.gather(
            _ticket(client, alice_token, f"/chat/friends/{bob_id}/socket-ticket"),
            _ticket(client, bob_token, f"/chat/friends/{alice_id}/socket-ticket"),
        )
        alice_friend_url = f"{WS_URL}/chat/friends/{bob_id}/ws?ticket={alice_friend_ticket}"
        bob_friend_url = f"{WS_URL}/chat/friends/{alice_id}/ws?ticket={bob_friend_ticket}"
        async with (
            websockets.connect(alice_friend_url) as alice_socket,
            websockets.connect(bob_friend_url) as bob_socket,
        ):
            alice_ready = json.loads(await alice_socket.recv())
            bob_ready = json.loads(await bob_socket.recv())
            await asyncio.gather(
                alice_socket.send(
                    json.dumps(
                        {
                            "type": "message_send",
                            "client_message_id": "alice-1",
                            "content": "simultaneous from Alice",
                        }
                    )
                ),
                bob_socket.send(
                    json.dumps(
                        {
                            "type": "message_send",
                            "client_message_id": "bob-1",
                            "content": "simultaneous from Bob",
                        }
                    )
                ),
            )
            alice_events, bob_events = await asyncio.gather(
                _receive_types(alice_socket, {"message_ack", "message"}),
                _receive_types(bob_socket, {"message_ack", "message"}),
            )

        history = await _expect(
            await client.get(f"/chat/with/{bob_id}", headers=_auth(alice_token)), 200
        )
        simultaneous_contents = {
            "simultaneous from Alice",
            "simultaneous from Bob",
        }
        simultaneous_history = [
            message
            for message in history["messages"]
            if message["content"] in simultaneous_contents
        ]
        report["friend_realtime"] = {
            "both_ready": alice_ready["type"] == bob_ready["type"] == "ready",
            "alice_received": [event["type"] for event in alice_events],
            "bob_received": [event["type"] for event in bob_events],
            "history_contains_both": len(simultaneous_history) == 2,
            "history_order_is_stable": _ordered(simultaneous_history),
            "message_ids": [message["id"] for message in simultaneous_history],
        }

        offline_message = await _expect(
            await client.post(
                "/chat/send",
                json={"receiver_id": bob_id, "content": "sent while Bob reconnects"},
                headers=_auth(alice_token),
            ),
            200,
        )
        bob_reconnect_ticket = await _ticket(
            client, bob_token, f"/chat/friends/{alice_id}/socket-ticket"
        )
        reconnect_url = f"{WS_URL}/chat/friends/{alice_id}/ws?ticket={bob_reconnect_ticket}"
        async with websockets.connect(reconnect_url) as bob_reconnected:
            reconnect_ready = json.loads(await bob_reconnected.recv())
            recovered = await _expect(
                await client.get(f"/chat/with/{alice_id}", headers=_auth(bob_token)), 200
            )
            live_message = await _expect(
                await client.post(
                    "/chat/send",
                    json={"receiver_id": bob_id, "content": "live after reconnect"},
                    headers=_auth(alice_token),
                ),
                200,
            )
            reconnect_events = await _receive_types(bob_reconnected, {"message"})
        report["reconnect"] = {
            "new_single_use_ticket": bob_reconnect_ticket != bob_friend_ticket,
            "ready": reconnect_ready["type"] == "ready",
            "missed_history_recovered": any(
                message["id"] == offline_message["id"] for message in recovered["messages"]
            ),
            "live_delivery_resumed": any(
                event.get("message", {}).get("id") == live_message["id"]
                for event in reconnect_events
            ),
        }

        alice_recruit_ticket, hr_recruit_ticket = await asyncio.gather(
            _ticket(
                client,
                alice_token,
                f"/chat/recruitment/{application_id}/socket-ticket",
            ),
            _ticket(
                client,
                hr_token,
                f"/chat/recruitment/{application_id}/socket-ticket",
            ),
        )
        alice_recruit_url = (
            f"{WS_URL}/chat/recruitment/{application_id}/ws?ticket={alice_recruit_ticket}"
        )
        hr_recruit_url = (
            f"{WS_URL}/chat/recruitment/{application_id}/ws?ticket={hr_recruit_ticket}"
        )
        async with (
            websockets.connect(alice_recruit_url) as candidate_socket,
            websockets.connect(hr_recruit_url) as hr_socket,
        ):
            candidate_ready = json.loads(await candidate_socket.recv())
            hr_ready = json.loads(await hr_socket.recv())
            interview_at = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
            interview = await _expect(
                await client.patch(
                    f"/applications/{application_id}",
                    json={
                        "status": "interview",
                        "expected_version": 3,
                        "interview_scheduled_at": interview_at,
                        "interview_notes": "Realtime stage proof",
                    },
                    headers=_auth(hr_token),
                ),
                200,
            )
            candidate_state, hr_state = await asyncio.gather(
                _receive_types(candidate_socket, {"conversation_state"}),
                _receive_types(hr_socket, {"conversation_state"}),
            )
            await asyncio.gather(
                candidate_socket.send(
                    json.dumps(
                        {
                            "type": "message_send",
                            "client_message_id": "candidate-recruit-1",
                            "content": "candidate confirms interview",
                        }
                    )
                ),
                hr_socket.send(
                    json.dumps(
                        {
                            "type": "message_send",
                            "client_message_id": "hr-recruit-1",
                            "content": "recruiter confirms interview",
                        }
                    )
                ),
            )
            candidate_events, hr_events = await asyncio.gather(
                _receive_types(candidate_socket, {"message_ack", "message"}),
                _receive_types(hr_socket, {"message_ack", "message"}),
            )

        recruitment_history = await _expect(
            await client.get(
                f"/chat/recruitment/{application_id}/messages",
                headers=_auth(alice_token),
            ),
            200,
        )
        report["recruitment_realtime"] = {
            "both_ready": candidate_ready["type"] == hr_ready["type"] == "ready",
            "stage": interview["status"],
            "stage_version": interview["stage_version"],
            "candidate_received_stage": candidate_state[-1]["status"] == "interview",
            "hr_received_stage": hr_state[-1]["status"] == "interview",
            "candidate_received": [event["type"] for event in candidate_events],
            "hr_received": [event["type"] for event in hr_events],
            "history_order_is_stable": _ordered(recruitment_history["messages"]),
            "message_count": len(recruitment_history["messages"]),
        }

    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    asyncio.run(main())
