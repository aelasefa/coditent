import base64
import hashlib
import io
import json
import secrets
from typing import List, Tuple, Optional

import pyotp
import qrcode


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


def verify_totp_code(secret: str, code: str) -> bool:
    """Verify a 6-digit TOTP code against the secret key (valid_window=1 allows +-30s clock drift)."""
    if not secret or not code:
        return False
    totp = pyotp.TOTP(secret)
    return totp.verify(code.strip(), valid_window=1)


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
