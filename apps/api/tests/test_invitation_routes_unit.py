"""Deterministic invitation route regressions without provider or live DB access."""

from datetime import datetime, timedelta
from inspect import unwrap
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.models import Company, User, UserRole
from app.routers import invitations
from app.schemas import CompanyInviteAcceptRequest


class _MappingResult:
    def __init__(self, row):
        self._row = row

    def mappings(self):
        return self

    def first(self):
        return self._row

    def scalar_one_or_none(self):
        return self._row


class _AcceptCompanyDatabase:
    def __init__(self) -> None:
        self.results = [
            _MappingResult(
                {
                    "id": uuid4(),
                    "email": "owner@example.com",
                    "company_name": "Atlas Labs",
                    "status": "pending",
                    "expires_at": datetime.utcnow() + timedelta(days=1),
                }
            ),
            _MappingResult(None),
            _MappingResult(None),
        ]
        self.added: list[object] = []
        self.flushes = 0
        self.commits = 0

    async def execute(self, *_args, **_kwargs):
        return self.results.pop(0)

    def add(self, value: object) -> None:
        self.added.append(value)

    async def flush(self) -> None:
        self.flushes += 1
        value = self.added[-1]
        if isinstance(value, (Company, User)) and value.id is None:
            value.id = uuid4()

    async def commit(self) -> None:
        self.commits += 1


@pytest.mark.asyncio
async def test_company_accept_flushes_user_before_assigning_owner() -> None:
    database = _AcceptCompanyDatabase()

    with (
        patch.object(invitations, "hash_password", return_value="$argon2id$test-hash"),
        patch.object(invitations, "log_audit", AsyncMock(return_value=None)),
    ):
        result = await unwrap(invitations.accept_company_invite)(
            CompanyInviteAcceptRequest(
                token="valid-company-invitation-token",
                password="StrongPassword123!",
                full_name="Company Owner",
            ),
            database,  # type: ignore[arg-type]
        )

    company = next(value for value in database.added if isinstance(value, Company))
    user = next(value for value in database.added if isinstance(value, User))
    assert database.flushes == 2
    assert company.owner_id is not None
    assert company.owner_id == user.id
    assert user.role == UserRole.COMPANY_USER
    assert user.company_role == "OWNER"
    assert result["company_id"] == str(company.id)
    assert database.commits == 1
