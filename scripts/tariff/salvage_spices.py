#!/usr/bin/env python3
"""Recover spice-chapter entries (09.06–09.09) lost by the v3 OCR pipeline.

The v3 extraction failed on the spice pages of the 2024 CET PDF: headings
0906–0909 produced no entries, and the raw Tesseract TSV for those pages was
accidentally embedded as the *description* of entries 09101200 / 09102000
(10,475 chars each). This script re-parses that embedded TSV word stream and
inserts the recoverable rows.

Provenance: every rate/unit below was read from the embedded OCR dump
(word-confidence visible in the TSV), NOT from model memory. The parse is
reproducible with --show-parse. All inserted entries carry
flags=["recovered_from_ocr_dump"] and needsReview=true so brokers verify
them in-app before relying on them.

Deliberately excluded: 09101100 (ginger, neither crushed nor ground) — the
dump reads its rate as "4%" at low confidence where the chapter pattern is
40%. Ambiguous regulatory value → left for broker confirmation, listed in
docs/tariff/TARIFF_QUALITY_REPORT.md.

Usage:
    python3 scripts/tariff/salvage_spices.py            # apply
    python3 scripts/tariff/salvage_spices.py --dry-run  # report only
    python3 scripts/tariff/salvage_spices.py --show-parse
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DB_PATH = ROOT / "backend" / "data" / "tt_tariff_db_2024.json"
HS_REF_PATH = ROOT / "backend" / "data" / "hs2022_reference.json"

DUMP_CARRIER = "09101200"  # entry whose description holds the raw page TSV


def extract_words(tsv_dump: str) -> str:
    """Reduce an embedded Tesseract TSV stream back to its word sequence.

    The dump interleaves each word with its TSV numeric fields
    (level page block par line word x y w h conf). Pure-numeric tokens are
    dropped except HS-code-shaped ones (####.## / ###### / the '00' suffix).
    """
    words = []
    for t in tsv_dump.split():
        if re.fullmatch(r"-?\d+(\.\d+)?", t):
            if re.fullmatch(r"\d{4}\.\d{2}", t) or re.fullmatch(r"\d{6}", t) or t == "00":
                words.append(t)
            continue
        if re.fullmatch(r"\(?\d{4}\.\d{2}", t):
            words.append(t.lstrip("("))
            continue
        words.append(t)
    return " ".join(words)


# Rows as read from the reconstructed word stream (see --show-parse).
# (thn, description with parent context, dutyPct as printed, unit)
SALVAGED = [
    ("09061100", "Cinnamon and cinnamon-tree flowers - Neither crushed nor ground - Cinnamon (Cinnamomum zeylanicum Blume)", 40, "kg"),
    ("09061900", "Cinnamon and cinnamon-tree flowers - Neither crushed nor ground - Other", 40, "kg"),
    ("09062000", "Cinnamon and cinnamon-tree flowers - Crushed or ground", 40, "kg"),
    ("09071000", "Cloves (whole fruit, cloves and stems) - Neither crushed nor ground", 40, "kg"),
    ("09072000", "Cloves (whole fruit, cloves and stems) - Crushed or ground", 40, "kg"),
    ("09081100", "Nutmeg, mace and cardamoms - Nutmeg - Neither crushed nor ground", 40, "kg"),
    ("09081200", "Nutmeg, mace and cardamoms - Nutmeg - Crushed or ground", 40, "kg"),
    ("09082100", "Nutmeg, mace and cardamoms - Mace - Neither crushed nor ground", 40, "kg"),
    ("09082200", "Nutmeg, mace and cardamoms - Mace - Crushed or ground", 40, "kg"),
    ("09083100", "Nutmeg, mace and cardamoms - Cardamoms - Neither crushed nor ground", 0, "kg"),
    ("09083200", "Nutmeg, mace and cardamoms - Cardamoms - Crushed or ground", 0, "kg"),
    ("09092100", "Seeds of anise, badian, fennel, coriander, cumin or caraway; juniper berries - Seeds of coriander - Neither crushed nor ground", 0, "kg"),
    ("09092200", "Seeds of anise, badian, fennel, coriander, cumin or caraway; juniper berries - Seeds of coriander - Crushed or ground", 0, "kg"),
    ("09093100", "Seeds of anise, badian, fennel, coriander, cumin or caraway; juniper berries - Seeds of cumin - Neither crushed nor ground", 0, "kg"),
    ("09093200", "Seeds of anise, badian, fennel, coriander, cumin or caraway; juniper berries - Seeds of cumin - Crushed or ground", 0, "kg"),
    ("09096100", "Seeds of anise, badian, caraway or fennel; juniper berries - Neither crushed nor ground", 0, "kg"),
    ("09096200", "Seeds of anise, badian, caraway or fennel; juniper berries - Crushed or ground", 0, "kg"),
]

# The two carrier entries keep their extracted rates (10% / 40%) but get their
# official HS 2022 subheading text back in place of the 10KB TSV blob.
CARRIER_FIXES = {
    "09101200": "Ginger, saffron, turmeric (curcuma), thyme, bay leaves, curry and other spices - Ginger - Crushed or ground",
    "09102000": "Ginger, saffron, turmeric (curcuma), thyme, bay leaves, curry and other spices - Saffron",
}


def build_entry(thn: str, desc: str, duty: float, unit: str) -> dict:
    duty_label = "Free" if duty == 0 else f"{duty:g}%"
    return {
        "code": f"{thn[:4]}.{thn[4:6]}.{thn[6:]}",
        "description": desc,
        "dutyPct": duty,
        "vatPct": 12.5,
        "surchargePct": 0,
        "dutyRate": f"{duty_label} + 12.5% VAT",
        "notes": "Recovered from OCR TSV dump embedded in v3 spice-page entries; verify against CET 2024 LN 218",
        "thn": thn,
        "isExempt": duty == 0,
        "chapter": int(thn[:2]),
        "unit": unit,
        "flags": ["recovered_from_ocr_dump"],
        "needsReview": True,
    }


def main() -> int:
    dry = "--dry-run" in sys.argv
    db = json.load(open(DB_PATH))
    entries = db["entries"]
    by_thn = {e["thn"]: e for e in entries}

    if "--show-parse" in sys.argv:
        print(extract_words(by_thn[DUMP_CARRIER]["description"]))
        return 0

    hs_ref = json.load(open(HS_REF_PATH))["subheadings_6"]

    added, skipped = [], []
    for thn, desc, duty, unit in SALVAGED:
        if thn in by_thn:
            skipped.append((thn, "already present"))
            continue
        if thn[:6] not in hs_ref:
            skipped.append((thn, "6-digit prefix not in HS2022 — refusing to insert"))
            continue
        entries.append(build_entry(thn, desc, duty, unit))
        added.append(thn)

    repaired = []
    for thn, desc in CARRIER_FIXES.items():
        e = by_thn.get(thn)
        if e and len(e.get("description") or "") > 300:
            e["description"] = desc
            e.setdefault("flags", []).append("description_recovered")
            e["needsReview"] = True
            repaired.append(thn)

    entries.sort(key=lambda e: e["thn"])
    db["entry_count"] = len(entries)

    print(f"added {len(added)}: {added}")
    print(f"repaired carrier descriptions: {repaired}")
    for thn, why in skipped:
        print(f"skipped {thn}: {why}")

    if dry:
        print("(dry run — nothing written)")
        return 0
    json.dump(db, open(DB_PATH, "w"), indent=1)
    print(f"wrote {DB_PATH} ({len(entries)} entries)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
