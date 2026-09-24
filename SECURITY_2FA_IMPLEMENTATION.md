# Two-Factor Authentication (2FA) Implementation Report — Coditent (`ft_transcendence`)

**Date:** September 24, 2026  
**Module:** User Management — Minor Module (1 Point)  
**Status:** Completed & Verified  

---

## Executive Overview
Two-Factor Authentication (2FA) adds a critical layer of identity assurance to **Coditent**. Users can protect their accounts using Time-based One-Time Passwords (TOTP, RFC 6238) compatible with standard authenticator applications (Google Authenticator, Authy, 1Password), complete with emergency backup recovery codes.

---

## 1. System Architecture & Workflows

### 1.1 2FA Setup & Activation (`/auth/2fa/setup` & `/auth/2fa/enable`)
1. User requests 2FA setup (`POST /auth/2fa/setup`).
2. Server generates a cryptographically secure 32-character base32 TOTP secret key using `pyotp`.
3. Server returns the secret key, provisioning URI (`otpauth://totp/Coditent:user@email?secret=...`), and a base64 PNG Data URL for a scannable QR Code.
4. User scans QR code in Google Authenticator / Authy and submits the current 6-digit TOTP code (`POST /auth/2fa/enable`).
5. Server validates code using `pyotp.TOTP(secret).verify(code, valid_window=1)`.
6. Upon validation, server generates 8 random single-use emergency backup codes (e.g. `A1B2-C3D4`), stores SHA-256 hashes of the codes in `users.backup_codes`, sets `users.is_2fa_enabled = True`, and returns plaintext backup codes to the user.

### 1.2 Login Challenge Workflow (`/auth/login` & `/auth/2fa/verify`)
1. User logs in with email + password (`POST /auth/login`).
2. Server validates password. If `users.is_2fa_enabled` is `True`:
   - Server returns `{"require_2fa": true, "mfa_token": "<short_lived_5m_token>"}` without issuing access token.
3. User submits TOTP code or emergency backup code (`POST /auth/2fa/verify`).
4. Server validates `mfa_token` and code. If an emergency backup code is used, it is consumed and removed from the active backup code list.
5. Server returns final JWT token & sets HTTP-only session cookie.

### 1.3 2FA Disabling (`/auth/2fa/disable`)
- Requires user password + current TOTP/backup code. Disables 2FA and clears stored secrets.

---

## 2. API Endpoints Reference

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/auth/2fa/status` | Authenticated | Returns `{"is_2fa_enabled": bool}` |
| `POST` | `/auth/2fa/setup` | Authenticated | Generates TOTP secret key & QR Code PNG Data URL |
| `POST` | `/auth/2fa/enable` | Authenticated | Verifies 6-digit code, activates 2FA, issues 8 recovery codes |
| `POST` | `/auth/2fa/disable` | Authenticated | Disables 2FA after password + code verification |
| `POST` | `/auth/2fa/verify` | Public | Completes 2FA login challenge using TOTP or backup code |

---

## 📂 Created & Modified Files

| Action | File Path | Purpose |
| :--- | :--- | :--- |
| **[NEW]** | [apps/api/app/services/two_factor.py](file:///home/ahabibi-/coditent/apps/api/app/services/two_factor.py) | TOTP secret generation, QR code renderer, backup code hasher & verification |
| **[NEW]** | [apps/api/app/routers/two_factor.py](file:///home/ahabibi-/coditent/apps/api/app/routers/two_factor.py) | 2FA API endpoints (`setup`, `enable`, `disable`, `verify`, `status`) |
| **[NEW]** | [apps/api/alembic/versions/g1a2b3c4d5e6_add_2fa_fields_to_users.py](file:///home/ahabibi-/coditent/apps/api/alembic/versions/g1a2b3c4d5e6_add_2fa_fields_to_users.py) | Database migration for `is_2fa_enabled`, `totp_secret`, `backup_codes` |
| **[MODIFY]** | [apps/api/app/models.py](file:///home/ahabibi-/coditent/apps/api/app/models.py) | Updated `User` model with 2FA columns |
| **[MODIFY]** | [apps/api/app/schemas.py](file:///home/ahabibi-/coditent/apps/api/app/schemas.py) | Added 2FA setup, enable, disable, and challenge Pydantic schemas |
| **[MODIFY]** | [apps/api/app/routers/auth.py](file:///home/ahabibi-/coditent/apps/api/app/routers/auth.py) | Updated `/auth/login` to return MFA challenge token when 2FA is active |
| **[MODIFY]** | [apps/api/app/main.py](file:///home/ahabibi-/coditent/apps/api/app/main.py) | Registered `/auth/2fa` router in FastAPI application |
| **[MODIFY]** | [apps/api/requirements.txt](file:///home/ahabibi-/coditent/apps/api/requirements.txt) | Added `pyotp` and `qrcode[pil]` dependencies |
| **[NEW]** | [SECURITY_2FA_IMPLEMENTATION.md](file:///home/ahabibi-/coditent/SECURITY_2FA_IMPLEMENTATION.md) | 2FA system architecture & endpoint documentation |
