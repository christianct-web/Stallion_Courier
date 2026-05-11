"""
Column-aware tariff parser using Tesseract TSV output.

The new high-quality PDF (Legal Notice 218, May 2026 export) has clear
table structure that makes column-aware extraction reliable:

  Page width 1313 pixels at 150 DPI.
  Column boundaries (consistent across all data pages):
    HS column         x ≈ 320 - 410     (4-digit dotted, e.g. "4501.10")
    CET column        x ≈ 410 - 480     (2-digit, e.g. "00", "10", "90")
    Description       x ≈ 480 - 1030    (longest col)
    Duty rate         x ≈ 1030 - 1130   (e.g. "Free", "20%")
    Unit              x ≈ 1130 - 1300   (e.g. "kg", "u", "l")

Strategy:
  1. Read TSV (per-word x/y/conf data).
  2. Group words into rows using y-bucket clustering.
  3. For each row, partition words into the 5 column buckets by x.
  4. Parse the HS+CET to assemble an 8-digit THN.
  5. Reassemble the description, rate, unit columns by joining word text.
  6. Detect parent-heading rows (HS present, no CET) and use them for
     hierarchy expansion of "Other" descriptions.

This is far more reliable than the regex-on-text approach used by v2
because it doesn't have to guess column boundaries from whitespace.
"""
from __future__ import annotations

import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

TSV_DIR = Path("/home/claude/tariff_v2_tsv")
OUT_PATH = Path("/home/claude/Stallion_Courier/backend/data/tt_tariff_db_2024.json")

# Column boundaries (in 150 DPI pixel coordinates, page width 1313)
# Determined empirically from PSM 3 OCR of page 274 (cork chapter):
#   HS code at x=322-380, CET at x=400-420, descriptions starting at x=440,
#   rate around x=870-950, unit around x=950-1010.
COL_HS_START = 280
COL_HS_END = 395
COL_CET_START = 395
COL_CET_END = 435
COL_DESC_START = 435
COL_DESC_END = 860
COL_RATE_START = 860
COL_RATE_END = 945
COL_UNIT_START = 945
COL_UNIT_END = 1313


# ── Regexes ──────────────────────────────────────────────────────────────────

# A "real" HS code in the document looks like "4501.10" or "8517.13" — the
# 4-digit chapter-heading followed by a dot and 2-digit sub-heading.
HS_DOTTED_RE = re.compile(r"^(\d{4})\.(\d{2})$")

# Some OCR results lose the dot: "450110" — we recover this if 6 digits
HS_NODOT_RE = re.compile(r"^(\d{6})$")

# Heading-only HS like "45.01" (without sub-heading suffix)
HS_HEADING_RE = re.compile(r"^(\d{2})\.(\d{2})$")

# CET subcode: 2 digits
CET_RE = re.compile(r"^(\d{2})$")

# Chapter detection — must be uppercase CHAPTER followed by number,
# preferably also followed by a section title or "Continued" marker.
# Lowercase "chapter X" appears in body text as cross-references (e.g.
# "...goods of chapter 78") which we want to ignore.
CHAPTER_RE = re.compile(r"\bCHAPTER\s+(\d{1,2})\b")

# Rate
RATE_RE = re.compile(r"^(?:Free|FREE|free|\d{1,3}\s*%|\d{1,3}%)$", re.IGNORECASE)

# Common unit values
UNITS = {"kg", "kgs", "l", "u", "m", "m2", "m3", "t", "TJ", "tj",
         "pair", "pairs", "no", "nos", "number"}


# ── TSV reader ───────────────────────────────────────────────────────────────


def read_tsv(path: Path) -> List[Dict[str, Any]]:
    """Read Tesseract TSV and return word-level entries."""
    words = []
    with open(path) as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            if row["level"] != "5":
                continue
            text = row["text"].strip()
            if not text:
                continue
            try:
                conf = float(row["conf"])
            except (ValueError, KeyError):
                conf = -1
            if conf < 30:  # skip very low-confidence words
                continue
            words.append({
                "left": int(row["left"]),
                "top": int(row["top"]),
                "width": int(row["width"]),
                "height": int(row["height"]),
                "right": int(row["left"]) + int(row["width"]),
                "text": text,
                "conf": conf,
            })
    return words


