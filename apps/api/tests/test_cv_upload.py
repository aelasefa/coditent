"""CV upload + extraction tests. Offline: no DB, no Gemini, no Supabase.

Run: python3 -m pytest tests/test_cv_upload.py -v
"""
import asyncio
import io
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

from app.services.cv_extraction import (  # noqa: E402
    AIExtractionError,
    extract_profile_from_text,
    normalize_extracted,
    parse_ai_response,
)
from app.services import cv_extraction as ce_mod  # noqa: E402
from app.services.cv_parser import (  # noqa: E402
    MAX_CV_BYTES,
    NoExtractableTextError,
    check_magic_bytes,
    extract_text,
    extract_text_from_docx,
    get_pdf_page_count,
    map_study_level,
    normalize_skills,
    normalize_url,
    clamp_years,
    validate_cv_file,
)
from app.services.cv_storage import assert_owns_path  # noqa: E402


def make_docx_bytes(lines: list[str]) -> bytes:
    import docx

    doc = docx.Document()
    for line in lines:
        doc.add_paragraph(line)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def make_blank_pdf_bytes() -> bytes:
    from pypdf import PdfWriter

    w = PdfWriter()
    w.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


# 1. Valid PDF validation
def test_valid_pdf_validation():
    assert validate_cv_file("cv.pdf", "application/pdf", 1000) == "pdf"
    check_magic_bytes(b"%PDF-1.4 fake", "pdf")


# 2. Valid DOCX generation + extraction
def test_valid_docx_extraction():
    data = make_docx_bytes(
        [
            "Yasmine El Fassi",
            "Casablanca, +212612345678",
            "Skills: Python, React, SQL",
            "Master Informatique, ENSA Casablanca",
            "https://www.linkedin.com/in/yasmine",
        ]
    )
    assert validate_cv_file("cv.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", len(data)) == "docx"
    check_magic_bytes(data, "docx")
    text = extract_text_from_docx(data)
    assert "Python" in text
    assert "Casablanca" in text


# 3. Invalid file type
def test_invalid_file_type():
    with pytest.raises(ValueError, match="Only PDF and DOCX"):
        validate_cv_file("cv.txt", "text/plain", 100)
    with pytest.raises(ValueError, match="Only PDF and DOCX"):
        validate_cv_file("cv.exe", "application/octet-stream", 100)
    with pytest.raises(ValueError, match="Only PDF and DOCX"):
        extract_text("cv.txt", b"hello")


# 4. Oversized file
def test_oversized_file():
    with pytest.raises(ValueError, match="5MB"):
        validate_cv_file("big.pdf", "application/pdf", MAX_CV_BYTES + 1)


# 5. Invalid magic bytes
def test_invalid_magic_bytes():
    with pytest.raises(ValueError, match="Invalid PDF"):
        check_magic_bytes(b"NOTPDFDATA", "pdf")
    with pytest.raises(ValueError, match="Invalid DOCX"):
        check_magic_bytes(b"%PDF-1.4 fake", "docx")


# 6. Scanned / empty PDF -> graceful
def test_scanned_pdf_no_text():
    blank = make_blank_pdf_bytes()
    assert blank.startswith(b"%PDF")
    with pytest.raises(NoExtractableTextError):
        extract_text("scan.pdf", blank)


# 7. Ownership
def test_ownership():
    assert_owns_path("user-1/abc.pdf", "user-1")
    with pytest.raises(RuntimeError, match="Forbidden"):
        assert_owns_path("user-1/abc.pdf", "user-2")
    with pytest.raises(RuntimeError, match="Forbidden"):
        assert_owns_path("other/abc.pdf", "user-1")


# 8. Duplicate skills normalized, never invented
def test_skill_dedup():
    out = normalize_skills(["Python, python, PYTHON", "React; react ", "SQL\nSQL"])
    assert out == ["Python", "React", "SQL"]
    assert normalize_skills([]) == []
    assert normalize_skills(None) == []
    many = [f"skill{i}" for i in range(30)]
    assert len(normalize_skills(many)) == 20


# 9. Study level mapping, uncertain -> None
def test_study_level_mapping():
    assert map_study_level("Bachelor Informatique") == "LICENCE"
    assert map_study_level("Licence Pro") == "LICENCE"
    assert map_study_level("Master Data") == "MASTER"
    assert map_study_level("Ingénieur d'Etat") == "MASTER"
    assert map_study_level("PhD Computer Science") == "DOCTORAT"
    assert map_study_level("BAC+2") == "BAC"
    assert map_study_level("Something random unknown") is None
    assert map_study_level(None) is None
    assert map_study_level("") is None


