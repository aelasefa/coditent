"""Redis-backed cross-process fanout for recruitment chat events."""

from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import AsyncIterator, Callable
from typing import Any

from app.cache import get_async_redis
from app.observability import get_logger


logger = get_logger("chat.realtime")

BROKER_MESSAGE_VERSION = 1
MAX_BROKER_MESSAGE_BYTES = 64 * 1024
RECONNECT_DELAY_SECONDS = 1.0


def recruitment_channel(application_id: str) -> str:
    # Application ids are validated UUID path parameters before reaching this
    # module, and are used only as a Redis channel suffix.
    return f"chat:recruitment:{application_id}"


def friend_channel(pair_key: str) -> str:
    return f"chat:friend:{pair_key}"


class RedisChatBroker:
    """Publish and subscribe to one room across independent API processes.

    Every API process has a random instance id. Subscribers ignore events
    published by their own process because those are delivered immediately by
    the router's local room manager. Redis then carries only remote-process
    delivery, preventing duplicate frames while preserving a low-latency local
    path if Redis briefly reconnects.
    """

    def __init__(
        self,
        redis_factory: Callable[[], Any] = get_async_redis,
        *,
        instance_id: str | None = None,
    ) -> None:
        self._redis_factory = redis_factory
        self.instance_id = instance_id or uuid.uuid4().hex

    async def publish(self, application_id: str, event: dict[str, Any]) -> bool:
        return await self._publish(
            recruitment_channel(application_id), application_id, event
        )

    async def publish_friend(self, pair_key: str, event: dict[str, Any]) -> bool:
        return await self._publish(friend_channel(pair_key), pair_key, event)

    async def _publish(
        self, channel: str, room: str, event: dict[str, Any]
    ) -> bool:
        envelope = {
            "v": BROKER_MESSAGE_VERSION,
            "origin": self.instance_id,
            "room": room,
            "event": event,
        }
        encoded = json.dumps(envelope, separators=(",", ":"), default=str)
        if len(encoded.encode("utf-8")) > MAX_BROKER_MESSAGE_BYTES:
            logger.warning("chat_broker_event_too_large")
            return False
        try:
            await self._redis_factory().publish(channel, encoded)
            return True
        except Exception as exc:  # Redis failure must not roll back a persisted message.
            logger.warning("chat_broker_publish_failed", exception_type=type(exc).__name__)
            return False

    async def remote_events(self, application_id: str) -> AsyncIterator[dict[str, Any]]:
        """Yield validated events from other API processes, reconnecting safely."""
        async for event in self._remote_events(
            recruitment_channel(application_id), application_id
        ):
            yield event

    async def remote_friend_events(self, pair_key: str) -> AsyncIterator[dict[str, Any]]:
        async for event in self._remote_events(friend_channel(pair_key), pair_key):
            yield event

    async def _remote_events(
        self, channel: str, room: str
    ) -> AsyncIterator[dict[str, Any]]:
        while True:
            pubsub = None
            try:
                pubsub = self._redis_factory().pubsub(ignore_subscribe_messages=True)
                await pubsub.subscribe(channel)
                while True:
                    message = await pubsub.get_message(
                        ignore_subscribe_messages=True,
                        timeout=1.0,
                    )
                    if message is None:
                        await asyncio.sleep(0)
                        continue
                    event = self._decode_remote_event(room, message.get("data"))
                    if event is not None:
                        yield event
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning(
                    "chat_broker_subscription_failed",
                    exception_type=type(exc).__name__,
                )
                await asyncio.sleep(RECONNECT_DELAY_SECONDS)
            finally:
                if pubsub is not None:
                    try:
                        await pubsub.unsubscribe(channel)
                    except Exception:
                        pass
                    try:
                        close = getattr(pubsub, "aclose", None) or getattr(pubsub, "close", None)
                        if close is not None:
                            result = close()
                            if hasattr(result, "__await__"):
                                await result
                    except Exception:
                        pass

    def _decode_remote_event(
        self,
        application_id: str,
        raw: str | bytes | object,
    ) -> dict[str, Any] | None:
        try:
            if isinstance(raw, bytes):
                if len(raw) > MAX_BROKER_MESSAGE_BYTES:
                    return None
                raw = raw.decode("utf-8")
            if not isinstance(raw, str) or len(raw.encode("utf-8")) > MAX_BROKER_MESSAGE_BYTES:
                return None
            envelope = json.loads(raw)
            if (
                not isinstance(envelope, dict)
                or envelope.get("v") != BROKER_MESSAGE_VERSION
                or envelope.get("room") != application_id
                or envelope.get("origin") == self.instance_id
                or not isinstance(envelope.get("event"), dict)
            ):
                return None
            return envelope["event"]
        except (UnicodeDecodeError, json.JSONDecodeError, TypeError, ValueError):
            return None


chat_broker = RedisChatBroker()
