#!/usr/bin/env python3
"""
ttbizlink_scraper.py — v2, built from the REAL API response structure.

What we learned from the first run:
  - The response is a JSON *string* (sometimes double-encoded) -> json.loads
    it, then again if still a str.
  - Shape: {"results": [ {hsCode, hsDescription, type, indent, children:[...]} ]}
    a hierarchy tree. Leaves with type=="dutiable" and an 8-digit hsCode are
    the real tariff lines. Full description = the parent chain joined.
  - Bare 2-digit chapter searches ("01") return HTTP 400 - the API wants
    real words OR code-like strings of 4+ digits.
  - The API has NO duty rates - it's a classification tree only. Rates stay
    sourced from the existing DB (which matched the broker references).

Strategy: walk every 4-digit HS heading present in T&T's tariff (~1,163,
derived from the current DB) so we get near-complete hierarchical
descriptions. ~20 min at the polite 1s delay.

Run LOCALLY (TTBizLink is firewalled in the Claude container):

    pip install requests
    python ttbizlink_scraper.py --probe
    # generate the heading seed list:
    python -c "import json;d=json.load(open('backend/data/tt_tariff_db_2024.json'));\
print(chr(10).join(sorted({e['thn'][:4] for e in d['entries']})))" > heading_seeds.txt
    python ttbizlink_scraper.py --headings heading_seeds.txt

Then upload tt_tariff_db_ttbizlink.json back to the Claude session.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    sys.exit("pip install requests first")

URL = "https://app.ttbizlink.gov.tt/gsd/api/getSmartHcdata"
HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "Origin": "https://app.ttbizlink.gov.tt",
    "Referer": "https://app.ttbizlink.gov.tt/smarths/",
    "User-Agent": "Mozilla/5.0",
}


def search_hs(term: str, timeout: int = 30) -> dict:
    payload = {
        "searchType": "auto",
        "searchText": term,
        "targetCountry": "TT",
        "classificationType": "Import",
        "inputLanguage": "en",
    }
    r = requests.post(URL, headers=HEADERS, json=payload, timeout=timeout)
    r.raise_for_status()
    return r.json()


def deep_parse(raw) -> dict:
    """Response arrives as a JSON string, occasionally double-encoded."""
    d = raw
    for _ in range(3):
        if isinstance(d, str):
            d = json.loads(d)
        else:
            break
    return d if isinstance(d, dict) else {}


def _clean(seg: str) -> str:
    return re.sub(r"^[-\u2013\s]+", "", (seg or "")).strip()


def walk(node, trail, out: dict):
    """Collect 8-digit dutiable leaves with full parent-chain descriptions."""
    if isinstance(node, list):
        for n in node:
            walk(n, trail, out)
        return
    if not isinstance(node, dict):
        return
    code = (node.get("hsCode") or "").strip()
    desc = _clean(node.get("hsDescription") or "")
    new_trail = trail + ([desc] if desc else [])
    if node.get("type") == "dutiable" and re.fullmatch(r"\d{8}", code):
        parts = [p for p in new_trail if p and p not in ("-", "--", "---")]
        out[code] = {
            "thn": code,
            "code": f"{code[:4]}.{code[4:6]}.{code[6:]}",
            "description": " - ".join(parts),
            "leaf": _clean(node.get("hsDescription") or ""),
            "chapter": int(code[:2]),
            "uom": node.get("uom") or [],
        }
    for ch in node.get("children", []) or []:
        walk(ch, new_trail, out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="store_true")
    ap.add_argument("--headings", help="file: one 4-digit HS heading per line")
    ap.add_argument("--terms", default="", help="comma-separated ad-hoc terms")
    ap.add_argument("--delay", type=float, default=1.0)
    args = ap.parse_args()

    if args.probe:
        data = deep_parse(search_hs("horse"))
        Path("probe_horse_parsed.json").write_text(
            json.dumps(data, indent=2, ensure_ascii=False))
        recs: dict = {}
        walk(data.get("results", []), [], recs)
        print(f"Parsed OK. Sample leaves: {len(recs)}")
        for r in list(recs.values())[:5]:
            print(f"  {r['thn']}: {r['description'][:80]}")
        return

    if args.headings:
        seeds = [s.strip() for s in
                 Path(args.headings).read_text().splitlines() if s.strip()]
    elif args.terms:
        seeds = [t.strip() for t in args.terms.split(",") if t.strip()]
    else:
        ap.error("pass --headings <file> or --terms <list> or --probe")

    all_recs: dict = {}
    failures = []
    with open("ttbizlink_raw.jsonl", "w", encoding="utf-8") as raw_f:
        for i, seed in enumerate(seeds, 1):
            print(f"[{i}/{len(seeds)}] {seed} -> {len(all_recs)} codes",
                  flush=True)
            try:
                data = deep_parse(search_hs(seed))
                raw_f.write(json.dumps(
                    {"seed": seed,
                     "n_results": len(data.get("results", []))}) + "\n")
                walk(data.get("results", []), [], all_recs)
            except Exception as e:  # noqa: BLE001
                failures.append(f"{seed}: {type(e).__name__} {e}")
            time.sleep(args.delay)

    records = sorted(all_recs.values(), key=lambda r: r["thn"])
    db = {
        "version": "ttbizlink-2026-v2",
        "source": "TTBizLink SmartHS API - heading walk",
        "entry_count": len(records),
        "entries": records,
    }
    Path("tt_tariff_db_ttbizlink.json").write_text(
        json.dumps(db, indent=2, ensure_ascii=False))
    Path("scrape_report.txt").write_text(
        f"Seeds: {len(seeds)}\nCodes: {len(records)}\n"
        f"Chapters: {sorted({r['chapter'] for r in records})}\n"
        f"Failures ({len(failures)}):\n" + "\n".join(failures))
    print(f"\nDone. {len(records)} codes -> tt_tariff_db_ttbizlink.json")
    print("Upload that file back to the Claude session.")


if __name__ == "__main__":
    main()
