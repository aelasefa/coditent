"""CV text extraction + normalization helpers (pure functions, no I/O)."""
from __future__ import annotations

import asyncio
import io
import re
import zipfile

MAX_CV_BYTES = 5 * 1024 * 1024
MAX_PDF_PAGES = 50
MAX_DOCX_ENTRIES = 512
MAX_DOCX_ENTRY_BYTES = 8 * 1024 * 1024
MAX_DOCX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024
MAX_DOCX_COMPRESSION_RATIO = 200
MAX_EXTRACTED_TEXT_CHARS = 20_000
CV_VALIDATION_TIMEOUT_SECONDS = 5.0
CV_PARSE_TIMEOUT_SECONDS = 10.0
ALLOWED_EXTENSIONS = {"pdf", "docx"}
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
CONTENT_TYPE_BY_EXT = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


class NoExtractableTextError(ValueError):
    pass


class CVResourceLimitError(ValueError):
    """The document is valid-looking but exceeds a processing safety limit."""


class CVParseTimeoutError(ValueError):
    """The parser did not finish within the bounded processing window."""


def validate_cv_file(filename: str | None, content_type: str | None, size: int) -> str:
    """Validate upload. Return normalized extension or raise ValueError."""
    if not filename or "." not in filename:
        raise ValueError("CV must be a PDF or DOCX file")
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError("Invalid file type. Only PDF and DOCX are supported")
    if content_type and content_type != "application/octet-stream":
        if content_type not in ALLOWED_CONTENT_TYPES or content_type != CONTENT_TYPE_BY_EXT[ext]:
            raise ValueError("File content type does not match its extension")
    if size <= 0:
        raise ValueError("Empty file")
    if size > MAX_CV_BYTES:
        raise CVResourceLimitError("File too large. Maximum size is 5MB")
    return ext


def check_magic_bytes(data: bytes, ext: str) -> None:
    if ext == "pdf" and not data.startswith(b"%PDF-"):
        raise ValueError("Invalid PDF file")
    if ext == "docx" and not data.startswith(b"PK\x03\x04"):
        raise ValueError("Invalid DOCX file")


def _check_cv_size(data: bytes) -> None:
    if not data:
        raise ValueError("Empty file")
    if len(data) > MAX_CV_BYTES:
        raise CVResourceLimitError("File too large. Maximum size is 5MB")


def _validated_pdf_reader(data: bytes):
    from pypdf import PdfReader

    _check_cv_size(data)
    check_magic_bytes(data, "pdf")
    try:
        reader = PdfReader(io.BytesIO(data))
        is_encrypted = reader.is_encrypted
    except Exception as exc:
        raise ValueError("Invalid PDF file") from exc
    if is_encrypted:
        raise ValueError("Encrypted PDFs are not supported")
    try:
        page_count = len(reader.pages)
    except Exception as exc:
        raise ValueError("Invalid PDF file") from exc
    if page_count < 1:
        raise ValueError("PDF must contain at least one page")
    if page_count > MAX_PDF_PAGES:
        raise CVResourceLimitError(
            f"PDF exceeds the maximum of {MAX_PDF_PAGES} pages"
        )
    return reader


def validate_pdf_bounds(data: bytes) -> int:
    """Validate PDF structure and return its bounded page count."""
    return len(_validated_pdf_reader(data).pages)


def _safe_docx_infos(data: bytes) -> list[zipfile.ZipInfo]:
    _check_cv_size(data)
    check_magic_bytes(data, "docx")
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except (zipfile.BadZipFile, OSError) as exc:
        raise ValueError("Invalid DOCX file") from exc

    with archive:
        infos = archive.infolist()
        if not infos:
            raise ValueError("Invalid DOCX structure")
        if len(infos) > MAX_DOCX_ENTRIES:
            raise CVResourceLimitError(
                f"DOCX exceeds the maximum of {MAX_DOCX_ENTRIES} archive entries"
            )

        names: set[str] = set()
        total_uncompressed = 0
        total_compressed = 0
        for info in infos:
            normalized = info.filename.replace("\\", "/")
            parts = [part for part in normalized.split("/") if part]
            if normalized != info.filename or normalized.startswith("/") or ".." in parts:
                raise ValueError("Invalid DOCX archive path")
            if info.flag_bits & 0x1:
                raise ValueError("Encrypted DOCX files are not supported")
            if info.compress_type not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}:
                raise ValueError("Unsupported DOCX compression method")
            if info.file_size > MAX_DOCX_ENTRY_BYTES:
                raise CVResourceLimitError("DOCX contains an oversized archive entry")
            if info.file_size > max(info.compress_size, 1) * MAX_DOCX_COMPRESSION_RATIO:
                raise CVResourceLimitError("DOCX compression ratio exceeds the safe limit")
            total_uncompressed += info.file_size
            total_compressed += info.compress_size
            if total_uncompressed > MAX_DOCX_UNCOMPRESSED_BYTES:
                raise CVResourceLimitError("DOCX expands beyond the safe processing limit")
            if normalized in names:
                raise ValueError("DOCX contains duplicate archive entries")
            names.add(normalized)

        if total_uncompressed > max(total_compressed, 1) * MAX_DOCX_COMPRESSION_RATIO:
            raise CVResourceLimitError("DOCX compression ratio exceeds the safe limit")
        if "[Content_Types].xml" not in names or "word/document.xml" not in names:
            raise ValueError("Invalid DOCX structure")
        try:
            corrupt_entry = archive.testzip()
        except Exception as exc:
            raise ValueError("Invalid DOCX file") from exc
        if corrupt_entry is not None:
            raise ValueError("Invalid DOCX file")
        return infos


