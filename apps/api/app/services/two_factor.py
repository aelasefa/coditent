import base64
import hashlib
import io
import json
import secrets
import time
from typing import List, Tuple, Optional

import pyotp
import qrcode
from cryptography.fernet import Fernet, InvalidToken

from app.config import settings
from app.models import User


class TotpSecretUnavailable(RuntimeError):
    """Raised when encrypted factor material cannot be safely accessed."""


def _totp_cipher() -> Fernet:
    configured_key = (settings.totp_encryption_key or "").strip()
    if not configured_key:
        raise TotpSecretUnavailable("TOTP encryption key is not configured")
    try:
        return Fernet(configured_key.encode("ascii"))
    except (ValueError, UnicodeEncodeError) as exc:
        raise TotpSecretUnavailable("TOTP encryption key is invalid") from exc


def encrypt_totp_secret(secret: str) -> str:
    if not secret:
        raise ValueError("TOTP secret is required")
    return "v1:" + _totp_cipher().encrypt(secret.encode("utf-8")).decode("ascii")


def decrypt_totp_secret(encrypted_secret: str | None) -> str | None:
    if not encrypted_secret:
        return None
    if not encrypted_secret.startswith("v1:"):
        raise TotpSecretUnavailable("Unsupported encrypted TOTP secret version")
    try:
        return _totp_cipher().decrypt(encrypted_secret[3:].encode("ascii")).decode("utf-8")
    except (InvalidToken, UnicodeError) as exc:
        raise TotpSecretUnavailable("Unable to decrypt TOTP secret") from exc


def generate_totp_secret() -> str:
    """Generate a cryptographically secure base32 TOTP secret key."""
    return pyotp.random_base32()


def get_totp_uri(secret: str, email: str) -> str:
    """Generate RFC 6238 provisioning URI for authenticator apps."""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=email, issuer_name="Coditent")


def generate_qr_code_base64(uri: str) -> str:
    """Generate a base64 encoded PNG Data URL for a QR code."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=6,
        border=2,
    )
    qr.add_data(uri)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    b64_str = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64_str}"


def matching_totp_step(secret: str, code: str, *, at_time: int | None = None) -> int | None:
    """Return the accepted RFC 6238 timestep, including the +/- one-step drift window."""
    if not secret or not code:
        return None
    normalized_code = code.strip()
    if len(normalized_code) != 6 or not normalized_code.isdigit():
        return None
    totp = pyotp.TOTP(secret)
    current_step = int(at_time if at_time is not None else time.time()) // totp.interval
    for step in (current_step - 1, current_step, current_step + 1):
        if secrets.compare_digest(totp.at(step * totp.interval), normalized_code):
            return step
    return None


def verify_totp_code(secret: str, code: str) -> bool:
    """Compatibility predicate; state-changing routes use consume_second_factor."""
    return matching_totp_step(secret, code) is not None


def consume_second_factor(user: User, candidate_code: str) -> str | None:
    """Consume a TOTP timestep or recovery code on an already row-locked user.

    The caller must commit in the same transaction before releasing the row
    lock. This makes both TOTP replay tracking and recovery-code consumption
    deterministic under concurrent requests.
    """
    secret = decrypt_totp_secret(user.totp_secret_encrypted)
    if secret:
        step = matching_totp_step(secret, candidate_code)
        if step is not None:
            last_step = user.totp_last_used_step
            if last_step is not None and step <= last_step:
                return None
            user.totp_last_used_step = step
            return "totp"

    backup_valid, remaining = verify_and_consume_backup_code(
        user.backup_codes, candidate_code
    )
    if backup_valid:
        user.backup_codes = remaining
        return "recovery"
    return None


def hash_backup_code(code: str) -> str:
    """Hash a backup code with SHA256 for secure storage."""
    clean_code = code.strip().replace("-", "").upper()
    return hashlib.sha256(clean_code.encode("utf-8")).hexdigest()


def generate_backup_codes(count: int = 8) -> Tuple[List[str], str]:
    """
    Generate backup emergency recovery codes.
    Returns (plaintext_codes_for_user, json_hashed_codes_for_db).
    """
    plaintext_codes = []
    hashed_codes = []

    for _ in range(count):
        part1 = secrets.token_hex(2).upper()
        part2 = secrets.token_hex(2).upper()
        code = f"{part1}-{part2}"
        plaintext_codes.append(code)
        hashed_codes.append(hash_backup_code(code))

    return plaintext_codes, json.dumps(hashed_codes)


def verify_and_consume_backup_code(
    stored_json: Optional[str], candidate_code: str
) -> Tuple[bool, Optional[str]]:
    """
    Verify if a candidate backup code matches an unconsumed code.
    If valid, removes the consumed code and returns (True, updated_json_str).
    """
    if not stored_json or not candidate_code:
        return False, stored_json

    try:
        hashed_list: List[str] = json.loads(stored_json)
    except Exception:
        return False, stored_json

    target_hash = hash_backup_code(candidate_code)
    if target_hash in hashed_list:
        hashed_list.remove(target_hash)
        return True, json.dumps(hashed_list)

    return False, stored_json
