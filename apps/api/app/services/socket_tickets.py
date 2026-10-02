from __future__ import annotations

import hashlib
import json
import secrets
from dataclasses import dataclass
from uuid import UUID

from redis.exceptions import RedisError

from app.cache import get_async_redis
from app.services.authentication import (
    AuthenticationRejected,
    AuthenticationStoreUnavailable,
    ensure_access_session_active,
)


SOCKET_TICKET_TTL_SECONDS = 30


@dataclass(frozen=True)
class SocketTicket:
    user_id: UUID
    application_id: UUID
    session_id: UUID
    expires_at: int


def _ticket_key(ticket: str) -> str:
    digest = hashlib.sha256(ticket.encode()).hexdigest()
    return f"auth:socket-ticket:{digest}"


async def create_socket_ticket(
    *,
    user_id: UUID,
    application_id: UUID,
    session_id: str,
    expires_at: int,
) -> str:
    try:
        normalized_session_id = str(UUID(session_id))
    except (TypeError, ValueError, AttributeError) as exc:
        raise AuthenticationRejected("Invalid access session") from exc
    if isinstance(expires_at, bool) or not isinstance(expires_at, int) or expires_at <= 0:
        raise AuthenticationRejected("Invalid access session")

    ticket = secrets.token_urlsafe(32)
    payload = json.dumps(
        {
            "user_id": str(user_id),
            "application_id": str(application_id),
            "session_id": normalized_session_id,
            "expires_at": expires_at,
        }
    )
    try:
        stored = await get_async_redis().set(
            _ticket_key(ticket),
            payload,
            ex=SOCKET_TICKET_TTL_SECONDS,
            nx=True,
        )
    except RedisError as exc:
        raise AuthenticationStoreUnavailable("Socket ticket store unavailable") from exc
    if not stored:
        raise AuthenticationStoreUnavailable("Socket ticket store unavailable")
    return ticket


async def consume_socket_ticket(ticket: str, *, application_id: UUID) -> SocketTicket:
    if not ticket or len(ticket) > 200:
        raise AuthenticationRejected("Invalid socket ticket")
    try:
        raw_payload = await get_async_redis().getdel(_ticket_key(ticket))
    except RedisError as exc:
        raise AuthenticationStoreUnavailable("Socket ticket store unavailable") from exc
    if not raw_payload:
        raise AuthenticationRejected("Socket ticket expired or already used")
    try:
        payload = json.loads(raw_payload)
        parsed = SocketTicket(
            user_id=UUID(str(payload["user_id"])),
            application_id=UUID(str(payload["application_id"])),
            session_id=UUID(str(payload["session_id"])),
            expires_at=int(payload["expires_at"]),
        )
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise AuthenticationRejected("Invalid socket ticket") from exc
    if parsed.application_id != application_id:
        raise AuthenticationRejected("Socket ticket does not match this application")
    from time import time

    if parsed.expires_at <= int(time()):
        raise AuthenticationRejected("Access session expired")
    await ensure_access_session_active({"sid": str(parsed.session_id)})
    return parsed
