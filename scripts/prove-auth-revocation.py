#!/usr/bin/env python3
"""Prove password and logout revocation against an isolated deployment."""

from __future__ import annotations

import asyncio
import json
import os
import sys
import uuid
from pathlib import Path

import httpx
import websockets
from websockets.exceptions import ConnectionClosed


API_ROOT = Path(__file__).resolve().parents[1] / "apps" / "api"
sys.path.insert(0, str(API_ROOT))

from app.cache import get_async_redis  # noqa: E402
from app.database import AsyncSessionLocal  # noqa: E402
from app.models import Friendship, User, UserRole  # noqa: E402
from app.services.authentication import issue_access_token  # noqa: E402
from app.services.friendships import canonical_pair  # noqa: E402
from app.services.passwords import hash_password  # noqa: E402


HTTP_URL = os.getenv("AUTH_REVOCATION_PROOF_HTTP_URL", "http://127.0.0.1:8002").rstrip("/")
WS_URL = os.getenv("AUTH_REVOCATION_PROOF_WS_URL", "ws://127.0.0.1:8002").rstrip("/")
CURRENT_PASSWORD = "CurrentProofPass123!"
NEW_PASSWORD = "ChangedProofPass456!"


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _seed() -> dict[str, str]:
    run_id = uuid.uuid4().hex[:12]
    async with AsyncSessionLocal() as db:
        alice = User(
            email=f"revocation-alice-{run_id}@example.com",
            password_hash=hash_password(CURRENT_PASSWORD),
            role=UserRole.CANDIDATE,
            is_approved=True,
            is_active=True,
            full_name="Revocation Alice",
        )
        bob = User(
            email=f"revocation-bob-{run_id}@example.com",
            password_hash=hash_password(CURRENT_PASSWORD),
            role=UserRole.CANDIDATE,
            is_approved=True,
            is_active=True,
            full_name="Revocation Bob",
        )
        db.add_all([alice, bob])
        await db.flush()
        low, high = canonical_pair(alice.id, bob.id)
        db.add(
            Friendship(
                requester_id=alice.id,
                addressee_id=bob.id,
                pair_low_id=low,
                pair_high_id=high,
                status="ACCEPTED",
            )
        )
        await db.commit()
        await db.refresh(alice)
        await db.refresh(bob)
        return {
            "run_id": run_id,
            "alice_id": str(alice.id),
            "bob_id": str(bob.id),
            "alice_email": alice.email,
            "alice_token": issue_access_token(alice),
            "bob_token": issue_access_token(bob),
        }


async def _ticket(client: httpx.AsyncClient, token: str, peer_id: str) -> str:
    response = await client.post(
        f"/chat/friends/{peer_id}/socket-ticket", headers=_auth(token)
    )
    if response.status_code != 200:
        raise RuntimeError(response.text)
    return str(response.json()["ticket"])


async def main() -> None:
    proof = await _seed()
    report: dict[str, object] = {"run_id": proof["run_id"]}
    async with httpx.AsyncClient(base_url=HTTP_URL, timeout=15) as client:
        open_ticket, unused_ticket = await asyncio.gather(
            _ticket(client, proof["alice_token"], proof["bob_id"]),
            _ticket(client, proof["alice_token"], proof["bob_id"]),
        )
        open_url = f"{WS_URL}/chat/friends/{proof['bob_id']}/ws?ticket={open_ticket}"
        async with websockets.connect(open_url) as socket:
            ready = json.loads(await socket.recv())
            changed = await client.post(
                "/auth/account/password",
                json={
                    "current_password": CURRENT_PASSWORD,
                    "new_password": NEW_PASSWORD,
                },
                headers=_auth(proof["alice_token"]),
            )
            if changed.status_code != 200:
                raise RuntimeError(changed.text)
            delivered = await client.post(
                "/chat/send",
                json={
                    "receiver_id": proof["alice_id"],
                    "content": "must not reach the invalidated socket",
                },
                headers=_auth(proof["bob_token"]),
            )
            if delivered.status_code != 200:
                raise RuntimeError(delivered.text)
            try:
                await asyncio.wait_for(socket.recv(), timeout=5)
                open_socket_code = None
            except ConnectionClosed as exc:
                open_socket_code = exc.code

        unused_url = f"{WS_URL}/chat/friends/{proof['bob_id']}/ws?ticket={unused_ticket}"
        async with websockets.connect(unused_url) as stale_socket:
            try:
                await asyncio.wait_for(stale_socket.recv(), timeout=5)
                unused_ticket_code = None
            except ConnectionClosed as exc:
                unused_ticket_code = exc.code

        old_http = await client.get("/friends", headers=_auth(proof["alice_token"]))
        login = await client.post(
            "/auth/login",
            json={
                "email": proof["alice_email"],
                "password": NEW_PASSWORD,
                "account_type": "candidate",
            },
        )
        if login.status_code != 200:
            raise RuntimeError(login.text)
        fresh_token = str(login.json()["token"])
        logout = await client.post("/auth/logout", headers=_auth(fresh_token))
        if logout.status_code != 204:
            raise RuntimeError(logout.text)

        # Simulate a complete Redis restart/cache loss after logout.
        await get_async_redis().flushdb()
        after_restart = await client.get("/friends", headers=_auth(fresh_token))

        report["password_change"] = {
            "socket_was_ready": ready.get("type") == "ready",
            "open_socket_closed": open_socket_code == 4403,
            "open_socket_close_code": open_socket_code,
            "unused_ticket_rejected": unused_ticket_code == 4401,
            "unused_ticket_close_code": unused_ticket_code,
            "old_http_token_rejected": old_http.status_code == 401,
        }
        report["logout"] = {
            "logout_status": logout.status_code,
            "redis_was_flushed": True,
            "token_rejected_after_redis_restart": after_restart.status_code == 401,
        }

    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    asyncio.run(main())