def group_into_rows(words: List[Dict], y_tolerance: int = 12) -> List[List[Dict]]:
    """Cluster words into rows by their y-coordinate."""
    if not words:
        return []
    sorted_words = sorted(words, key=lambda w: (w["top"], w["left"]))
    rows = []
    current_row = [sorted_words[0]]
    current_y = sorted_words[0]["top"]

    for w in sorted_words[1:]:
        if abs(w["top"] - current_y) <= y_tolerance:
            current_row.append(w)
        else:
            rows.append(sorted(current_row, key=lambda x: x["left"]))
            current_row = [w]
            current_y = w["top"]
    if current_row:
        rows.append(sorted(current_row, key=lambda x: x["left"]))
    return rows


# ── Row parsing ──────────────────────────────────────────────────────────────


def in_column(word: Dict, col_start: int, col_end: int) -> bool:
    """Check if a word's centroid falls within a column."""
    cx = word["left"] + word["width"] // 2
    return col_start <= cx < col_end


def extract_columns(row: List[Dict]) -> Dict[str, str]:
    """Bucket words in a row into columns by x position."""
    cols = {"hs": [], "cet": [], "desc": [], "rate": [], "unit": []}
    for w in row:
        text = w["text"]
        cx = w["left"] + w["width"] // 2
        if cx < COL_HS_END:
            cols["hs"].append(text)
        elif cx < COL_CET_END:
            cols["cet"].append(text)
        elif cx < COL_DESC_END:
            cols["desc"].append(text)
        elif cx < COL_RATE_END:
            cols["rate"].append(text)
        else:
            cols["unit"].append(text)
    return {k: " ".join(v).strip() for k, v in cols.items()}


def parse_hs_cell(text: str) -> Tuple[Optional[str], Optional[str]]:
    """Parse the HS column. Returns (heading_or_full, kind).

    Returns:
        - ('XXXX.XX', 'subheading') if it's a 6-digit subheading like 4501.10
        - ('XX.XX', 'heading') if it's a 4-digit chapter heading like 45.01
        - (None, None) otherwise
    """
    s = text.strip().rstrip(",.;")
    # Cleanup common OCR mistakes in HS codes
    s = s.replace("O", "0").replace("l", "1").replace("|", "")
    s = re.sub(r"\s+", "", s)

    m = HS_DOTTED_RE.match(s)
    if m:
        return s, "subheading"

    # Sometimes OCR loses the dot
    m = HS_NODOT_RE.match(s)
    if m:
        return f"{s[:4]}.{s[4:]}", "subheading"

    m = HS_HEADING_RE.match(s)
    if m:
        return s, "heading"

    return None, None


def parse_cet_cell(text: str) -> Optional[str]:
    s = text.strip().rstrip(",.;|")
    s = s.replace("O", "0").replace("l", "1").replace("|", "")
    s = re.sub(r"\s+", "", s)
    m = CET_RE.match(s)
    if m:
        return s
    return None


def parse_rate_cell(text: str) -> Tuple[Optional[float], bool, str]:
    """Returns (numeric_rate, is_exempt, raw_text)."""
    s = text.strip().rstrip(".,;").lstrip()
    if not s:
        return None, False, ""
    if "free" in s.lower():
        return 0.0, True, s
    m = re.search(r"(\d{1,3})\s*%?", s)
    if m:
        return int(m.group(1)) / 100.0, False, s
    return None, False, s


def normalize_unit(text: str) -> Optional[str]:
    s = text.strip().rstrip(",.;").lower()
    s = s.replace("|", "").strip()
    if not s:
        return None
    # OCR variations
    s = s.replace("kgs", "kg").replace("kgicu", "kg")
    s = s.replace("kgéu", "kg").replace("kgéicu", "kg")
    s = s.replace("kgdu", "kg").replace("kg&u", "kg")
    s = s.replace("nos", "u").replace("number", "u").replace("no", "u")
    s = s.replace("pairs", "pair")
    if s in UNITS or s == "kg":
        return s if s != "tj" else "TJ"
    # Sometimes a one-letter unit got picked up: "k" might mean kg
    if s == "k":
        return "kg"
    return None


def clean_description(text: str) -> str:
    """Strip leading dashes, pipes, OCR noise; preserve the actual content."""
    s = text.strip()
    # Apply OCR-artifact fixes first (some tokens like 'forrcaring')
    s = apply_ocr_fixes(s)
    # Strip leading hierarchy markers, pipes, and OCR noise
    s = re.sub(r"^[\-~=\|•·\+\s\.]+", "", s)
    # Collapse runs of dashes/equals (===, ---)
    s = re.sub(r"[=]{2,}", " ", s)
    s = re.sub(r"[\-]{2,}", " - ", s)
    s = re.sub(r"\s+", " ", s)
    s = s.rstrip("|").strip()
    return s


