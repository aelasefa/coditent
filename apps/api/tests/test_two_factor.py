"""Unit coverage for TOTP, recovery codes, and short-lived MFA JWTs."""
import asyncio
import uuid
from datetime import timedelta

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwt

from app.config import settings
from app.dependencies import get_current_access_payload
from app.models import User, UserRole
from app.services import authentication
from app.services.authentication import (
    AuthenticationRejected,
    complete_authentication,
    consume_mfa_challenge,
    ensure_access_session_active,
    ensure_mfa_challenge_active,
    factor_fingerprint,
    ensure_credential_matches_account,
)
from app.services.two_factor import (
    consume_second_factor,
    decrypt_totp_secret,
    encrypt_totp_secret,
    generate_backup_codes,
    generate_totp_secret,
    hash_backup_code,
    verify_and_consume_backup_code,
    verify_totp_code,
)
from app.utils.jwt import (
    create_access_token,
    create_trusted_device_token,
    verify_access_token,
    verify_mfa_token,
    verify_token,
    verify_trusted_device_token,
)


class FakeRedis:
    def __init__(self):
        self.values: dict[str, str] = {}

    async def set(self, key, value, ex=None, nx=False):
        if nx and key in self.values:
            return False
        self.values[key] = value
        return True

    async def get(self, key):
        return self.values.get(key)

    async def getdel(self, key):
        return self.values.pop(key, None)


def test_mfa_token_supports_custom_expiry_and_type():
    from app.utils.jwt import create_mfa_token

    token = create_mfa_token("00000000-0000-0000-0000-000000000001")
    payload = verify_mfa_token(token)
    assert payload["purpose"] == "mfa_pending"
    with pytest.raises(ValueError, match="purpose"):
        verify_access_token(token)


def test_trusted_device_token_is_tied_to_a_user():
    token = create_trusted_device_token(
        "00000000-0000-0000-0000-000000000002",
        factor="factor-version",
        expires_delta=timedelta(days=30),
    )
    payload = verify_trusted_device_token(token)
    assert payload["sub"] == "00000000-0000-0000-0000-000000000002"
    assert payload["purpose"] == "trusted_device"
    assert payload["factor"] == "factor-version"
    with pytest.raises(ValueError, match="purpose"):
        verify_access_token(token)


def test_access_token_requires_explicit_purpose_subject_and_session():
    subject = "00000000-0000-0000-0000-000000000003"
    access = create_access_token({"sub": subject})
    payload = verify_access_token(access)
    assert payload["purpose"] == "access"
    uuid.UUID(payload["jti"])
    uuid.UUID(payload["sid"])

    legacy = jwt.encode(
        {"sub": subject, "exp": 4_102_444_800},
        settings.secret_key,
        algorithm=settings.algorithm,
    )
    with pytest.raises(ValueError, match="purpose"):
        verify_token(legacy)

    expired = jwt.encode(
        {
            "sub": subject,
            "purpose": "access",
            "jti": str(uuid.uuid4()),
            "sid": str(uuid.uuid4()),
            "iat": 1,
            "nbf": 1,
            "exp": 2,
        },
        settings.secret_key,
        algorithm=settings.algorithm,
    )
    with pytest.raises(ValueError, match="expired"):
        verify_access_token(expired)


def test_http_access_dependency_rejects_mfa_and_trusted_credentials():
    from app.utils.jwt import create_mfa_token

    subject = "00000000-0000-0000-0000-000000000004"
    credentials = [
        create_mfa_token(subject),
        create_trusted_device_token(
            subject,
            factor="factor-version",
            expires_delta=timedelta(days=1),
        ),
    ]
    for token in credentials:
        with pytest.raises(HTTPException) as exc:
            asyncio.run(
                get_current_access_payload(
                    HTTPAuthorizationCredentials(scheme="Bearer", credentials=token),
                    None,
                )
            )
        assert exc.value.status_code == 401


def _user(*, two_factor: bool = True, approved: bool = True) -> User:
    return User(
        id=uuid.uuid4(),
        email="mfa@example.com",
        password_hash="unused",
        full_name="MFA User",
        role=UserRole.CANDIDATE,
        is_approved=approved,
        is_2fa_enabled=two_factor,
        totp_secret_encrypted=(
            encrypt_totp_secret("JBSWY3DPEHPK3PXP") if two_factor else None
        ),
        auth_version=0,
    )


