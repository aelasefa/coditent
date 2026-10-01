"""Deterministic coverage for the shared password policy and hash migration."""

from collections.abc import Callable
from inspect import unwrap
from uuid import uuid4

import httpx
import pytest
from passlib.hash import bcrypt
from pydantic import ValidationError
from starlette.requests import Request

from app.models import User, UserRole
from app.schemas import (
    CompanyInviteAcceptRequest,
    EmployeeInviteAcceptRequest,
    PasswordChangeRequest,
    RegisterRequest,
)
from app.services.admin_seed import seed_admin_user
from app.services.passwords import (
    hash_password,
    verify_password,
    verify_password_and_rehash,
)


SchemaBuilder = Callable[[str], object]


PASSWORD_ENTRY_POINTS: list[tuple[str, SchemaBuilder]] = [
    (
        "candidate_registration",
        lambda password: RegisterRequest(
            email="candidate@example.com",
            password=password,
            full_name="Candidate User",
        ),
    ),
    (
        "password_change",
        lambda password: PasswordChangeRequest(
            current_password="CurrentPass123!",
            new_password=password,
        ),
    ),
    (
        "company_invitation",
        lambda password: CompanyInviteAcceptRequest(
            token="company-invitation-token",
            password=password,
            full_name="Company Owner",
        ),
    ),
    (
        "employee_invitation",
        lambda password: EmployeeInviteAcceptRequest(
            token="employee-invitation-token",
            password=password,
            full_name="New Employee",
        ),
    ),
]


WEAK_PASSWORDS = [
    "Short1!a",
    "NOLOWERCASE123!",
    "nouppercase123!",
    "NoNumbersHere!",
    "NoSymbols1234",
]


@pytest.mark.parametrize("entry_name,builder", PASSWORD_ENTRY_POINTS, ids=lambda value: value if isinstance(value, str) else None)
@pytest.mark.parametrize("password", WEAK_PASSWORDS)
def test_every_typed_password_entry_point_rejects_the_same_weak_passwords(
    entry_name: str,
    builder: SchemaBuilder,
    password: str,
) -> None:
    del entry_name
    with pytest.raises(ValidationError):
        builder(password)


@pytest.mark.parametrize("entry_name,builder", PASSWORD_ENTRY_POINTS, ids=lambda value: value if isinstance(value, str) else None)
def test_every_typed_password_entry_point_accepts_a_password_over_72_bytes(
    entry_name: str,
    builder: SchemaBuilder,
) -> None:
    del entry_name
    password = "Aa1!" + ("x" * 69)
    assert len(password.encode("utf-8")) == 73
    builder(password)


def test_argon2id_distinguishes_passwords_after_the_bcrypt_boundary() -> None:
    shared_72_bytes = "Aa1!" + ("x" * 68)
    first = f"{shared_72_bytes}A"
    second = f"{shared_72_bytes}B"
    assert len(shared_72_bytes.encode("utf-8")) == 72

    password_hash = hash_password(first)

    assert password_hash.startswith("$argon2id$")
    assert verify_password(first, password_hash) is True
    assert verify_password(second, password_hash) is False


def test_short_legacy_bcrypt_password_is_verified_and_rehashed() -> None:
    password = "LegacyPass123!"
    legacy_hash = bcrypt.using(rounds=4).hash(password)

    verified, replacement_hash = verify_password_and_rehash(password, legacy_hash)

    assert verified is True
    assert replacement_hash is not None
    assert replacement_hash.startswith("$argon2id$")
    assert verify_password(password, replacement_hash) is True


def test_long_legacy_bcrypt_password_is_rejected_instead_of_truncated() -> None:
    shared_72_bytes = "Aa1!" + ("x" * 68)
    first = f"{shared_72_bytes}A"
    second = f"{shared_72_bytes}B"
    legacy_hash = bcrypt.using(rounds=4).hash(first)

    assert verify_password(first, legacy_hash) is False
    assert verify_password(second, legacy_hash) is False


class _DatabaseMustNotBeCalled:
    async def execute(self, *_args, **_kwargs):
        raise AssertionError("password policy must run before database access")


