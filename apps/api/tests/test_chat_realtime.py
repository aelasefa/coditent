from __future__ import annotations

import asyncio
from collections import defaultdict

import pytest

from app.services.chat_realtime import RedisChatBroker


class _FakeBus:
    def __init__(self) -> None:
        self.queues: dict[str, set[asyncio.Queue]] = defaultdict(set)
        self.subscribed = asyncio.Event()


class _FakePubSub:
    def __init__(self, bus: _FakeBus) -> None:
        self.bus = bus
        self.channels: set[str] = set()
        self.queue: asyncio.Queue = asyncio.Queue()

    async def subscribe(self, channel: str) -> None:
        self.channels.add(channel)
        self.bus.queues[channel].add(self.queue)
        self.bus.subscribed.set()

    async def unsubscribe(self, channel: str) -> None:
        self.bus.queues[channel].discard(self.queue)
        self.channels.discard(channel)

    async def get_message(self, **_: object) -> dict | None:
        try:
            data = await asyncio.wait_for(self.queue.get(), timeout=0.05)
        except TimeoutError:
            return None
        return {"type": "message", "data": data}

    async def aclose(self) -> None:
        for channel in list(self.channels):
            await self.unsubscribe(channel)


class _FakeRedis:
    def __init__(self, bus: _FakeBus) -> None:
        self.bus = bus

    def pubsub(self, **_: object) -> _FakePubSub:
        return _FakePubSub(self.bus)

    async def publish(self, channel: str, data: str) -> int:
        queues = list(self.bus.queues[channel])
        for queue in queues:
            await queue.put(data)
        return len(queues)


@pytest.mark.asyncio
async def test_redis_broker_fans_out_between_api_instances_without_echo() -> None:
    bus = _FakeBus()
    redis = _FakeRedis(bus)
    first = RedisChatBroker(lambda: redis, instance_id="api-a")
    second = RedisChatBroker(lambda: redis, instance_id="api-b")
    room = "52f034df-f269-4f27-8792-d8e1090a7a86"
    event = {"type": "message", "message": {"id": "message-id"}}

    stream = second.remote_events(room)
    next_event = asyncio.create_task(anext(stream))
    await asyncio.wait_for(bus.subscribed.wait(), timeout=1)
    assert await first.publish(room, event) is True
    assert await asyncio.wait_for(next_event, timeout=1) == event
    await stream.aclose()

    # An instance ignores its own Redis copy because local fanout already
    # delivered it. This is what prevents duplicate frames.
    own_envelope = (
        '{"v":1,"origin":"api-a","room":"'
        + room
        + '","event":{"type":"message"}}'
    )
    assert first._decode_remote_event(room, own_envelope) is None


@pytest.mark.asyncio
async def test_friend_broker_fans_out_between_api_instances() -> None:
    bus = _FakeBus()
    redis = _FakeRedis(bus)
    first = RedisChatBroker(lambda: redis, instance_id="api-a")
    second = RedisChatBroker(lambda: redis, instance_id="api-b")
    pair = "11111111-1111-1111-1111-111111111111:22222222-2222-2222-2222-222222222222"
    event = {"type": "relationship_revoked"}

    stream = second.remote_friend_events(pair)
    next_event = asyncio.create_task(anext(stream))
    await asyncio.wait_for(bus.subscribed.wait(), timeout=1)
    assert await first.publish_friend(pair, event) is True
    assert await asyncio.wait_for(next_event, timeout=1) == event
    await stream.aclose()


def test_broker_rejects_wrong_room_and_oversized_payloads() -> None:
    broker = RedisChatBroker(lambda: None, instance_id="api-a")
    wrong_room = '{"v":1,"origin":"api-b","room":"other","event":{"type":"message"}}'
    assert broker._decode_remote_event("expected", wrong_room) is None
    assert broker._decode_remote_event("expected", "x" * (64 * 1024 + 1)) is None
