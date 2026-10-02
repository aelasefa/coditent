from __future__ import annotations

import time
import uuid
from unittest.mock import AsyncMock

import pytest

import app.services.socket_tickets as socket_tickets
from app.services.authentication import AuthenticationRejected


class _FakeRedis:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}

    async def set(self, key: str, value: str, **_: object) -> bool:
        if key in self.values:
            return False
        self.values[key] = value
        return True

    async def getdel(self, key: str) -> str | None:
        return self.values.pop(key, None)


@pytest.mark.asyncio
async def test_socket_ticket_is_application_bound_and_single_use(monkeypatch) -> None:
    redis = _FakeRedis()
    check_session = AsyncMock()
    monkeypatch.setattr(socket_tickets, "get_async_redis", lambda: redis)
    monkeypatch.setattr(socket_tickets, "ensure_access_session_active", check_session)
    user_id = uuid.uuid4()
    application_id = uuid.uuid4()
    session_id = uuid.uuid4()

    ticket = await socket_tickets.create_socket_ticket(
        user_id=user_id,
        application_id=application_id,
        session_id=str(session_id),
        expires_at=int(time.time()) + 60,
    )
    parsed = await socket_tickets.consume_socket_ticket(
        ticket,
        application_id=application_id,
    )
    assert parsed.user_id == user_id
    assert parsed.application_id == application_id
    assert parsed.session_id == session_id
    check_session.assert_awaited_once_with({"sid": str(session_id)})

    with pytest.raises(AuthenticationRejected, match="expired or already used"):
        await socket_tickets.consume_socket_ticket(ticket, application_id=application_id)


@pytest.mark.asyncio
async def test_socket_ticket_rejects_wrong_application_and_expired_session(monkeypatch) -> None:
    redis = _FakeRedis()
    monkeypatch.setattr(socket_tickets, "get_async_redis", lambda: redis)
    monkeypatch.setattr(
        socket_tickets,
        "ensure_access_session_active",
        AsyncMock(side_effect=AuthenticationRejected("Access session revoked")),
    )
    application_id = uuid.uuid4()
    common = {
        "user_id": uuid.uuid4(),
        "application_id": application_id,
        "session_id": str(uuid.uuid4()),
        "expires_at": int(time.time()) + 60,
    }

    wrong_application_ticket = await socket_tickets.create_socket_ticket(**common)
    with pytest.raises(AuthenticationRejected, match="does not match"):
        await socket_tickets.consume_socket_ticket(
            wrong_application_ticket,
            application_id=uuid.uuid4(),
        )

    revoked_ticket = await socket_tickets.create_socket_ticket(**common)
    with pytest.raises(AuthenticationRejected, match="revoked"):
        await socket_tickets.consume_socket_ticket(
            revoked_ticket,
            application_id=application_id,
        )
