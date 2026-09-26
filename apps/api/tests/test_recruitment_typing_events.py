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


class RecruitmentTypingEventTests(unittest.IsolatedAsyncioTestCase):
    async def test_typing_event_reaches_only_other_live_connections(self) -> None:
        room = "typing-test-room"
        sender = _Socket()
        receiver = _Socket()
        disconnected = _Socket(fail=True)
        _recruitment_rooms[room] = {sender, receiver, disconnected}  # type: ignore[assignment]

        payload = {"type": "typing_start", "sender_id": "candidate-id"}
        try:
            await _broadcast_recruitment_event(room, payload, exclude=sender)  # type: ignore[arg-type]

            self.assertEqual(sender.sent, [])
            self.assertEqual(receiver.sent, [payload])
            self.assertNotIn(disconnected, _recruitment_rooms[room])
        finally:
            _recruitment_rooms.pop(room, None)


if __name__ == "__main__":
    unittest.main()
