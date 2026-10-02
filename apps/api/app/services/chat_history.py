"""Stable, bounded keyset pagination for chat message history.

Chat history is ordered by ``(created_at, id)`` rather than an offset.  The
UUID tie-breaker makes the cursor stable when multiple messages share the same
database timestamp, while fetching in descending order ensures the initial
page always contains the newest messages.  Rows are returned chronologically
so existing chat clients can render them without reordering.
"""

from __future__ import annotations

import base64
import json
import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import Select, and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ChatMessage


DEFAULT_MESSAGE_PAGE_SIZE = 50
MAX_MESSAGE_PAGE_SIZE = 100


@dataclass(frozen=True)
class MessageCursor:
    created_at: datetime
    message_id: uuid.UUID


@dataclass(frozen=True)
class MessagePage:
    messages: list[ChatMessage]
    next_cursor: str | None
    has_more: bool


def encode_message_cursor(message: ChatMessage) -> str:
    """Return an opaque URL-safe cursor for the message immediately before it."""
    payload = json.dumps(
        {"t": message.created_at.isoformat(), "i": str(message.id)},
        separators=(",", ":"),
    ).encode("utf-8")
    return base64.urlsafe_b64encode(payload).rstrip(b"=").decode("ascii")


def decode_message_cursor(value: str) -> MessageCursor:
    """Decode and strictly validate a client cursor.

    Cursor contents are only ordering inputs, never authorization inputs.
    Malformed or oversized cursors are rejected instead of falling back to a
    different page, which avoids accidental history duplication.
    """
    if not value or len(value) > 256:
        raise ValueError("Invalid message cursor")
    try:
        padded = value + "=" * (-len(value) % 4)
        raw = base64.b64decode(padded, altchars=b"-_", validate=True)
        data = json.loads(raw.decode("utf-8"))
        if not isinstance(data, dict) or set(data) != {"t", "i"}:
            raise ValueError
        created_at = datetime.fromisoformat(data["t"])
        message_id = uuid.UUID(data["i"])
    except (UnicodeDecodeError, ValueError, TypeError, json.JSONDecodeError) as exc:
        raise ValueError("Invalid message cursor") from exc
    return MessageCursor(created_at=created_at, message_id=message_id)


async def fetch_message_page(
    db: AsyncSession,
    statement: Select[tuple[ChatMessage]],
    *,
    before: str | None = None,
    limit: int = DEFAULT_MESSAGE_PAGE_SIZE,
) -> MessagePage:
    """Fetch a newest-first keyset page and return its rows chronologically."""
    if limit < 1 or limit > MAX_MESSAGE_PAGE_SIZE:
        raise ValueError(f"Message page limit must be between 1 and {MAX_MESSAGE_PAGE_SIZE}")

    if before:
        cursor = decode_message_cursor(before)
        statement = statement.where(
            or_(
                ChatMessage.created_at < cursor.created_at,
                and_(
                    ChatMessage.created_at == cursor.created_at,
                    ChatMessage.id < cursor.message_id,
                ),
            )
        )

    result = await db.execute(
        statement.order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc()).limit(limit + 1)
    )
    newest_first = list(result.scalars().all())
    has_more = len(newest_first) > limit
    page_rows = newest_first[:limit]
    next_cursor = encode_message_cursor(page_rows[-1]) if has_more and page_rows else None
    return MessagePage(
        messages=list(reversed(page_rows)),
        next_cursor=next_cursor,
        has_more=has_more,
    )


async def fetch_direct_message_page(
    db: AsyncSession,
    viewer_id: uuid.UUID,
    peer_id: uuid.UUID,
    *,
    before: str | None = None,
    limit: int = DEFAULT_MESSAGE_PAGE_SIZE,
) -> MessagePage:
    return await fetch_message_page(
        db,
        select(ChatMessage).where(
            ChatMessage.application_id.is_(None),
            or_(
                and_(
                    ChatMessage.sender_id == viewer_id,
                    ChatMessage.receiver_id == peer_id,
                ),
                and_(
                    ChatMessage.sender_id == peer_id,
                    ChatMessage.receiver_id == viewer_id,
                ),
            ),
        ),
        before=before,
        limit=limit,
    )


async def fetch_recruitment_message_page(
    db: AsyncSession,
    application_id: uuid.UUID,
    *,
    before: str | None = None,
    limit: int = DEFAULT_MESSAGE_PAGE_SIZE,
) -> MessagePage:
    return await fetch_message_page(
        db,
        select(ChatMessage).where(ChatMessage.application_id == application_id),
        before=before,
        limit=limit,
    )