# OCR substitutions observed in the original CET PDF
OCR_FIXES = [
    (re.compile(r"\bforrcaring\b", re.IGNORECASE), "for rearing"),
    (re.compile(r"\bbrising\b", re.IGNORECASE), "brisling"),
    (re.compile(r"\bcrcvalles\b", re.IGNORECASE), "crevalles"),
    (re.compile(r"\bspcarfish\b", re.IGNORECASE), "spearfish"),
    (re.compile(r"\bsailfishcs\b", re.IGNORECASE), "sailfishes"),
    (re.compile(r"\bsccrfishes\b", re.IGNORECASE), "seerfishes"),
    (re.compile(r"\bAlcwives\b", re.IGNORECASE), "Alewives"),
    (re.compile(r"\bbrcine\b", re.IGNORECASE), "brine"),
    (re.compile(r"\bCareasses\b", re.IGNORECASE), "Carcasses"),
    (re.compile(r"(\w):(\w)"), r"\1\2"),
    (re.compile(r"\{([A-Za-z])"), r"(\1"),
    (re.compile(r"([A-Za-z])\}"), r"\1)"),
]


def apply_ocr_fixes(s: str) -> str:
    for pattern, replacement in OCR_FIXES:
        s = pattern.sub(replacement, s)
    return s


def get_dash_depth(text: str) -> int:
    """Count leading dash characters to determine hierarchy depth."""
    s = text.lstrip(" |")
    depth = 0
    i = 0
    while i < len(s):
        if s[i] in "-~":
            depth += 1
            i += 1
            while i < len(s) and s[i] == " ":
                i += 1
        else:
            break
    return depth


# ── Hierarchy tracker ────────────────────────────────────────────────────────


class HierarchyTracker:
    """Track parent-context for "Other" expansion."""

    def __init__(self):
        self._stack: List[Tuple[int, str]] = []
        self._heading: str = ""

    def reset(self):
        self._stack = []
        self._heading = ""

    def set_heading(self, text: str) -> None:
        self._heading = clean_description(text or "")

    def push(self, depth: int, description: str) -> None:
        while self._stack and self._stack[-1][0] >= depth:
            self._stack.pop()
        if description.strip():
            self._stack.append((depth, description))

    def expand(self, desc: str) -> str:
        d = desc.strip().lower().rstrip(":.")
        is_placeholder = (
            d in ("other", "others", "other goods", "for other",
                  "of cotton", "of wool", "of silk", "of synthetic fibres",
                  "of man-made fibres", "of other textile materials",
                  "for breeding", "for rearing", "fresh", "frozen", "dried",
                  "for breeder flock", "not for breeder flock")
            or len(d) < 4
        )
        if not is_placeholder:
            return desc

        parts: List[str] = []
        if self._heading:
            parts.append(self._heading)
        for _, parent in self._stack:
            pd = parent.strip()
            if pd and pd.lower() != d:
                parts.append(pd)
        if not parts:
            return desc
        return " - ".join(parts) + " - " + desc.strip(" -:.")


# ── Page processor ───────────────────────────────────────────────────────────