# 10. Extraction mapping incl. missing/uncertain
def test_extraction_mapping_full():
    data = normalize_extracted(
        {
            "skills": ["Python", "python", "React"],
            "years_of_experience": 3,
            "field_of_study": "Informatique",
            "university": "ENSA Casablanca",
            "study_level": "Master",
            "city": "Casablanca",
            "phone": "+212612345678",
            "linkedin_url": "https://www.linkedin.com/in/yasmine",
            "portfolio_url": "not-a-url",
        }
    )
    assert data.skills == ["Python", "React"]
    assert data.years_of_experience == 3
    assert data.study_level == "MASTER"
    assert data.linkedin_url == "https://www.linkedin.com/in/yasmine"
    assert data.portfolio_url is None


def test_extraction_missing_stays_empty():
    data = normalize_extracted({})
    assert data.skills == []
    assert data.years_of_experience is None
    assert data.study_level is None
    assert data.city is None
    # invalid years + uncertain level never guessed; non-list skills ignored
    data2 = normalize_extracted({"years_of_experience": 99, "study_level": "???", "skills": 12345})
    assert data2.years_of_experience is None
    assert data2.study_level is None
    assert data2.skills == []


def test_url_and_years_helpers():
    assert normalize_url("https://x.com") == "https://x.com"
    assert normalize_url("www.x.com") is None
    assert clamp_years(5) == 5
    assert clamp_years(-1) is None
    assert clamp_years(41) is None
    assert clamp_years(None) is None


# 11. Extraction failure without Gemini call, retry-safe (no mutation concept)
def test_extraction_failure_empty():
    with pytest.raises(AIExtractionError):
        asyncio.run(extract_profile_from_text(""))
    with pytest.raises(AIExtractionError):
        asyncio.run(extract_profile_from_text("   "))


# 12. Parse endpoint never overwrites profile (static guarantee)
def test_parse_never_mutates_profile():
    src = Path(__file__).resolve().parents[1] / "app" / "routers" / "candidates.py"
    text = src.read_text()
    parse_fn = text.split("async def parse_candidate_cv", 1)[1]
    # cut at next router decorator / def
    parse_fn = parse_fn.split("@router", 1)[0]
    assert "db.commit" not in parse_fn
    assert "db.add" not in parse_fn
    assert "setattr(profile" not in parse_fn


# 13. Recommendation engine reads same CandidateProfile columns
def test_recommendation_reads_updated_profile():
    base = Path(__file__).resolve().parents[1] / "app"
    jobs = (base / "services" / "recommendation_jobs.py").read_text()
    assert "select(CandidateProfile)" in jobs
    assert "profile.skills" in jobs
    assert "profile.city" in jobs
    ai = (base / "services" / "ai.py").read_text()
    for col in ("profile.skills", "profile.city", "profile.field_of_study", "profile.years_of_experience"):
        assert col in ai


# 14. Profile schema carries all extracted fields + cv_url (persistence)
def test_profile_schema_persistence():
    src = (Path(__file__).resolve().parents[1] / "app" / "schemas.py").read_text()
    assert "cv_url" in src
    for field in ("city", "phone", "field_of_study", "university", "study_level", "skills", "years_of_experience", "linkedin_url", "portfolio_url"):
        assert field in src


# --- Extraction hardening (regression for live invalid-response failure) ---

def test_parse_clean_json():
    d = parse_ai_response('{"skills": ["Python"], "city": "Rabat"}')
    assert d["skills"] == ["Python"]


def test_parse_markdown_fenced():
    d = parse_ai_response('```json\n{"skills": ["Python"], "city": null}\n```')
    assert d["skills"] == ["Python"]
    assert d["city"] is None


def test_parse_prose_wrapped():
    d = parse_ai_response('Here is the result:\n{"skills": ["SQL"]}\nDone.')
    assert d["skills"] == ["SQL"]


def test_parse_malformed_raises_coded():
    with pytest.raises(AIExtractionError) as ei:
        parse_ai_response('{"skills": ["Python", ] broken')
    assert ei.value.code == "CV_EXTRACTION_SCHEMA_ERROR"
    with pytest.raises(AIExtractionError) as ei2:
        parse_ai_response('no json at all')
    assert ei2.value.code == "CV_EXTRACTION_SCHEMA_ERROR"
    with pytest.raises(AIExtractionError):
        parse_ai_response('[1, 2, 3]')


