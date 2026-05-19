#!/usr/bin/env python3
"""
TTBizLink HS Tariff scraper — builds the Stallion Courier tariff database
from the official T&T government classification API.

Run this LOCALLY (it needs network access to app.ttbizlink.gov.tt, which is
firewalled inside the Claude container). It produces:

  - ttbizlink_raw.jsonl        one raw API response per line (audit trail)
  - tt_tariff_db_ttbizlink.json   the cleaned DB in Stallion's format
  - scrape_report.txt          coverage + anomaly report

Then upload tt_tariff_db_ttbizlink.json (and optionally the .jsonl) back to
the Claude session and I'll wire it into the app + rebuild the page.

Usage:
    pip install requests
    python ttbizlink_scraper.py             # full scrape (chapters 01-97)
    python ttbizlink_scraper.py --probe     # just dump one response & exit
    python ttbizlink_scraper.py --terms horse,clothing,handbag  # ad-hoc

Strategy
--------
The API is a search endpoint, not a dump endpoint, so we can't ask for
"all codes". We seed it with:
  1. every 2-digit chapter ("01".."97")
  2. every 4-digit heading we discover from chapter results
  3. a curated list of common courier terms (clothing, jewelry, ...) to
     catch national 8-digit lines the structural walk might miss
Records are de-duplicated by HS code. Be polite: 1s delay between calls.
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

# Common courier descriptions — ensures the national lines couriers actually
# ship (clothing, jewelry, etc.) are pulled even if the structural walk
# doesn't surface them.
COURIER_TERMS = [
    "clothing", "shirt", "trousers", "dress", "jacket", "underwear",
    "footwear", "shoes", "sandals", "boots", "handbag", "wallet",
    "backpack", "jewellery", "necklace", "earring", "bracelet", "ring",
    "watch", "perfume", "cosmetics", "lipstick", "shampoo", "lotion",
    "phone", "smartphone", "cellphone", "tablet", "laptop", "computer",
    "headphone", "earphone", "charger", "cable", "battery", "power bank",
    "toy", "doll", "game", "puzzle", "book", "magazine", "sticker",
    "vitamin", "supplement", "protein", "coffee", "tea", "seed",
    "rug", "carpet", "bedding", "towel", "curtain", "blanket",
    "furniture", "chair", "table", "lamp", "decoration", "ornament",
    "tool", "drill", "screwdriver", "tyre", "tire", "auto part",
    "pet food", "dog", "cat", "thread", "yarn", "fabric", "textile",
    "plastic", "glasses", "sunglasses", "umbrella", "bag",
    "hair", "wig", "nail", "eyelash", "makeup", "skincare",
    "knife", "scissors", "kitchen", "cup", "plate", "bottle",
    "candle", "soap", "detergent", "medicine", "bandage",
]


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


# ── Record extraction ────────────────────────────────────────────────────
# The exact field names aren't known until we see a live response, so the
# extractor is defensive: it looks for any of several plausible key names
# for code / description / duty / vat at every depth.

CODE_KEYS = ["hsCode", "hscode", "hs_code", "code", "tariffCode",
             "tariff_code", "nationalCode", "hsCodeFull", "fullCode"]
DESC_KEYS = ["description", "desc", "hsDescription", "hs_description",
             "shortDescription", "longDescription", "itemDescription",
             "fullDescription", "text", "label"]
DUTY_KEYS = ["dutyRate", "duty_rate", "duty", "importDuty",
             "customsDuty", "cet", "cetRate", "generalRate"]
VAT_KEYS = ["vat", "vatRate", "vat_rate", "valueAddedTax"]
OPT_KEYS = ["opt", "optRate", "onlinePurchaseTax", "purchaseTax"]
SUR_KEYS = ["surcharge", "surchargeRate", "customsSurcharge"]
RESTRICT_KEYS = ["restriction", "restrictions", "restricted", "permit",
                 "licence", "license", "prohibition", "controlled"]


def _first(d: dict, keys: list[str]):
    for k in keys:
        for actual in d:
            if actual.lower() == k.lower() and d[actual] not in (None, "", []):
                return d[actual]
    return None


def _looks_like_record(d: dict) -> bool:
    code = _first(d, CODE_KEYS)
    desc = _first(d, DESC_KEYS)
    return bool(code) and bool(desc)


def harvest(obj, out: list[dict]):
    if isinstance(obj, list):
        for x in obj:
            harvest(x, out)
    elif isinstance(obj, dict):
        if _looks_like_record(obj):
            out.append(obj)
        for v in obj.values():
            harvest(v, out)


def _num(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    m = re.search(r"-?\d+(?:\.\d+)?", str(v))
    return float(m.group()) if m else None


def normalize(rec: dict) -> dict | None:
    raw_code = str(_first(rec, CODE_KEYS) or "").strip()
    digits = re.sub(r"\D", "", raw_code)
    if len(digits) < 6:
        return None  # need at least a 6-digit subheading
    thn = digits[:8].ljust(8, "0") if len(digits) >= 8 else digits
    code_dotted = (
        f"{digits[:4]}.{digits[4:6]}.{digits[6:8]}"
        if len(digits) >= 8 else
        f"{digits[:4]}.{digits[4:6]}"
    )
    desc = str(_first(rec, DESC_KEYS) or "").strip()
    duty = _num(_first(rec, DUTY_KEYS))
    vat = _num(_first(rec, VAT_KEYS))
    opt = _num(_first(rec, OPT_KEYS))
    sur = _num(_first(rec, SUR_KEYS))
    restrict = _first(rec, RESTRICT_KEYS)
    return {
        "thn": thn,
        "code": code_dotted,
        "description": desc,
        "dutyPct": duty if duty is not None else 0,
        "vatPct": vat if vat is not None else 12.5,
        "optPct": opt if opt is not None else 0,
        "surchargePct": sur if sur is not None else 0,
        "restriction": (str(restrict).strip()
                        if restrict not in (None, "", False) else ""),
        "isExempt": (duty == 0) if duty is not None else False,
        "chapter": int(digits[:2]) if digits[:2].isdigit() else 0,
        "_raw_keys": sorted(rec.keys()),  # kept for first-run schema review
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="store_true",
                    help="dump one response (term=horse) and exit")
    ap.add_argument("--terms", default="",
                    help="comma-separated ad-hoc search terms")
    ap.add_argument("--delay", type=float, default=1.0)
    args = ap.parse_args()

    out_dir = Path(".")
    raw_path = out_dir / "ttbizlink_raw.jsonl"
    db_path = out_dir / "tt_tariff_db_ttbizlink.json"
    report_path = out_dir / "scrape_report.txt"

    if args.probe:
        data = search_hs("horse")
        Path("probe_horse.json").write_text(
            json.dumps(data, indent=2, ensure_ascii=False))
        print("Wrote probe_horse.json")
        print(json.dumps(data, indent=2)[:3000])
        return

    if args.terms:
        terms = [t.strip() for t in args.terms.split(",") if t.strip()]
    else:
        chapters = [str(i).zfill(2) for i in range(1, 98)]
        terms = chapters + COURIER_TERMS

    seen_codes: set[str] = set()
    records: list[dict] = []
    failures: list[str] = []
    schema_keys: set[str] = set()

    with raw_path.open("w", encoding="utf-8") as raw_f:
        for i, term in enumerate(terms, 1):
            print(f"[{i}/{len(terms)}] {term} ...", flush=True)
            try:
                data = search_hs(term)
                raw_f.write(json.dumps(
                    {"term": term, "response": data}, ensure_ascii=False) + "\n")
                hits: list[dict] = []
                harvest(data, hits)
                for h in hits:
                    norm = normalize(h)
                    if not norm:
                        continue
                    schema_keys.update(norm.pop("_raw_keys"))
                    if norm["thn"] in seen_codes:
                        continue
                    seen_codes.add(norm["thn"])
                    records.append(norm)
            except Exception as e:  # noqa: BLE001
                failures.append(f"{term}: {type(e).__name__} {e}")
                print(f"   FAILED: {e}")
            time.sleep(args.delay)

    records.sort(key=lambda r: r["thn"])
    db = {
        "version": "ttbizlink-2026",
        "source": "TTBizLink SmartHS API (app.ttbizlink.gov.tt)",
        "scraped_terms": len(terms),
        "entry_count": len(records),
        "entries": records,
    }
    db_path.write_text(json.dumps(db, indent=2, ensure_ascii=False))

    chapters_seen = sorted({r["chapter"] for r in records})
    with report_path.open("w") as rf:
        rf.write(f"TTBizLink scrape report\n")
        rf.write(f"Terms searched : {len(terms)}\n")
        rf.write(f"Unique codes   : {len(records)}\n")
        rf.write(f"Chapters seen  : {chapters_seen}\n")
        rf.write(f"Missing chap.  : "
                 f"{sorted(set(range(1, 98)) - set(chapters_seen))}\n")
        rf.write(f"Field keys obs : {sorted(schema_keys)}\n")
        rf.write(f"Failures ({len(failures)}):\n")
        for f in failures:
            rf.write(f"  {f}\n")

    print(f"\nDone. {len(records)} unique codes → {db_path}")
    print(f"Schema keys observed: {sorted(schema_keys)}")
    print(f"Report: {report_path}")
    print("\nUpload tt_tariff_db_ttbizlink.json back to the Claude session.")


if __name__ == "__main__":
    main()
