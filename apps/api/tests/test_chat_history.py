from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base
from app.models import ChatMessage
from app.services.chat_history import (
    decode_message_cursor,
    fetch_direct_message_page,
    fetch_recruitment_message_page,
)


def _ordered_uuid(index: int) -> uuid.UUID:
    # The alphabetic prefix keeps SQLite's UUID column from applying numeric
    # affinity to tiny all-zero UUID strings while preserving lexical order.
    return uuid.UUID(f"aaaaaaaa-aaaa-aaaa-aaaa-{index:012x}")


@pytest_asyncio.fixture
async def db() -> AsyncSession:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as session:
        yield session
    await engine.dispose()


@pytest.mark.asyncio
async def test_direct_history_cursor_recovers_all_messages_beyond_one_hundred(
    db: AsyncSession,
) -> None:
    viewer_id = uuid.uuid4()
    peer_id = uuid.uuid4()
    unrelated_id = uuid.uuid4()
    started = datetime(2026, 1, 1, 12, 0, 0)

    # Pairs share timestamps on purpose: the UUID is the deterministic second
    # half of the cursor and prevents skips or duplicates at a timestamp tie.
    for index in range(125):
        db.add(
            ChatMessage(
                id=_ordered_uuid(index + 1),
                sender_id=viewer_id if index % 2 == 0 else peer_id,
                receiver_id=peer_id if index % 2 == 0 else viewer_id,
                content=f"direct-{index:03d}",
                created_at=started + timedelta(seconds=index // 2),
            )
        )
    db.add(
        ChatMessage(
            sender_id=viewer_id,
            receiver_id=unrelated_id,
            content="different-direct-thread",
            created_at=started + timedelta(days=1),
        )
    )
    await db.commit()

    before = None
    all_messages: list[ChatMessage] = []
    page_count = 0
    while True:
        page = await fetch_direct_message_page(
            db,
            viewer_id,
            peer_id,
            before=before,
            limit=37,
        )
        page_count += 1
        # Older pages belong before pages already collected.
        all_messages = page.messages + all_messages
        if not page.has_more:
            assert page.next_cursor is None
            break
        assert page.next_cursor is not None
        decode_message_cursor(page.next_cursor)
        before = page.next_cursor

    assert page_count == 4
    assert [message.content for message in all_messages] == [
        f"direct-{index:03d}" for index in range(125)
    ]
    assert len({message.id for message in all_messages}) == 125


@pytest.mark.asyncio
async def test_first_page_is_latest_and_recruitment_identity_stays_isolated(
    db: AsyncSession,
) -> None:
    viewer_id = uuid.uuid4()
    peer_id = uuid.uuid4()
    application_id = uuid.uuid4()
    other_application_id = uuid.uuid4()
    started = datetime(2026, 2, 1, 9, 0, 0)
    for index in range(105):
        db.add(
            ChatMessage(
                id=_ordered_uuid(10_000 + index),
                sender_id=viewer_id,
                receiver_id=peer_id,
                application_id=application_id,
                content=f"recruitment-{index:03d}",
                created_at=started + timedelta(seconds=index),
            )
        )
    db.add(
        ChatMessage(
            sender_id=viewer_id,
            receiver_id=peer_id,
            application_id=other_application_id,
            content="other-application",
            created_at=started + timedelta(days=1),
        )
    )
    db.add(
        ChatMessage(
            sender_id=viewer_id,
            receiver_id=peer_id,
            application_id=None,
            content="direct-message",
            created_at=started + timedelta(days=1),
        )
    )
    await db.commit()

    page = await fetch_recruitment_message_page(db, application_id, limit=20)
    assert [message.content for message in page.messages] == [
        f"recruitment-{index:03d}" for index in range(85, 105)
    ]
    assert page.has_more is True
    assert page.next_cursor is not None


def test_message_cursor_rejects_malformed_or_oversized_values() -> None:
    with pytest.raises(ValueError, match="Invalid message cursor"):
        decode_message_cursor("not-a-cursor")
    with pytest.raises(ValueError, match="Invalid message cursor"):
        decode_message_cursor("x" * 257)