def test_password_and_oauth_completion_share_mfa_gate_and_challenge_is_single_use(monkeypatch):
    redis = FakeRedis()
    monkeypatch.setattr(authentication, "get_async_redis", lambda: redis)
    user = _user(two_factor=True)

    completion = asyncio.run(complete_authentication(user))
    assert completion.requires_2fa is True
    payload = verify_mfa_token(completion.token)
    asyncio.run(ensure_mfa_challenge_active(payload))
    asyncio.run(consume_mfa_challenge(payload))
    with pytest.raises(AuthenticationRejected, match="no longer active"):
        asyncio.run(consume_mfa_challenge(payload))


def test_only_matching_trusted_device_purpose_can_finish_mfa_login(monkeypatch):
    redis = FakeRedis()
    monkeypatch.setattr(authentication, "get_async_redis", lambda: redis)
    user = _user(two_factor=True)
    trusted = create_trusted_device_token(
        str(user.id),
        factor=factor_fingerprint(user),
        expires_delta=timedelta(days=1),
    )
    completed = asyncio.run(
        complete_authentication(user, trusted_device_token=trusted)
    )
    assert completed.requires_2fa is False
    assert verify_access_token(completed.token)["sub"] == str(user.id)

    # A valid access token cannot be substituted for a trusted-device token.
    challenged = asyncio.run(
        complete_authentication(user, trusted_device_token=completed.token)
    )
    assert challenged.requires_2fa is True
    assert verify_mfa_token(challenged.token)["sub"] == str(user.id)


def test_revoked_access_session_is_rejected(monkeypatch):
    redis = FakeRedis()
    monkeypatch.setattr(authentication, "get_async_redis", lambda: redis)
    payload = verify_access_token(
        create_access_token({"sub": "00000000-0000-0000-0000-000000000005"})
    )
    asyncio.run(ensure_access_session_active(payload))
    redis.values[f"auth:revoked-session:{payload['sid']}"] = "1"
    with pytest.raises(AuthenticationRejected, match="revoked"):
        asyncio.run(ensure_access_session_active(payload))


def test_auth_version_invalidates_preexisting_credentials():
    user = _user(two_factor=False)
    token = create_access_token({"sub": str(user.id), "auth_version": 0})
    payload = verify_access_token(token)
    ensure_credential_matches_account(payload, user)

    user.auth_version = 1
    with pytest.raises(AuthenticationRejected, match="invalidated"):
        ensure_credential_matches_account(payload, user)


def test_inactive_account_cannot_complete_authentication(monkeypatch):
    monkeypatch.setattr(authentication, "get_async_redis", lambda: FakeRedis())
    with pytest.raises(AuthenticationRejected, match="not active"):
        asyncio.run(complete_authentication(_user(approved=False)))


def test_totp_accepts_current_code_and_rejects_bad_code():
    import pyotp

    secret = generate_totp_secret()
    assert verify_totp_code(secret, pyotp.TOTP(secret).now()) is True
    assert verify_totp_code(secret, "000000") is False


def test_totp_secret_is_encrypted_and_same_timestep_cannot_be_replayed():
    import pyotp

    secret = generate_totp_secret()
    encrypted = encrypt_totp_secret(secret)
    assert secret not in encrypted
    assert decrypt_totp_secret(encrypted) == secret

    user = _user(two_factor=True)
    user.totp_secret_encrypted = encrypted
    code = pyotp.TOTP(secret).now()
    assert consume_second_factor(user, code) == "totp"
    assert consume_second_factor(user, code) is None


def test_backup_code_is_single_use():
    plaintext, stored = generate_backup_codes(2)
    assert plaintext[0] != plaintext[1]
    assert hash_backup_code(plaintext[0]) not in plaintext

    valid, remaining = verify_and_consume_backup_code(stored, plaintext[0].lower())
    assert valid is True
    valid_again, _ = verify_and_consume_backup_code(remaining, plaintext[0])
    assert valid_again is False
    second_valid, final = verify_and_consume_backup_code(remaining, plaintext[1].replace("-", ""))
    assert second_valid is True
    assert final == "[]"
