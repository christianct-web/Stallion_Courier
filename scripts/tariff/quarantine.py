#!/usr/bin/env python3
"""Tariff DB quarantine pass — flag and clean OCR damage without inventing data.

Passes (all non-destructive to regulatory values — rates are never changed,
only flagged):

  1. ocr_dump_description  — descriptions that are raw Tesseract TSV streams
     (or otherwise >300 chars of OCR noise) are replaced with the official
     HS 2022 subheading text for their 6-digit prefix. The rate columns are
     untouched.
  2. junk characters       — leading `_ | ~ = —` artifacts stripped from
     otherwise-good descriptions.
  3. nonstandard_duty_rate — dutyPct not in the whitelist of rates that the
     DB itself attests at scale (>=20 occurrences: 0/5/10/15/20/25/30/40).
     Chapters 22 & 24 carry specific duties ($/L) in the CET which the
     current schema cannot represent — their odd percentages are flagged,
     never "corrected".
  4. code_not_in_hs2022    — THN whose 6-digit prefix does not exist in the
     HS 2022 nomenclature (phantom code from OCR digit misreads). Chapters
     98/99 are exempt (reserved for national use).

Flagged entries get needsReview=true; search/matcher should deprioritise
them. A machine-readable report is written next to the human report in
docs/tariff/.

Usage:
    python3 scripts/tariff/quarantine.py            # apply
    python3 scripts/tariff/quarantine.py --dry-run
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DB_PATH = ROOT / "backend" / "data" / "tt_tariff_db_2024.json"
HS_REF_PATH = ROOT / "backend" / "data" / "hs2022_reference.json"
REPORT_PATH = ROOT / "docs" / "tariff" / "quarantine_report.json"

# Rates the DB attests at scale (>=20 entries each). Anything else is an
# OCR suspect and gets flagged — NOT altered.
DUTY_WHITELIST = {0, 5, 10, 15, 20, 25, 30, 40}

# A raw Tesseract TSV stream: long runs of small ints followed by a
# confidence float, e.g. "5 1 7 1 4 3 514 522 24 15 93.290207".
TSV_SIGNATURE = re.compile(r"(?:-?\d+\s+){6,}\d+\.\d{4,}")
LEADING_JUNK = re.compile(r"^[\s_|~=—.\\-]+(?=[A-Za-z(])")


def is_dump(desc: str) -> bool:
    return len(desc) > 300 and bool(TSV_SIGNATURE.search(desc))


def flag(e: dict, name: str) -> None:
    e.setdefault("flags", [])
    if name not in e["flags"]:
        e["flags"].append(name)
    e["needsReview"] = True


def main() -> int:
    dry = "--dry-run" in sys.argv
    db = json.load(open(DB_PATH))
    hs6 = json.load(open(HS_REF_PATH))["subheadings_6"]
    entries = db["entries"]

    stats = Counter()
    detail: dict[str, list] = {"ocr_dump_description": [], "junk_cleaned": [],
                               "nonstandard_duty_rate": [], "code_not_in_hs2022": []}

    for e in entries:
        thn = e["thn"]
        desc = e.get("description") or ""

        # 1. TSV dump → official HS 2022 text fallback. Only the Tesseract
        # TSV signature marks corruption — length alone must NOT: genuine
        # CET wording can run long (e.g. 03055400's species enumeration),
        # and rewriting it would destroy real matcher vocabulary.
        if is_dump(desc):
            official = hs6.get(thn[:6])
            e["description"] = official or "[OCR-corrupted description — needs review]"
            flag(e, "ocr_dump_description")
            stats["ocr_dump_description"] += 1
            detail["ocr_dump_description"].append(thn)
            desc = e["description"]

        # 2. leading junk characters
        cleaned = LEADING_JUNK.sub("", desc)
        if cleaned != desc:
            e["description"] = cleaned
            stats["junk_cleaned"] += 1
            detail["junk_cleaned"].append(thn)

        # 3. rate whitelist (flag only — rates are regulatory data)
        duty = e.get("dutyPct")
        if duty is not None and float(duty) not in DUTY_WHITELIST:
            flag(e, "nonstandard_duty_rate")
            stats["nonstandard_duty_rate"] += 1
            detail["nonstandard_duty_rate"].append({"thn": thn, "dutyPct": duty})

        # 4. phantom 6-digit prefixes (chapters 98/99 are national-use)
        if int(thn[:2]) < 98 and thn[:6] not in hs6:
            flag(e, "code_not_in_hs2022")
            stats["code_not_in_hs2022"] += 1
            detail["code_not_in_hs2022"].append(thn)

    report = {
        "db_version": db.get("version"),
        "entry_count": len(entries),
        "stats": dict(stats),
        "detail": detail,
    }

    print(json.dumps(report["stats"], indent=1))
    if dry:
        print("(dry run — nothing written)")
        return 0

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    json.dump(report, open(REPORT_PATH, "w"), indent=1)
    json.dump(db, open(DB_PATH, "w"), indent=1)
    print(f"wrote {DB_PATH} and {REPORT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