def process_page(
    tsv_path: Path,
    page_num: int,
    current_chapter: Optional[int],
    tracker: HierarchyTracker,
) -> Tuple[List[Dict], Optional[int]]:
    words = read_tsv(tsv_path)
    if not words:
        return [], current_chapter

    # Detect chapter from any text on the page. Tesseract sometimes splits
    # "CHAPTER 24" into separate word tokens, so we look at the joined text
    # both with and without internal whitespace boundaries.
    full_text = " ".join(w["text"] for w in words)
    cm = CHAPTER_RE.search(full_text)
    if cm:
        new_chap = int(cm.group(1))
        if new_chap != current_chapter:
            current_chapter = new_chap
            tracker.reset()

    rows = group_into_rows(words)
    entries = []

    for row in rows:
        cols = extract_columns(row)

        # Parse the HS column
        hs_value, hs_kind = parse_hs_cell(cols["hs"])
        cet_value = parse_cet_cell(cols["cet"])
        desc_raw = cols["desc"]
        rate_raw = cols["rate"]
        unit_raw = cols["unit"]

        if not hs_value:
            # Not a tariff line. But it might be a continuation of the previous
            # row's description — for now skip it.
            continue

        if hs_kind == "heading":
            # 4-digit heading row, e.g. "45.01" with description like "Natural cork..."
            tracker.set_heading(desc_raw)
            continue

        # When the OCR misses the CET column but the row clearly has a complete
        # entry (description AND a rate), it's overwhelmingly likely that the
        # CET subcode is "00" — the most common single-leaf code in the CET.
        # We only infer this when there's strong evidence of a real entry.
        if hs_kind == "subheading" and not cet_value:
            has_strong_signal = (
                bool(desc_raw and len(desc_raw.strip()) > 5)
                and bool(rate_raw and rate_raw.strip())
            )
            if has_strong_signal:
                # Treat as CET=00. This catches the very common case where the
                # 6-digit subheading IS the only code (no further breakouts).
                cet_value = "00"
                inferred_cet = True
            else:
                # No description AND no rate — this is a parent-only row, push
                # to hierarchy stack
                depth = get_dash_depth(desc_raw)
                cleaned = clean_description(desc_raw)
                tracker.push(depth, cleaned)
                continue
        else:
            inferred_cet = False

        # We have a full 8-digit THN
        thn = hs_value.replace(".", "") + cet_value
        if len(thn) != 8 or not thn.isdigit():
            continue

        depth = get_dash_depth(desc_raw)
        cleaned_desc = clean_description(desc_raw)
        tracker.push(depth, cleaned_desc)
        expanded_desc = tracker.expand(cleaned_desc)

        rate_num, is_exempt, _ = parse_rate_cell(rate_raw)
        unit = normalize_unit(unit_raw)

        entries.append({
            "thn": thn,
            "hs": hs_value,
            "cet": cet_value,
            "description": expanded_desc,
            "_raw_description": cleaned_desc,
            "duty_rate_raw": rate_raw,
            "duty_rate": rate_num,
            "is_exempt": is_exempt,
            "unit": unit,
            "chapter": current_chapter,
            "source_page": page_num,
        })

    return entries, current_chapter


# ── Manual entries (still needed for any pages where TSV fails) ──────────────


MANUAL_ENTRIES: List[Dict[str, Any]] = [
    # 83062900 — broker uses; verify if OCR catches it this run
    {"thn": "83062900", "hs": "8306.29", "cet": "00",
     "description": "Bells, gongs and the like — Statuettes and other ornaments — Other (not plated with precious metal)",
     "duty_rate_raw": "20%", "duty_rate": 0.20, "is_exempt": False,
     "unit": "kg", "chapter": 83, "source_page": 0},
    # 57050090 — broker uses
    {"thn": "57050090", "hs": "5705.00", "cet": "90",
     "description": "Other carpets and other textile floor coverings, whether or not made up — Other",
     "duty_rate_raw": "20%", "duty_rate": 0.20, "is_exempt": False,
     "unit": "kg", "chapter": 57, "source_page": 0},
    # 48192090 — Sacks/bags of paper, non-corrugated, other (broker uses)
    {"thn": "48192090", "hs": "4819.20", "cet": "90",
     "description": "Folding cartons, boxes and cases of non-corrugated paper or paperboard — Other",
     "duty_rate_raw": "15%", "duty_rate": 0.15, "is_exempt": False,
     "unit": "kg", "chapter": 48, "source_page": 0},
    # 33059000 — Hair preparations, other
    {"thn": "33059000", "hs": "3305.90", "cet": "00",
     "description": "Preparations for use on the hair — Other",
     "duty_rate_raw": "20%", "duty_rate": 0.20, "is_exempt": False,
     "unit": "kg", "chapter": 33, "source_page": 0},
    # 61091000 — T-shirts, cotton (very common courier item)
    {"thn": "61091000", "hs": "6109.10", "cet": "00",
     "description": "T-shirts, singlets and other vests, knitted or crocheted — Of cotton",
     "duty_rate_raw": "20%", "duty_rate": 0.20, "is_exempt": False,
     "unit": "u", "chapter": 61, "source_page": 0},
    # 94036000 — Wooden furniture, other
    {"thn": "94036000", "hs": "9403.60", "cet": "00",
     "description": "Other furniture and parts thereof — Other wooden furniture",
     "duty_rate_raw": "20%", "duty_rate": 0.20, "is_exempt": False,
     "unit": "u", "chapter": 94, "source_page": 0},
    # 42022200 — Handbags with plastic outer surface (refine description)
    {"thn": "42022200", "hs": "4202.22", "cet": "00",
     "description": "Handbags, whether or not with shoulder strap — With outer surface of sheeting of plastics or of textile materials",
     "duty_rate_raw": "20%", "duty_rate": 0.20, "is_exempt": False,
     "unit": "u", "chapter": 42, "source_page": 0},
    # 62064000 — Women's blouses, MMF (refine description)
    {"thn": "62064000", "hs": "6206.40", "cet": "00",
     "description": "Women's or girls' blouses, shirts and shirt-blouses — Of man-made fibres",
     "duty_rate_raw": "20%", "duty_rate": 0.20, "is_exempt": False,
     "unit": "u", "chapter": 62, "source_page": 0},
]


