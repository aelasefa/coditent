"""Company logo tests. Offline: no DB, no Supabase, no network.

Covers: validation (type/size/magic bytes), unique paths, RBAC matrix
(edit_company OWNER/ADMIN only), same-company isolation in the logo
endpoints, nullable logo_url (existing companies keep working), no raw
bytes in the Company table, storage-path-only responses, and frontend
initials fallback.

Run: python3 -m pytest tests/test_company_logo.py -v
"""
import sys
import types
from pathlib import Path

import pytest

# --- Stub heavy modules before importing app code ---
_g = types.ModuleType("google")
_ga = types.ModuleType("google.generativeai")
_ga.configure = lambda **kwargs: None
_ga.GenerativeModel = lambda *a, **k: None
_g.generativeai = _ga
sys.modules.setdefault("google", _g)
sys.modules.setdefault("google.generativeai", _ga)

_obs = types.ModuleType("app.observability")


class _Log:
    def info(self, *a, **k): ...
    def error(self, *a, **k): ...
    def warning(self, *a, **k): ...
    def exception(self, *a, **k): ...


_obs.get_logger = lambda name="t": _Log()
sys.modules["app.observability"] = _obs

_cfg = types.ModuleType("app.config")
_cfg.settings = types.SimpleNamespace(gemini_api_key="test", database_url="sqlite://")
sys.modules["app.config"] = _cfg

_db = types.ModuleType("app.db")
_db.get_supabase_client = lambda: (_ for _ in ()).throw(RuntimeError("no storage in tests"))
sys.modules["app.db"] = _db

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.permissions import can  # noqa: E402
from app.services.company_logo import (  # noqa: E402
    ALLOWED_EXTENSIONS,
    MAX_LOGO_BYTES,
    LogoStorageError,
    assert_company_logo_path,
    build_logo_path,
    check_logo_magic_bytes,
    validate_logo_file,
)

BASE = Path(__file__).resolve().parents[1]
WEB_SRC = BASE.parents[0] / "web" / "src"

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 100
WEBP = b"RIFF" + b"\x00" * 4 + b"WEBP" + b"\x00" * 100


# 1. Authorized flow building blocks: valid image passes validation.
def test_valid_png_jpg_webp():
    assert validate_logo_file("logo.png", "image/png", len(PNG)) == "png"
    assert validate_logo_file("logo.JPG", "image/jpeg", len(JPG)) == "jpg"
    assert validate_logo_file("logo.jpeg", "image/jpeg", len(JPG)) == "jpeg"
    assert validate_logo_file("logo.webp", "image/webp", len(WEBP)) == "webp"
    check_logo_magic_bytes(PNG, "png")
    check_logo_magic_bytes(JPG, "jpg")
    check_logo_magic_bytes(JPG, "jpeg")
    check_logo_magic_bytes(WEBP, "webp")


def test_supported_formats():
    assert ALLOWED_EXTENSIONS == {"png", "jpg", "jpeg", "webp"}


# 2. Logo URL saved correctly: router persists the storage path on the Company row.
def test_upload_persists_path_on_company():
    src = (BASE / "app" / "routers" / "companies.py").read_text()
    upload_fn = src.split("async def upload_company_logo", 1)[1].split("@router", 1)[0]
    assert "company.logo_url = path" in upload_fn
    assert "await db.commit()" in upload_fn


# 3. Logo can be replaced: upload deletes the previous file first.
def test_replace_deletes_old_logo():
    src = (BASE / "app" / "routers" / "companies.py").read_text()
    upload_fn = src.split("async def upload_company_logo", 1)[1].split("@router", 1)[0]
    assert "old_path = company.logo_url" in upload_fn
    assert "delete_logo(old_path)" in upload_fn