def test_normalize_nested_and_aliases():
    data = normalize_extracted(
        {
            "key_skills": ["Python", "python"],
            "experience": {"years": 4},
            "education": {"field": "Physics", "school": "FS Rabat", "degree": "Master"},
            "contact": {"city": "Rabat", "linkedin": "https://www.linkedin.com/in/x", "portfolio": "oops"},
        }
    )
    assert data.skills == ["Python"]
    assert data.years_of_experience == 4
    assert data.field_of_study == "Physics"
    assert data.university == "FS Rabat"
    assert data.study_level == "MASTER"
    assert data.city == "Rabat"
    assert data.linkedin_url == "https://www.linkedin.com/in/x"
    assert data.portfolio_url is None


def test_normalize_loose_types():
    data = normalize_extracted({"skills": "Python; React", "years_of_experience": "5", "study_level": "phd"})
    assert data.skills == ["Python", "React"]
    assert data.years_of_experience == 5
    assert data.study_level == "DOCTORAT"
    data2 = normalize_extracted({"skills": None, "years_of_experience": True, "study_level": "??? "})
    assert data2.skills == []
    assert data2.years_of_experience is None
    assert data2.study_level is None


def test_empty_text_code():
    with pytest.raises(AIExtractionError) as ei:
        asyncio.run(extract_profile_from_text("short"))
    assert ei.value.code == "CV_NO_TEXT"


def test_ai_timeout_code(monkeypatch):
    import time

    class SlowModel:
        def generate_content(self, *a, **k):
            time.sleep(5)
            return None

    monkeypatch.setattr(ce_mod, "_get_model", lambda: SlowModel())
    with pytest.raises(AIExtractionError) as ei:
        asyncio.run(extract_profile_from_text("x" * 100, timeout_s=0.05))
    assert ei.value.code == "CV_AI_TIMEOUT"


def test_nonstop_finish_retries_then_coded(monkeypatch):
    from types import SimpleNamespace

    calls = {"n": 0}

    class CutModel:
        def generate_content(self, *a, **k):
            calls["n"] += 1
            return SimpleNamespace(
                text='{"skills": ["Python"]',
                candidates=[SimpleNamespace(finish_reason=SimpleNamespace(name="MAX_TOKENS"))],
            )

    monkeypatch.setattr(ce_mod, "_get_model", lambda: CutModel())
    with pytest.raises(AIExtractionError) as ei:
        asyncio.run(extract_profile_from_text("x" * 100, timeout_s=5))
    assert ei.value.code == "CV_AI_ERROR"
    assert calls["n"] == 2  # full + reduced retry


def test_extract_success_path(monkeypatch):
    from types import SimpleNamespace

    class GoodModel:
        def generate_content(self, *a, **k):
            return SimpleNamespace(
                text='{"skills": ["Python", "SQL"], "city": "Fes", "study_level": "LICENCE"}',
                candidates=[SimpleNamespace(finish_reason=SimpleNamespace(name="STOP"))],
            )

    monkeypatch.setattr(ce_mod, "_get_model", lambda: GoodModel())
    data, warnings, meta = asyncio.run(extract_profile_from_text("x" * 100))
    assert data.skills == ["Python", "SQL"]
    assert data.city == "Fes"
    assert data.study_level == "LICENCE"
    assert meta["ai_response_chars"] > 0


def test_pdf_page_count():
    assert get_pdf_page_count(make_blank_pdf_bytes()) == 1
    assert get_pdf_page_count(b"not a pdf") is None


def test_router_error_codes():
    base = Path(__file__).resolve().parents[1]
    router_src = (base / "app" / "routers" / "candidates.py").read_text()
    svc_src = (base / "app" / "services" / "cv_extraction.py").read_text()
    combined = router_src + svc_src
    for code in ("CV_FILE_READ_ERROR", "CV_NO_TEXT", "CV_AI_ERROR", "CV_AI_TIMEOUT", "CV_EXTRACTION_SCHEMA_ERROR"):
        assert code in combined, code
    assert "exc.code" in router_src  # router surfaces service codes, not bare strings
    parse_fn = router_src.split("async def parse_candidate_cv", 1)[1].split("@router", 1)[0]
    assert "db.commit" not in parse_fn  # review-before-save preserved


def test_frontend_review_and_retry():
    page = (Path(__file__).resolve().parents[2] / "web" / "src" / "app" / "dashboard" / "profile" / "page.tsx").read_text()
    assert "Retry extraction" in page
    assert "runParse" in page
    assert "Review extracted info" in page
    assert "getApiError" in page
