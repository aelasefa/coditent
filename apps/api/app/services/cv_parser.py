"""CV text extraction + normalization helpers (pure functions, no I/O)."""
from __future__ import annotations

import io
import re

MAX_CV_BYTES = 5 * 1024 * 1024
ALLOWED_EXTENSIONS = {"pdf", "docx"}
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


class NoExtractableTextError(ValueError):
    pass


def validate_cv_file(filename: str | None, content_type: str | None, size: int) -> str:
    """Validate upload. Return normalized extension or raise ValueError."""
    if not filename or "." not in filename:
        raise ValueError("CV must be a PDF or DOCX file")
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError("Invalid file type. Only PDF and DOCX are supported")
    if content_type and content_type not in ALLOWED_CONTENT_TYPES and content_type != "application/octet-stream":
        raise ValueError("Invalid file type. Only PDF and DOCX are supported")
    if size <= 0:
        raise ValueError("Empty file")
    if size > MAX_CV_BYTES:
        raise ValueError("File too large. Maximum size is 5MB")
    return ext


def check_magic_bytes(data: bytes, ext: str) -> None:
    if ext == "pdf" and not data.startswith(b"%PDF"):
        raise ValueError("Invalid PDF file")
    if ext == "docx" and not data.startswith(b"PK\x03\x04"):
        raise ValueError("Invalid DOCX file")


def extract_text_from_pdf(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    parts: list[str] = []
    for page in reader.pages:
        try:
            parts.append(page.extract_text() or "")
        except Exception:
            continue
    return "\n".join(parts).strip()


def extract_text_from_docx(data: bytes) -> str:
    import docx

    doc = docx.Document(io.BytesIO(data))
    return "\n".join(p.text for p in doc.paragraphs).strip()


def get_pdf_page_count(data: bytes) -> int | None:
    """Safe page count for debug meta. None when not a readable PDF."""
    try:
        from pypdf import PdfReader

        return len(PdfReader(io.BytesIO(data)).pages)
    except Exception:
        return None


def extract_text(filename: str, data: bytes) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    check_magic_bytes(data, ext)
    if ext == "pdf":
        text = extract_text_from_pdf(data)
    elif ext == "docx":
        text = extract_text_from_docx(data)
    else:
        raise ValueError("Invalid file type. Only PDF and DOCX are supported")
    if not text or len(text.strip()) < 20:
        raise NoExtractableTextError(
            "No extractable text found. Scanned PDFs without a text layer are not supported"
        )
    return text[:20000]


def normalize_skills(skills: list[str] | None) -> list[str]:
    """Split, strip, dedup case-insensitive, preserve order, cap 20. Never invent."""
    if not skills:
        return []
    seen: set[str] = set()
    out: list[str] = []
    for raw in skills:
        for part in re.split(r"[,;|\n]+", raw):
            s = part.strip().strip(".")
            if not s or len(s) > 60:
                continue
            key = s.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(s)
            if len(out) >= 20:
                return out
    return out


STUDY_LEVEL_MAP = {
    "bac": "BAC",
    "baccalaureat": "BAC",
    "baccalauréat": "BAC",
    "bachelor": "LICENCE",
    "licence": "LICENCE",
    "license": "LICENCE",
    "bts": "LICENCE",
    "dut": "LICENCE",
    "but": "LICENCE",
    "master": "MASTER",
    "mastère": "MASTER",
    "msc": "MASTER",
    "mba": "MASTER",
    "ingenieur": "MASTER",
    "ingénieur": "MASTER",
    "engineer": "MASTER",
    "doctorat": "DOCTORAT",
    "phd": "DOCTORAT",
    "ph.d": "DOCTORAT",
    "docteur": "DOCTORAT",
}


def map_study_level(raw: str | None) -> str | None:
    """Map degree name to BAC/LICENCE/MASTER/DOCTORAT. Uncertain -> None."""
    if not raw:
        return None
    key = raw.strip().lower()
    if key in ("bac", "licence", "master", "doctorat"):
        return key.upper()
    # Order matters: check longer distinctive tokens before short "bac"
    # ("bachelor" contains "bac" as substring).
    ordered = sorted(STUDY_LEVEL_MAP.items(), key=lambda kv: -len(kv[0]))
    for token, level in ordered:
        if token == "bac":
            if re.search(r"\bbac\b|bac\+|baccalaureat|baccalauréat", key):
                return level
            continue
        if token in key:
            return level
    return None


def normalize_url(raw: str | None) -> str | None:
    if not raw:
        return None
    u = raw.strip()
    if not u:
        return None
    if not u.startswith(("http://", "https://")):
        return None
    if len(u) > 255:
        return None
    return u


def clamp_years(value: int | float | None) -> int | None:
    if value is None:
        return None
    try:
        iv = int(value)
    except (TypeError, ValueError):
        return None
    if iv < 0 or iv > 40:
        return None
    return iv
