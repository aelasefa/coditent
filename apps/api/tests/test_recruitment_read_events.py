import unittest

from app.routers.chat import _broadcast_recruitment_event, _recruitment_rooms


class _Socket:
    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail
        self.sent: list[dict] = []

    async def send_json(self, payload: dict) -> None:
        if self.fail:
            raise RuntimeError("connection closed")
        self.sent.append(payload)


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
            await _broadcast_recruitment_event(room, payload)
            self.assertEqual(reader.sent, [payload])
            self.assertEqual(sender.sent, [payload])
            self.assertNotIn(disconnected, _recruitment_rooms[room])
        finally:
            _recruitment_rooms.pop(room, None)


if __name__ == "__main__":
    unittest.main()
