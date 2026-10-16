"""Deterministic regressions for admin CRUD and retention-safe organization removal."""

from inspect import unwrap
from unittest.mock import patch
from uuid import uuid4

import pytest

from app.models import AdminActivityLog, Company, Offer, OfferType, User, UserRole
from app.routers import admin
from app.schemas import AdminUserCreate
from app.services.authentication import AuthenticationRejected, ensure_account_can_authenticate


class _Scalars:
    def __init__(self, values: list[object]) -> None:
        self.values = values

    def scalars(self):
        return self

    def all(self) -> list[object]:
        return self.values


class _ArchiveDatabase:
    def __init__(self, company: Company, members: list[User], offers: list[Offer]) -> None:
        self.company = company
        self.results = [_Scalars(members), _Scalars(offers), _Scalars([])]
        self.added: list[object] = []
        self.commits = 0

    async def scalar(self, *_args, **_kwargs):
        return self.company

    async def execute(self, *_args, **_kwargs):
        return self.results.pop(0)

    def add(self, value: object) -> None:
        self.added.append(value)

    async def commit(self) -> None:
        self.commits += 1


class _CreateDatabase:
    def __init__(self) -> None:
        self.added: list[object] = []
        self.commits = 0

    async def scalar(self, *_args, **_kwargs):
        return None

    def add(self, value: object) -> None:
        self.added.append(value)

    async def flush(self) -> None:
        user = next(item for item in self.added if isinstance(item, User))
        user.id = user.id or uuid4()

    async def commit(self) -> None:
        self.commits += 1

    async def refresh(self, _value: object) -> None:
        return None


def _user(*, role: UserRole, company_id=None, company_role=None) -> User:
    return User(
        id=uuid4(),
        email=f"{uuid4().hex}@example.test",
        password_hash="unused",
        role=role,
        is_approved=True,
        is_active=True,
        full_name="Test User",
        company_id=company_id,
        company_role=company_role,
        auth_version=4,
    )


def test_deactivated_account_is_rejected_by_shared_authentication_gate() -> None:
    user = _user(role=UserRole.CANDIDATE)
    user.is_active = False
    with pytest.raises(AuthenticationRejected, match="deactivated"):
        ensure_account_can_authenticate(user)


@pytest.mark.asyncio
async def test_admin_creation_is_candidate_only_and_audited() -> None:
    database = _CreateDatabase()
    current_admin = _user(role=UserRole.PLATFORM_ADMIN)

    with patch.object(admin, "hash_password", return_value="$argon2id$test"):
        result = await unwrap(admin.create_admin_managed_user)(
            AdminUserCreate(
                email="Candidate@Example.com",
                password="StrongPassword123!",
                full_name="Candidate Person",
            ),
            current_admin,
            database,  # type: ignore[arg-type]
        )

    created = next(item for item in database.added if isinstance(item, User))
    assert created.email == "candidate@example.com"
    assert created.role == UserRole.CANDIDATE
    assert created.company_id is None
    assert created.is_active is True
    assert result.role == UserRole.CANDIDATE.value
    assert any(
        isinstance(item, AdminActivityLog) and item.action == "USER_CREATED"
        for item in database.added
    )
    assert database.commits == 1


@pytest.mark.asyncio
async def test_company_archive_revokes_access_and_closes_offers_without_deleting_history() -> None:
    current_admin = _user(role=UserRole.PLATFORM_ADMIN)
    company = Company(id=uuid4(), name="Archive Me", status="active")
    member = _user(
        role=UserRole.COMPANY_USER,
        company_id=company.id,
        company_role="OWNER",
    )
    offer = Offer(
        id=uuid4(),
        recruiter_id=member.id,
        company_id=company.id,
        title="Engineer",
        company=company.name,
        region="Remote",
        field="Engineering",
        type=OfferType.JOB,
        description="A sufficiently long description",
        requirements="A sufficiently long requirements list",
        active=True,
        opportunity_status="active",
    )
    database = _ArchiveDatabase(company, [member], [offer])

    result = await unwrap(admin.archive_company)(
        company.id,
        current_admin,
        database,  # type: ignore[arg-type]
    )

    assert company.status == "inactive"
    assert member.is_active is False
    assert member.auth_version == 5
    assert offer.active is False
    assert offer.opportunity_status == "closed"
    assert offer.closed_at is not None
    assert result.affected_users == 1
    assert result.closed_offers == 1
    assert any(
        isinstance(item, AdminActivityLog) and item.action == "COMPANY_ARCHIVED"
        for item in database.added
    )
    assert database.commits == 1