@pytest.mark.asyncio
@pytest.mark.parametrize("password", WEAK_PASSWORDS)
async def test_admin_seed_enforces_the_shared_password_policy(password: str) -> None:
    with pytest.raises(ValueError):
        await seed_admin_user(
            _DatabaseMustNotBeCalled(),  # type: ignore[arg-type]
            email="admin@example.com",
            password=password,
            full_name="Platform Admin",
        )


class _EmptyResult:
    def scalar_one_or_none(self):
        return None


class _CreatingDatabase:
    def __init__(self) -> None:
        self.added = []

    async def execute(self, *_args, **_kwargs):
        return _EmptyResult()

    def add(self, value) -> None:
        self.added.append(value)

    async def commit(self) -> None:
        return None

    async def refresh(self, _value) -> None:
        return None


@pytest.mark.asyncio
async def test_admin_seed_creates_an_argon2id_hash() -> None:
    database = _CreatingDatabase()

    user, created = await seed_admin_user(
        database,  # type: ignore[arg-type]
        email="admin@example.com",
        password="AdminStrong123!",
        full_name="Platform Admin",
    )

    assert created is True
    assert user.password_hash.startswith("$argon2id$")
    assert verify_password("AdminStrong123!", user.password_hash) is True


class _UserResult:
    def __init__(self, user: User) -> None:
        self.user = user

    def scalar_one_or_none(self) -> User:
        return self.user


class _LoginDatabase:
    def __init__(self, user: User) -> None:
        self.user = user
        self.commits = 0

    async def execute(self, *_args, **_kwargs):
        return _UserResult(self.user)

    async def commit(self) -> None:
        self.commits += 1


@pytest.mark.asyncio
async def test_successful_login_persists_the_legacy_bcrypt_upgrade() -> None:
    from app.routers.auth import login
    from app.schemas import LoginRequest

    password = "LegacyLogin123!"
    user = User(
        id=uuid4(),
        email="legacy@example.com",
        password_hash=bcrypt.using(rounds=4).hash(password),
        role=UserRole.CANDIDATE,
        is_approved=True,
        is_2fa_enabled=False,
        full_name="Legacy User",
    )
    database = _LoginDatabase(user)
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/auth/login",
            "headers": [],
            "client": ("127.0.0.1", 43001),
        }
    )

    response = await unwrap(login)(
        LoginRequest(email=user.email, password=password),
        request,
        database,  # type: ignore[arg-type]
    )

    assert response.user.id == user.id
    assert database.commits == 1
    assert user.password_hash.startswith("$argon2id$")
    assert verify_password(password, user.password_hash) is True


@pytest.mark.asyncio
async def test_password_change_uses_the_shared_argon2id_hasher() -> None:
    from app.routers.auth import change_account_password

    user = User(
        id=uuid4(),
        email="candidate@example.com",
        password_hash=hash_password("CurrentPass123!"),
        role=UserRole.CANDIDATE,
        is_approved=True,
        is_2fa_enabled=False,
        full_name="Candidate User",
    )
    database = _LoginDatabase(user)

    result = await unwrap(change_account_password)(
        PasswordChangeRequest(
            current_password="CurrentPass123!",
            new_password="DifferentPass456!",
        ),
        Request(
            {
                "type": "http",
                "method": "POST",
                "path": "/auth/account/password",
                "headers": [],
                "client": ("127.0.0.1", 43002),
            }
        ),
        user,
        database,  # type: ignore[arg-type]
    )

    assert result == {"detail": "Password changed successfully."}
    assert database.commits == 1
    assert user.password_hash.startswith("$argon2id$")
    assert verify_password("DifferentPass456!", user.password_hash) is True


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path",
    ["/invites/company/accept", "/invites/employee/accept"],
)
async def test_invitation_acceptance_routes_enforce_the_typed_password_policy(path: str) -> None:
    from app.main import app

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            path,
            json={
                "token": "invalid-invitation-token",
                "password": "WeakPass1!",
                "full_name": "Invitation User",
            },
        )

    assert response.status_code == 422
    errors = response.json()["detail"]
    assert any(error["loc"][-1] == "password" for error in errors)
