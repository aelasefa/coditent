import unittest
import time
import uuid
from unittest.mock import AsyncMock, patch

from app.routers.chat import (
    _broadcast_recruitment_event,
    _recruitment_rooms,
    _socket_expirations,
    _socket_sessions,
    _socket_users,
)
from app.services.authentication import AuthenticationRejected


class _Socket:
    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail
        self.sent: list[dict] = []
        self.closed_with: int | None = None

    async def send_json(self, payload: dict) -> None:
        if self.fail:
            raise RuntimeError("connection closed")
        self.sent.append(payload)

    async def close(self, *, code: int) -> None:
        self.closed_with = code


class RecruitmentReadEventTests(unittest.IsolatedAsyncioTestCase):
    async def test_read_receipt_reaches_live_participants(self) -> None:
        room = "read-test-room"
        reader = _Socket()
        sender = _Socket()
        disconnected = _Socket(fail=True)
        _recruitment_rooms[room] = {reader, sender, disconnected}  # type: ignore[assignment]
        payload = {
            "type": "messages_read",
            "message_ids": ["message-id"],
            "reader_id": "reader-id",
            "read_at": "2026-09-29T12:00:00",
        }
        try:
            await _broadcast_recruitment_event(room, payload, publish=False)
            self.assertEqual(reader.sent, [payload])
            self.assertEqual(sender.sent, [payload])
            self.assertNotIn(disconnected, _recruitment_rooms[room])
        finally:
            _recruitment_rooms.pop(room, None)

    async def test_revoked_recipient_is_reauthorized_and_removed_before_delivery(self) -> None:
        room = "52f034df-f269-4f27-8792-d8e1090a7a86"
        revoked = _Socket()
        _recruitment_rooms[room] = {revoked}  # type: ignore[assignment]
        try:
            with patch(
                "app.routers.chat._socket_is_authorized",
                new=AsyncMock(return_value=False),
            ) as authorize:
                await _broadcast_recruitment_event(
                    room,
                    {"type": "message", "message": {"id": "secret"}},
                    publish=False,
                )
            authorize.assert_awaited_once_with(revoked, room)
            self.assertEqual(revoked.sent, [])
            self.assertEqual(revoked.closed_with, 4403)
            self.assertNotIn(room, _recruitment_rooms)
        finally:
            _recruitment_rooms.pop(room, None)

    async def test_session_revocation_disconnects_an_existing_socket(self) -> None:
        room = str(uuid.uuid4())
        socket = _Socket()
        _recruitment_rooms[room] = {socket}  # type: ignore[assignment]
        _socket_users[socket] = uuid.uuid4()  # type: ignore[index]
        _socket_sessions[socket] = uuid.uuid4()  # type: ignore[index]
        _socket_expirations[socket] = time.time() + 60  # type: ignore[index]
        try:
            with patch(
                "app.routers.chat.ensure_access_session_active",
                new=AsyncMock(side_effect=AuthenticationRejected("revoked")),
            ):
                await _broadcast_recruitment_event(
                    room,
                    {"type": "message", "message": {"id": "must-not-leak"}},
                    publish=False,
                )
            self.assertEqual(socket.sent, [])
            self.assertEqual(socket.closed_with, 4403)
            self.assertNotIn(room, _recruitment_rooms)
        finally:
            _recruitment_rooms.pop(room, None)


if __name__ == "__main__":
    unittest.main()
