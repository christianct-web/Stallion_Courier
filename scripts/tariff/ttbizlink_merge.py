#!/usr/bin/env python3
"""Merge TTBizLink SmartHS scrape results into the tariff DB (non-destructive).

Sources (all committed artifacts of earlier scrape sessions, plus any new
raw files dropped by ttbizlink_harvest.py):
    ttbizlink_term_scrape/raw_*.json
    ttbizlink_adaptive_scrape/raw_*.json
    ttbizlink_raw.jsonl

What it does:
  * Aggregates every 8-digit code + official description returned by the
    government SmartHS API (with mojibake repair — the scrapes were saved
    with a latin-1/utf-8 mix-up).
  * For THNs already in the tariff DB: stores the government wording as
    `officialDescription` (search indexes it; the OCR description is kept).
    If the entry's description was OCR-quarantined, the official wording
    replaces it outright.
  * For THNs NOT in the DB: writes them to
    docs/tariff/ttbizlink_missing_codes.json as confirmed-real missing
    codes. They are NOT inserted — TTBizLink returns no duty rates, and
    rates must come from the CET or the broker (see AGENTS.md).

Usage:
    python3 scripts/tariff/ttbizlink_merge.py [--dry-run]
"""
from __future__ import annotations

import glob
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DB_PATH = ROOT / "backend" / "data" / "tt_tariff_db_2024.json"
MISSING_PATH = ROOT / "docs" / "tariff" / "ttbizlink_missing_codes.json"

RAW_GLOBS = [
    str(ROOT / "ttbizlink_term_scrape" / "raw_*.json"),
    str(ROOT / "ttbizlink_adaptive_scrape" / "raw_*.json"),
]
RAW_JSONL = ROOT / "ttbizlink_raw.jsonl"


def demojibake(s: str) -> str:
    """Repair utf-8 text that was decoded as latin-1 (â€™ → ’ etc.)."""
    if "â" in s or "Ã" in s:
        try:
            return s.encode("latin-1").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            return s
    return s


def _walk(node, out: dict) -> None:
    if isinstance(node, dict):
        hs = str(node.get("hsCode") or "")
        desc = node.get("hsDescription")
        if re.fullmatch(r"\d{8}", hs) and desc:
            out[hs] = demojibake(desc.strip().lstrip("- ").strip())
        for v in node.values():
            _walk(v, out)
    elif isinstance(node, list):
        for v in node:
            _walk(v, out)


def collect() -> dict:
    codes: dict = {}
    for pattern in RAW_GLOBS:
        for f in glob.glob(pattern):
            try:
                _walk(json.load(open(f)), codes)
            except (json.JSONDecodeError, OSError) as ex:
                print(f"skip {f}: {ex}")
    if RAW_JSONL.exists():
        for line in open(RAW_JSONL):
            try:
                rec = json.loads(line)
                resp = rec.get("response")
                _walk(json.loads(resp) if isinstance(resp, str) else resp, codes)
            except (json.JSONDecodeError, TypeError):
                continue
    return codes


def main() -> int:
    dry = "--dry-run" in sys.argv
    codes = collect()
    print(f"aggregated {len(codes)} unique 8-digit codes from scrape artifacts")

    db = json.load(open(DB_PATH))
    by_thn = {e["thn"]: e for e in db["entries"]}

    enriched, replaced = 0, 0
    for thn, official in codes.items():
        e = by_thn.get(thn)
        if e is None:
            continue
        if e.get("officialDescription") != official:
            e["officialDescription"] = official
            enriched += 1
        # Replace quarantined descriptions only when the official wording is
        # actually more informative than the current fallback — TTBizLink
        # returns bare "Other" for some leaves, which must not overwrite the
        # HS 2022 parent-context text quarantine put there.
        if "ocr_dump_description" in (e.get("flags") or []):
            current = e.get("description") or ""
            if official.lower().strip(" -") != "other" and len(official) >= len(current):
                e["description"] = official
                replaced += 1

    missing = sorted(set(codes) - set(by_thn))
    missing_out = {
        "source": "TTBizLink SmartHS API (app.ttbizlink.gov.tt) scrape artifacts",
        "note": ("Confirmed-real codes absent from tt_tariff_db_2024.json. NOT "
                 "auto-inserted: TTBizLink provides no duty rates — rates must be "
                 "taken from the CET 2024 PDF or confirmed by a broker."),
        "count": len(missing),
        "codes": {c: codes[c] for c in missing},
    }

    print(f"officialDescription set/updated: {enriched}")
    print(f"quarantined descriptions replaced with official text: {replaced}")
    print(f"missing-from-DB codes recorded: {len(missing)}")

    if dry:
        print("(dry run — nothing written)")
        return 0
    MISSING_PATH.parent.mkdir(parents=True, exist_ok=True)
    json.dump(missing_out, open(MISSING_PATH, "w"), indent=1, ensure_ascii=False)
    json.dump(db, open(DB_PATH, "w"), indent=1)
    print(f"wrote {DB_PATH} and {MISSING_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
