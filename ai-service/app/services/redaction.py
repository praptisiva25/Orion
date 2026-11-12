from __future__ import annotations

import re


_SENSITIVE_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b", re.IGNORECASE), "[REDACTED PAN]"),
    (re.compile(r"\b[0-9]{4}[ -]?[0-9]{4}[ -]?[0-9]{4}\b"), "[REDACTED ID NUMBER]"),
    (re.compile(r"(?<!\d)(?:\d[ -]?){8,18}(?!\d)"), "[REDACTED ACCOUNT OR REFERENCE NUMBER]"),
    (re.compile(r"\b(?:[0-9][ -]?){13,19}\b"), "[REDACTED CARD OR ACCOUNT NUMBER]"),
    (re.compile(r"\b[A-Z]{4}0[A-Z0-9]{6}\b", re.IGNORECASE), "[REDACTED IFSC]"),
    (re.compile(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b"), "[REDACTED EMAIL]"),
    (re.compile(r"(?<!\w)(?:\+?\d[\d ()-]{8,}\d)(?!\w)"), "[REDACTED PHONE OR NUMBER]"),
    (
        re.compile(
            r"\b(password|passcode|otp|pin|cvv|cvc|secret|token|api\s+key|access\s+key|security\s+code|authorization)\s*(?::|=|#|is)?\s*(?:bearer\s+)?[^\s,;]+",
            re.IGNORECASE,
        ),
        r"\1 [REDACTED]",
    ),
    (
        re.compile(r"\b(account|acct|card)\s*(?:number|no\.?|#|:|=)\s*[A-Z0-9-]{5,}", re.IGNORECASE),
        r"\1 [REDACTED]",
    ),
)


def redact_sensitive_text(value: str) -> str:
    """Reduce exposure of common Indian banking identifiers before provider calls."""
    sanitized = value
    for pattern, replacement in _SENSITIVE_PATTERNS:
        sanitized = pattern.sub(replacement, sanitized)
    return sanitized
