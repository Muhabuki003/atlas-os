#!/usr/bin/env python3
"""Community Edition release validation — must find 0 seeded personal/demo results."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Names and phrases that must not appear in bundled CE seed data.
NAME_TERMS = [
    "Patryk",
    "Houseify",
    "Apex",
    "Core Arena",
    "TransportOS",
    "EVE Bikes",
    "Sarah",
    "Kate",
    "John",
    "Jordan",
]

PHRASE_TERMS = [
    "finance reminder",
]

WORD_TERMS = [
    "rent",
    "salary",
]

# Primary seed/config locations (Community Edition defaults).
PRIMARY_PATHS = (
    "config/atlas",
    "AtlasWorkspace",
)

# Secondary scan for hardcoded demo strings in CE-facing JS (narrow list).
CE_JS_FILES = (
    "static/js/officesModal.js",
    "static/js/atlasProjects.js",
    "static/js/home.js",
    "static/js/atlasFinance.js",
    "static/js/atlasSetupWizard.js",
)

SKIP_PARTS = {
    "node_modules",
    ".git",
    "__pycache__",
    "validate_ce_release.py",
    "seed_demo_emails.py",
    "demo_email",
    "tests",
}

SKIP_SUFFIXES = {".pyc", ".png", ".jpg", ".webp", ".woff", ".woff2", ".map"}


def _should_scan(path: Path) -> bool:
    if path.suffix.lower() in SKIP_SUFFIXES:
        return False
    if any(part in SKIP_PARTS for part in path.parts):
        return False
    return True


def _match_line(line: str) -> str | None:
    lower = line.lower()
    for term in NAME_TERMS:
        if term.lower() in lower:
            if term.lower() == "john" and re.search(r"\bjson\b", lower):
                continue
            if term.lower() == "apex" and "apexcharts" in lower:
                continue
            if term.lower() == "kate" and "katex" in lower:
                continue
            return term
    for term in PHRASE_TERMS:
        if term.lower() in lower:
            return term
    for term in WORD_TERMS:
        if re.search(rf"\b{re.escape(term)}\b", lower):
            return term
    return None


def _scan_file(path: Path) -> list[tuple[str, int, str]]:
    hits: list[tuple[str, int, str]] = []
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return hits
    for i, line in enumerate(text.splitlines(), 1):
        term = _match_line(line)
        if term:
            hits.append((term, i, line.strip()[:120]))
    return hits


def _collect_paths() -> list[Path]:
    out: list[Path] = []
    for rel in PRIMARY_PATHS:
        target = ROOT / rel
        if not target.exists():
            continue
        if target.is_file():
            out.append(target)
        else:
            out.extend(p for p in sorted(target.rglob("*")) if p.is_file() and _should_scan(p))
    for rel in CE_JS_FILES:
        p = ROOT / rel
        if p.is_file():
            out.append(p)
    return out


def main() -> int:
    all_hits: list[tuple[str, Path, int, str]] = []
    for path in _collect_paths():
        for term, line_no, snippet in _scan_file(path):
            all_hits.append((term, path.relative_to(ROOT), line_no, snippet))

    terms_display = ", ".join(NAME_TERMS + PHRASE_TERMS + WORD_TERMS)
    print("Atlas Community Edition - seeded data validation")
    print(f"Terms: {terms_display}")
    print(f"Results: {len(all_hits)} seeded result(s)")
    if all_hits:
        print("\nFAIL - personal/demo seed data found:\n")
        for term, path, line_no, snippet in all_hits:
            safe = snippet.encode("ascii", "replace").decode("ascii")
            print(f"  [{term}] {path}:{line_no}")
            print(f"    {safe}")
        return 1
    print("\nPASS - 0 seeded results")
    return 0


if __name__ == "__main__":
    sys.exit(main())