def merge_manual(by_thn: Dict[str, Dict]) -> int:
    added = 0
    replaced = 0
    for m in MANUAL_ENTRIES:
        existing = by_thn.get(m["thn"])
        if not existing:
            by_thn[m["thn"]] = m
            added += 1
        elif (len(existing.get("description", "")) < 30
              or existing.get("description", "").strip().lower() in ("other", "other:")
              or "materials" == existing.get("description", "").strip().lower()):
            by_thn[m["thn"]] = m
            replaced += 1
    return added + replaced


# ── Main ─────────────────────────────────────────────────────────────────────


def main():
    tsv_files = sorted(TSV_DIR.glob("p-*.tsv"))
    print(f"Processing {len(tsv_files)} TSV files...")

    all_entries: Dict[str, Dict[str, Any]] = {}
    current_chapter: Optional[int] = None
    tracker = HierarchyTracker()

    pages_with_entries = 0
    pages_with_zero = 0

    for tsv_path in tsv_files:
        page_num = int(tsv_path.stem.split("-")[1])
        entries, current_chapter = process_page(
            tsv_path, page_num, current_chapter, tracker
        )
        if entries:
            pages_with_entries += 1
            for e in entries:
                key = e["thn"]
                if key not in all_entries:
                    all_entries[key] = e
                else:
                    # Prefer the entry with longer/better description
                    existing = all_entries[key]
                    if len(e["description"]) > len(existing["description"]):
                        all_entries[key] = e
        else:
            pages_with_zero += 1

    manual_added = merge_manual(all_entries)

    # Cleanup before writing
    for e in all_entries.values():
        e.pop("_raw_description", None)

    sorted_entries = [all_entries[k] for k in sorted(all_entries.keys())]

    # Convert to Stallion-compatible schema
    output_entries = []
    for e in sorted_entries:
        duty_pct = (
            int(round(e["duty_rate"] * 100))
            if e.get("duty_rate") is not None
            else 0
        )
        is_exempt = bool(e.get("is_exempt") or duty_pct == 0)
        if duty_pct == 0:
            duty_rate_str = "Free + 12.5% VAT"
        else:
            duty_rate_str = f"{duty_pct}% + 12.5% VAT"
        output_entries.append({
            "code": f"{e['hs']}.{e['cet']}",
            "description": e["description"],
            "dutyPct": duty_pct,
            "vatPct": 12.5,
            "surchargePct": 0,
            "dutyRate": duty_rate_str,
            "notes": (
                f"CET 2024 rate {e.get('duty_rate_raw') or 'unparsed'}, "
                f"chapter {e.get('chapter')}, page {e.get('source_page')}"
            ),
            "thn": e["thn"],
            "isExempt": is_exempt,
            "chapter": e.get("chapter"),
            "unit": e.get("unit"),
        })

    db = {
        "version": "2026-tt-cet-2024-v3",
        "source": (
            "T&T Customs (Common External Tariff) Order, 2024 "
            "(Legal Notice 218 of 26 Nov 2024, effective 1 Jan 2025). "
            "Re-extracted from high-res PDF using column-aware Tesseract TSV."
        ),
        "rebuilt_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "entry_count": len(output_entries),
        "extraction_notes": (
            "Column-aware extraction from Tesseract TSV with "
            "hierarchy tracking and parent-context expansion for 'Other' entries."
        ),
        "entries": output_entries,
    }

    OUT_PATH.write_text(json.dumps(db, indent=2))

    # Stats
    just_other = sum(1 for e in output_entries if e["description"].strip().lower() in ("other", "other:"))
    short = sum(1 for e in output_entries if len(e["description"]) < 5)
    artifacts = sum(1 for e in output_entries
                    if any(art in e["description"] for art in ["===", "+~", "forrcaring"]))

    print()
    print("=== Extraction stats ===")
    print(f"  Total entries: {len(output_entries)}")
    print(f"  Pages with entries: {pages_with_entries}")
    print(f"  Pages with zero entries: {pages_with_zero}")
    print(f"  Manual entries added/replaced: {manual_added}")
    print(f"  Just 'Other' (placeholder): {just_other}")
    print(f"  Very short descriptions (<5 chars): {short}")
    print(f"  OCR artifacts remaining: {artifacts}")
    print(f"  Output: {OUT_PATH}")


if __name__ == "__main__":
    main()