def validate_docx_bounds(data: bytes) -> None:
    """Reject arbitrary ZIPs and bounded-resource DOCX bombs."""
    _safe_docx_infos(data)


def _open_validated_docx(data: bytes):
    import docx

    validate_docx_bounds(data)
    try:
        return docx.Document(io.BytesIO(data))
    except Exception as exc:
        raise ValueError("Invalid DOCX file") from exc


def validate_cv_content(data: bytes, ext: str) -> None:
    _check_cv_size(data)
    check_magic_bytes(data, ext)
    if ext == "pdf":
        validate_pdf_bounds(data)
    elif ext == "docx":
        _open_validated_docx(data)
    else:
        raise ValueError("Invalid file type. Only PDF and DOCX are supported")


async def validate_cv_content_async(
    data: bytes,
    ext: str,
    *,
    timeout_s: float = CV_VALIDATION_TIMEOUT_SECONDS,
) -> None:
    try:
        await asyncio.wait_for(
            asyncio.to_thread(validate_cv_content, data, ext),
            timeout=timeout_s,
        )
    except asyncio.TimeoutError as exc:
        raise CVParseTimeoutError("CV validation exceeded the processing time limit") from exc


def _extract_pdf_reader_text(reader) -> str:
    parts: list[str] = []
    remaining = MAX_EXTRACTED_TEXT_CHARS
    for page in reader.pages:
        try:
            page_text = page.extract_text() or ""
        except Exception:
            continue
        if page_text:
            parts.append(page_text[:remaining])
            remaining -= min(len(page_text), remaining)
        if remaining <= 0:
            break
    return "\n".join(parts).strip()


def extract_text_from_pdf(data: bytes) -> str:
    return _extract_pdf_reader_text(_validated_pdf_reader(data))


def extract_text_from_docx(data: bytes) -> str:
    doc = _open_validated_docx(data)
    parts: list[str] = []
    remaining = MAX_EXTRACTED_TEXT_CHARS
    for paragraph in doc.paragraphs:
        if remaining <= 0:
            break
        text = paragraph.text
        if not text:
            continue
        parts.append(text[:remaining])
        remaining -= min(len(text), remaining)
    return "\n".join(parts).strip()


def get_pdf_page_count(data: bytes) -> int | None:
    """Safe page count for debug meta. None when not a readable PDF."""
    try:
        return validate_pdf_bounds(data)
    except Exception:
        return None


def extract_text_with_meta(filename: str, data: bytes) -> tuple[str, int | None]:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    _check_cv_size(data)
    check_magic_bytes(data, ext)
    if ext == "pdf":
        reader = _validated_pdf_reader(data)
        pages = len(reader.pages)
        text = _extract_pdf_reader_text(reader)
    elif ext == "docx":
        text = extract_text_from_docx(data)
        pages = None
    else:
        raise ValueError("Invalid file type. Only PDF and DOCX are supported")
    if not text or len(text.strip()) < 20:
        raise NoExtractableTextError(
            "No extractable text found. Scanned PDFs without a text layer are not supported"
        )
    return text[:MAX_EXTRACTED_TEXT_CHARS], pages


def extract_text(filename: str, data: bytes) -> str:
    return extract_text_with_meta(filename, data)[0]


async def extract_text_with_meta_async(
    filename: str,
    data: bytes,
    *,
    timeout_s: float = CV_PARSE_TIMEOUT_SECONDS,
) -> tuple[str, int | None]:
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(extract_text_with_meta, filename, data),
            timeout=timeout_s,
        )
    except asyncio.TimeoutError as exc:
        raise CVParseTimeoutError("CV parsing exceeded the processing time limit") from exc


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