# 4. Logo can be removed: delete clears storage and nulls the column.
def test_remove_clears_logo():
    src = (BASE / "app" / "routers" / "companies.py").read_text()
    delete_fn = src.split("async def delete_company_logo", 1)[1].split("@router", 1)[0]
    assert "delete_logo(company.logo_url)" in delete_fn
    assert "company.logo_url = None" in delete_fn
    assert "404" in delete_fn  # missing logo -> 404, not 500


# 5. Invalid file type is rejected (frontend + backend).
def test_invalid_file_type_rejected():
    with pytest.raises(ValueError, match="Only PNG, JPG, and WebP"):
        validate_logo_file("logo.txt", "text/plain", 100)
    with pytest.raises(ValueError, match="Only PNG, JPG, and WebP"):
        validate_logo_file("logo.exe", "application/octet-stream", 100)
    with pytest.raises(ValueError, match="Only PNG, JPG, and WebP"):
        validate_logo_file("logo.pdf", "application/pdf", 100)
    with pytest.raises(ValueError, match="PNG, JPG, (or|and) WebP"):
        validate_logo_file("logo", "image/png", 100)
    with pytest.raises(ValueError, match="Only PNG, JPG, and WebP"):
        validate_logo_file("logo.svg", "image/svg+xml", 100)
    with pytest.raises(ValueError, match="Invalid PNG"):
        check_logo_magic_bytes(b"NOT AN IMAGE", "png")
    with pytest.raises(ValueError, match="Invalid JPEG"):
        check_logo_magic_bytes(PNG, "jpg")
    with pytest.raises(ValueError, match="Invalid WebP"):
        check_logo_magic_bytes(JPG, "webp")
    # Router maps validation failures to 400.
    src = (BASE / "app" / "routers" / "companies.py").read_text()
    upload_fn = src.split("async def upload_company_logo", 1)[1].split("@router", 1)[0]
    assert "HTTP_400_BAD_REQUEST" in upload_fn
    # Frontend validates before upload too.
    web_src = (WEB_SRC / "lib" / "api.ts").read_text()
    assert "validateCompanyLogoFile" in web_src
    assert "accept=\"image/png,image/jpeg,image/webp\"" in (
        WEB_SRC / "components" / "company" / "CompanyLogoSection.tsx"
    ).read_text()


# 6. Oversized image is rejected (2MB cap, 413).
def test_oversized_rejected():
    with pytest.raises(ValueError, match="2MB"):
        validate_logo_file("big.png", "image/png", MAX_LOGO_BYTES + 1)
    assert MAX_LOGO_BYTES == 2 * 1024 * 1024
    src = (BASE / "app" / "routers" / "companies.py").read_text()
    upload_fn = src.split("async def upload_company_logo", 1)[1].split("@router", 1)[0]
    assert "HTTP_413_REQUEST_ENTITY_TOO_LARGE" in upload_fn
    web_src = (WEB_SRC / "lib" / "api.ts").read_text()
    assert "COMPANY_LOGO_MAX_BYTES = 2 * 1024 * 1024" in web_src


# 7. Unauthorized company role cannot modify logo (RBAC: edit_company = OWNER/ADMIN).
def test_unauthorized_role_cannot_modify_logo():
    assert can("OWNER", "edit_company") is True
    assert can("ADMIN", "edit_company") is True
    assert can("HR", "edit_company") is False
    assert can("RECRUITER", "edit_company") is False
    assert can("HIRING_MANAGER", "edit_company") is False
    src = (BASE / "app" / "routers" / "companies.py").read_text()
    for fn_name in ("upload_company_logo", "delete_company_logo"):
        fn = src.split(f"async def {fn_name}", 1)[1].split("@router", 1)[0]
        assert 'can(current_user.company_role, "edit_company")' in fn
        assert "HTTP_403_FORBIDDEN" in fn


