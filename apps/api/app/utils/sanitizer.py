import re
import html

# Regex patterns matching dangerous HTML elements, attributes, and script injection vectors
DANGEROUS_TAGS_RE = re.compile(r"<\s*(script|iframe|object|embed|applet|meta|link|style)[^>]*>", re.IGNORECASE)
DANGEROUS_CLOSING_TAGS_RE = re.compile(r"<\s*/\s*(script|iframe|object|embed|applet|meta|link|style)\s*>", re.IGNORECASE)
DANGEROUS_ATTRS_RE = re.compile(r"\s*on[a-z]+\s*=\s*[\"'][^\"']*[\"']|\s*on[a-z]+\s*=\s*[^>\s]+", re.IGNORECASE)
JAVASCRIPT_URI_RE = re.compile(r"javascript:\s*", re.IGNORECASE)


def sanitize_input_text(text: str | None) -> str | None:
    """Sanitize user-provided text inputs by stripping dangerous HTML tags and script injections."""
    if text is None:
        return None
    if not isinstance(text, str):
        return text

    # Remove dangerous script tags and event handlers
    cleaned = DANGEROUS_TAGS_RE.sub("", text)
    cleaned = DANGEROUS_CLOSING_TAGS_RE.sub("", cleaned)
    cleaned = DANGEROUS_ATTRS_RE.sub("", cleaned)
    cleaned = JAVASCRIPT_URI_RE.sub("", cleaned)

    return cleaned.strip()
