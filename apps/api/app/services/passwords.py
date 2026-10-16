"""Central password policy and password-hashing helpers.

New credentials use Argon2id. Existing bcrypt hashes remain verifiable long
enough to migrate them after a successful password check. Bcrypt only consumes
the first 72 bytes of a password, so a longer candidate is deliberately not
accepted against a legacy bcrypt hash: accepting it could authenticate a
different password with the same 72-byte prefix.
"""

from __future__ import annotations

import re
from typing import Annotated

from passlib.context import CryptContext
from passlib.exc import UnknownHashError
from pydantic import AfterValidator, Field


PASSWORD_MIN_LENGTH = 12
PASSWORD_MAX_LENGTH = 128
BCRYPT_MAX_PASSWORD_BYTES = 72

_LOWERCASE_RE = re.compile(r"[a-z]")
_UPPERCASE_RE = re.compile(r"[A-Z]")
_NUMBER_RE = re.compile(r"[0-9]")
_SYMBOL_RE = re.compile(r"[^A-Za-z0-9\s]")

_password_context = CryptContext(
    schemes=["argon2", "bcrypt"],
    deprecated=["bcrypt"],
    argon2__type="ID",
    argon2__memory_cost=19_456,
    argon2__time_cost=2,
    argon2__parallelism=1,
)


def password_policy_failures(password: str) -> list[str]:
    """Return every unmet new-password requirement in display order."""
    failures: list[str] = []
    if len(password) < PASSWORD_MIN_LENGTH:
        failures.append(f"at least {PASSWORD_MIN_LENGTH} characters")
    if len(password) > PASSWORD_MAX_LENGTH:
        failures.append(f"no more than {PASSWORD_MAX_LENGTH} characters")
    if _LOWERCASE_RE.search(password) is None:
        failures.append("one lowercase letter")
    if _UPPERCASE_RE.search(password) is None:
        failures.append("one uppercase letter")
    if _NUMBER_RE.search(password) is None:
        failures.append("one number")
    if _SYMBOL_RE.search(password) is None:
        failures.append("one symbol")
    return failures


def validate_new_password(password: str) -> str:
    """Validate and return a password suitable for a new credential."""
    failures = password_policy_failures(password)
    if failures:
        raise ValueError(f"Password must include {', '.join(failures)}")
    return password


NewPassword = Annotated[
    str,
    Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH),
    AfterValidator(validate_new_password),
]


def hash_password(password: str) -> str:
    """Hash a password with the current Argon2id parameters."""
    return _password_context.hash(password)


def _is_legacy_bcrypt_hash(password_hash: str) -> bool:
    return password_hash.startswith(("$2a$", "$2b$", "$2x$", "$2y$"))


def verify_password_and_rehash(password: str, password_hash: str) -> tuple[bool, str | None]:
    """Verify a password and return an upgraded hash when migration is due.

    The second tuple item is an Argon2id replacement for an accepted legacy
    bcrypt hash, otherwise ``None``.
    """
    if _is_legacy_bcrypt_hash(password_hash) and len(password.encode("utf-8")) > BCRYPT_MAX_PASSWORD_BYTES:
        return False, None

    try:
        return _password_context.verify_and_update(password, password_hash)
    except (TypeError, ValueError, UnknownHashError):
        return False, None


def verify_password(password: str, password_hash: str) -> bool:
    """Verify without returning a migration hash."""
    verified, _ = verify_password_and_rehash(password, password_hash)
    return verified
