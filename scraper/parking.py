"""
Parking detection helpers.

Rightmove (and to a lesser extent OnTheMarket) frequently leave the structured
"parking" field set to a placeholder like "Ask agent", even when the agent has
clearly described the parking situation in the listing copy. This module
inspects the structured fields where available and falls back to scanning the
free-text description / key features.

Returns one of:
    "yes"      — parking is included / available
    "no"       — listing explicitly says no parking
    "unknown"  — neither the structured field nor the text gave a signal
"""

from __future__ import annotations

import re
from typing import Iterable

# ── Phrases that mean "no parking" ───────────────────────────────────────────
# Checked first, because "no off-street parking" contains "off-street parking"
# and we don't want a false positive.
_NEGATIVE_PATTERNS = [
    r"\bno\s+(?:off[\s\-]?street\s+|off[\s\-]?road\s+|on[\s\-]?site\s+|on[\s\-]?street\s+|allocated\s+|dedicated\s+|private\s+|residents?[\'\s]?\s*)?parking\b",
    r"\bwithout\s+parking\b",
    r"\bdoes\s+not\s+(?:include|come\s+with|have|offer)\s+parking\b",
    r"\bdoesn['’]?t\s+(?:include|come\s+with|have|offer)\s+parking\b",
    r"\bparking\s+is\s+not\s+(?:available|included|provided|offered)\b",
    r"\bno\s+(?:driveway|garage)\b",
    r"\bunfortunately[^.]{0,30}\bno\s+parking\b",
]

# ── Phrases that mean "has parking" ──────────────────────────────────────────
_POSITIVE_PATTERNS = [
    r"\boff[\s\-]?street\s+parking\b",
    r"\boff[\s\-]?road\s+parking\b",
    r"\ballocated\s+parking\b",
    r"\bdedicated\s+parking\b",
    r"\bsecure\s+parking\b",
    r"\bunderground\s+parking\b",
    r"\bgated\s+parking\b",
    r"\bprivate\s+parking\b",
    r"\bcommunal\s+parking\b",
    r"\bgarage\b",
    r"\bdriveway\b",
    r"\bcar[\s\-]?port\b",
    r"\bparking\s+space\b",
    r"\bparking\s+spaces\b",
    r"\bparking\s+bay\b",
    r"\bparking\s+included\b",
    r"\bparking\s+available\b",
    r"\bwith\s+parking\b",
    r"\bcar\s+park\b",
    r"\bresidents?[\'\s]?\s*parking\b",
    r"\bpermit\s+parking\b",
    r"\bon[\s\-]?street\s+parking\b",
]

_NEGATIVE_RE = [re.compile(p, re.IGNORECASE) for p in _NEGATIVE_PATTERNS]
_POSITIVE_RE = [re.compile(p, re.IGNORECASE) for p in _POSITIVE_PATTERNS]

# Structured-field values that mean "the agent didn't fill this in" — we should
# fall through to the description, not trust the placeholder.
_PLACEHOLDER_VALUES = {
    "",
    "ask agent",
    "ask the agent",
    "contact agent",
    "tbc",
    "tbd",
    "unknown",
    "n/a",
    "na",
    "none specified",
    "not specified",
    "see description",
    "see description for details",
}


def detect_from_text(*texts: str | None) -> str:
    """
    Inspect one or more free-text fields and return 'yes' | 'no' | 'unknown'.
    Negative signals win over positive ones if both appear.
    """
    blob = " \n ".join(t for t in texts if t)
    if not blob.strip():
        return "unknown"

    if any(rx.search(blob) for rx in _NEGATIVE_RE):
        return "no"
    if any(rx.search(blob) for rx in _POSITIVE_RE):
        return "yes"
    return "unknown"


def _normalise_structured(value: str | None) -> str | None:
    """Map a structured parking value to 'yes' | 'no' | None (= use description)."""
    if not value:
        return None
    low = value.strip().lower()
    if low in _PLACEHOLDER_VALUES:
        return None
    if "no parking" in low or low == "no":
        return "no"
    if any(
        kw in low
        for kw in (
            "off-street",
            "off street",
            "off-road",
            "off road",
            "garage",
            "driveway",
            "allocated",
            "private",
            "secure",
            "underground",
            "carport",
            "car port",
            "permit",
            "on-street",
            "on street",
            "residents",
            "communal",
            "parking",
        )
    ):
        return "yes"
    return None


def detect(
    structured_values: Iterable[str | None] = (),
    text_fields: Iterable[str | None] = (),
) -> str:
    """
    Determine parking status. Trust a structured field if it's a real value;
    otherwise fall back to scanning the text fields (description, features...).
    Returns 'yes' | 'no' | 'unknown'.
    """
    for v in structured_values:
        normalised = _normalise_structured(v)
        if normalised is not None:
            return normalised

    return detect_from_text(*text_fields)
