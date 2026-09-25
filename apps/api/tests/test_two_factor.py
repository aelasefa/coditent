"""Unit coverage for TOTP, recovery codes, and short-lived MFA JWTs."""
from datetime import timedelta

from app.services.two_factor import (
    generate_backup_codes,
    generate_totp_secret,
    hash_backup_code,
    verify_and_consume_backup_code,
    verify_totp_code,
)
from app.utils.jwt import create_access_token, verify_token


def test_mfa_token_supports_custom_expiry_and_type():
    token = create_access_token(
        {"sub": "00000000-0000-0000-0000-000000000001", "type": "mfa_pending"},
        expires_delta=timedelta(minutes=5),
    )
    payload = verify_token(token)
    assert payload["type"] == "mfa_pending"


def test_trusted_device_token_is_tied_to_a_user():
    token = create_access_token(
        {
            "sub": "00000000-0000-0000-0000-000000000002",
            "type": "trusted_device",
            "factor": "factor-version",
        },
        expires_delta=timedelta(days=30),
    )
    payload = verify_token(token)
    assert payload["sub"] == "00000000-0000-0000-0000-000000000002"
    assert payload["type"] == "trusted_device"
    assert payload["factor"] == "factor-version"


def test_totp_accepts_current_code_and_rejects_bad_code():
    import pyotp

    secret = generate_totp_secret()
    assert verify_totp_code(secret, pyotp.TOTP(secret).now()) is True
    assert verify_totp_code(secret, "000000") is False


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
