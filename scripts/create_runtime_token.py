#!/usr/bin/env python3
"""Create a per-teammate token for the Supabase runtime-secrets function.

The raw token is printed once for secure delivery to that teammate. Add the
printed SHA-256 hash to the Supabase function secret
CODITENT_RUNTIME_TOKEN_HASHES (JSON array) to authorize it.
"""

from __future__ import annotations

import hashlib
import secrets


token = secrets.token_urlsafe(32)
token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
print(f"SUPABASE_RUNTIME_TOKEN={token}")
print(f"CODITENT_RUNTIME_TOKEN_SHA256={token_hash}")
