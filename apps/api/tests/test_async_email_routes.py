"""Focused assertions for durable OTP and invitation delivery."""

from inspect import unwrap
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from starlette.requests import Request

from app.models import EmailDelivery, User, UserRole
from app.schemas import CompanyInviteCreateRequest, EmailChangeRequest, RegisterRequest


class _EmptyResult:
    def scalar_one_or_none(self):
        return None

    def mappings(self):
        return self

    def first(self):
        return None


class _RouteDatabase:
    def __init__(self) -> None:
        self.commits = 0
        self.rollbacks = 0

    async def execute(self, *_args, **_kwargs):
        return _EmptyResult()

    async def scalar(self, *_args, **_kwargs):
        return None

    async def flush(self) -> None:
        return None

    async def commit(self) -> None:
        self.commits += 1

    async def rollback(self) -> None:
        self.rollbacks += 1


def _request(path: str) -> Request:
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": path,
            "headers": [],
            "client": ("127.0.0.1", 44001),
        }
    )


@pytest.mark.asyncio
async def test_registration_queues_delivery_before_commit() -> None:
    from app.routers import auth

    database = _RouteDatabase()
    delivery = EmailDelivery(id=uuid4(), status="pending")
    queue = AsyncMock(return_value=delivery)
    deliver = AsyncMock(return_value="sent")

    with (
        patch.object(auth, "_queue_registration_code", queue),
        patch.object(auth, "deliver_email_job", deliver),
    ):
        result = await unwrap(auth.register)(
            RegisterRequest(
                email="offload-candidate@example.com",
                password="StrongPass123!",
                full_name="Offload Candidate",
            ),
            _request("/auth/register"),
            database,  # type: ignore[arg-type]
        )

    assert result.email == "offload-candidate@example.com"
    assert result.delivery_status == "sent"
    assert database.commits == 1
    queue.assert_awaited_once()
    deliver.assert_awaited_once_with(database, delivery.id, worker_id="api-immediate")


@pytest.mark.asyncio
async def test_company_invitation_queues_delivery_before_commit() -> None:
    from app.routers import invitations

    database = _RouteDatabase()
    admin = User(
        id=uuid4(),
        email="admin@example.com",
        password_hash="unused",
        role=UserRole.PLATFORM_ADMIN,
        is_approved=True,
        full_name="Platform Admin",
    )
    delivery = EmailDelivery(id=uuid4(), status="pending")
    queue = AsyncMock(return_value=delivery)
    attempt = AsyncMock(return_value=(True, "sent", None))

    with (
        patch.object(invitations, "_queue_company_invite_email", queue),
        patch.object(invitations, "_attempt_queued_delivery", attempt),
        patch.object(invitations, "log_audit", AsyncMock(return_value=None)),
    ):
        result = await invitations.invite_company(
            CompanyInviteCreateRequest(email="owner@example.com", company_name="Atlas Labs"),
            admin,
            database,  # type: ignore[arg-type]
        )

    assert result["email_sent"] is True
    assert result["delivery_status"] == "sent"
    assert result["delivery_id"] == delivery.id
    assert database.commits == 1
    queue.assert_awaited_once()
    attempt.assert_awaited_once_with(database, delivery)


@pytest.mark.asyncio
async def test_email_change_queues_expiring_delivery() -> None:
    from app.routers import auth

    database = _RouteDatabase()
    user = User(
        id=uuid4(),
        email="candidate@example.com",
        password_hash="unused",
        role=UserRole.CANDIDATE,
        is_approved=True,
        full_name="Candidate Person",
    )
    delivery = EmailDelivery(id=uuid4(), status="pending")
    queue = AsyncMock(return_value=delivery)
    deliver = AsyncMock(return_value="retry")

    with (
        patch.object(auth, "_verify_sensitive_action", AsyncMock(return_value=user)),
        patch.object(auth, "_queue_email_change_code", queue),
        patch.object(auth, "deliver_email_job", deliver),
    ):
        result = await unwrap(auth.request_email_change)(
            EmailChangeRequest(
                current_password="StrongPass123!",
                new_email="new-candidate@example.com",
            ),
            _request("/auth/account/email/request"),
            user,
            database,  # type: ignore[arg-type]
        )

    assert result["delivery_status"] == "retry"
    assert user.pending_email == "new-candidate@example.com"
    assert user.pending_email_expires_at is not None
    assert database.commits == 1
    queue.assert_awaited_once()
    deliver.assert_awaited_once_with(database, delivery.id, worker_id="api-immediate")