# 8. User from Company A cannot modify Company B's logo (404 isolation).
def test_cross_company_isolation():
    src = (BASE / "app" / "routers" / "companies.py").read_text()
    for fn_name in ("upload_company_logo", "delete_company_logo"):
        fn = src.split(f"async def {fn_name}", 1)[1].split("@router", 1)[0]
        assert "str(current_user.company_id) != str(company_id)" in fn
        assert "HTTP_404_NOT_FOUND" in fn
    # Stored paths are scoped to the owning company and re-checked on serve/delete.
    assert_company_logo_path("company-a/abc.png", "company-a")
    with pytest.raises(LogoStorageError, match="Forbidden"):
        assert_company_logo_path("company-a/abc.png", "company-b")


# 9. Existing company without logo still works (nullable, initials fallback).
def test_company_without_logo_still_works():
    models_src = (BASE / "app" / "models.py").read_text()
    assert "logo_url: Mapped[str | None] = mapped_column(String, nullable=True)" in models_src
    schemas_src = (BASE / "app" / "schemas.py").read_text()
    assert "logo_url: str | None = None" in schemas_src
    # Public logo endpoint 404s cleanly instead of breaking.
    src = (BASE / "app" / "routers" / "companies.py").read_text()
    get_fn = src.split("async def get_company_logo", 1)[1].split("@router", 1)[0]
    assert "if not company or not company.logo_url" in get_fn
    # get_company itself never requires a logo.
    assert "logo_url=company.logo_url" in src


# 10. UI falls back to company initials (never a broken image).
def test_ui_falls_back_to_initials():
    avatar = (WEB_SRC / "components" / "ui" / "avatar.tsx").read_text()
    assert "{src ? (" in avatar  # image only when a URL exists
    assert "initials(name)" in avatar
    for page in (
        "components/candidate/job-card.tsx",
        "components/candidate/job-details.tsx",
        "components/candidate/application-card.tsx",
        "components/company/AppShell.tsx",
    ):
        src = (WEB_SRC / page).read_text()
        assert "<Avatar" in src
        assert "name=" in src  # initials always available as fallback
    section = (WEB_SRC / "components" / "company" / "CompanyLogoSection.tsx").read_text()
    assert "showing company initials" in section


# 11. Security: randomized unique filenames, no raw bytes in DB, path-only responses.
def test_storage_security_properties():
    p1 = build_logo_path("company-a", "png")
    p2 = build_logo_path("company-a", "png")
    assert p1 != p2  # unique per upload
    assert p1.startswith("company-a/") and p1.endswith(".png")
    models_src = (BASE / "app" / "models.py").read_text()
    company_block = models_src.split("class Company", 1)[1].split("class ", 1)[0]
    assert "LargeBinary" not in company_block  # never raw bytes in the table
    src = (BASE / "app" / "routers" / "companies.py").read_text()
    upload_fn = src.split("async def upload_company_logo", 1)[1].split("@router", 1)[0]
    assert "logo_url=path" in upload_fn  # only the path is stored
    assert "CONTENT_TYPE_BY_EXT[ext]" in src  # correct MIME persisted at upload
    get_fn = src.split("async def get_company_logo", 1)[1].split("@router", 1)[0]
    assert "StreamingResponse" in get_fn  # served via scoped stream, not a raw bucket URL


# 12. Logo surfaces where company identity is shown.
def test_logo_exposed_where_needed():
    schemas_src = (BASE / "app" / "schemas.py").read_text()
    assert "company_logo_url: str | None = None" in schemas_src  # OfferOut + chat context
    assert "CompanyLogoMetaOut" in schemas_src
    offers_src = (BASE / "app" / "routers" / "offers.py").read_text()
    assert "company_logo_url" in offers_src
    apps_src = (BASE / "app" / "routers" / "applications.py").read_text()
    assert "company_logo_url" in apps_src
    rec_src = (BASE / "app" / "routers" / "recommendations.py").read_text()
    assert "_attach_offer_logos" in rec_src
    chat_src = (BASE / "app" / "routers" / "chat.py").read_text()
    assert "company_logo_url" in chat_src
