#!/usr/bin/env python3
"""Scaled TTBizLink SmartHS harvester — run from a machine with access to
app.ttbizlink.gov.tt (the government portal is not reachable from the cloud
sandbox; run this locally, then commit the JSONL and run ttbizlink_merge.py).

Strategy: the chapter endpoint returns 400 (see scrape_report.txt from the
first attempt), but term search works (proven by ttbizlink_term_scrape/,
31/31 terms OK). So we drive term search with a large vocabulary derived
from the tariff DB's own descriptions plus a broker/product word list, and
let the merge step aggregate every 8-digit code the API returns.

Resumable: already-harvested terms in the output JSONL are skipped, so the
script can be re-run any time with a bigger vocabulary.

Usage:
    python3 scripts/tariff/ttbizlink_harvest.py                 # full vocab
    python3 scripts/tariff/ttbizlink_harvest.py --limit 200     # first N terms
    python3 scripts/tariff/ttbizlink_harvest.py --terms "nutmeg,ginger"
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from collections import Counter
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent.parent
DB_PATH = ROOT / "backend" / "data" / "tt_tariff_db_2024.json"
OUT_PATH = ROOT / "ttbizlink_raw.jsonl"

API = "https://app.ttbizlink.gov.tt/gsd/api/getSmartHcdata"
DELAY_S = 1.5  # be polite to the government API

STOPWORDS = {
    "other", "than", "with", "without", "whether", "not", "the", "and", "for",
    "from", "their", "more", "less", "used", "kind", "similar", "containing",
    "excluding", "including", "parts", "those", "into", "which", "having",
}


def vocabulary(limit: int | None) -> list[str]:
    """Distinct product words from the tariff DB's own descriptions,
    most-frequent first — these are exactly the words brokers search."""
    db = json.load(open(DB_PATH))
    counts: Counter = Counter()
    for e in db["entries"]:
        text = f"{e.get('description') or ''} {e.get('officialDescription') or ''}"
        for w in re.findall(r"[a-zA-Z][a-zA-Z-]{3,}", text.lower()):
            if w not in STOPWORDS:
                counts[w] += 1
    vocab = [w for w, _ in counts.most_common()]
    return vocab[:limit] if limit else vocab


def already_harvested() -> set[str]:
    done = set()
    if OUT_PATH.exists():
        for line in open(OUT_PATH):
            try:
                done.add(json.loads(line)["term"])
            except (json.JSONDecodeError, KeyError):
                continue
    return done


def harvest(terms: list[str]) -> None:
    done = already_harvested()
    todo = [t for t in terms if t not in done]
    print(f"{len(terms)} terms, {len(done)} already harvested, {len(todo)} to go")

    ok = fail = 0
    with httpx.Client(timeout=30) as client, open(OUT_PATH, "a") as out:
        for i, term in enumerate(todo, 1):
            payload = {
                "searchType": "auto", "searchText": term, "targetCountry": "TT",
                "classificationType": "Import", "inputLanguage": "en",
                "imageURL": None,
            }
            try:
                r = client.post(API, json=payload)
                r.raise_for_status()
                out.write(json.dumps({"term": term, "response": r.text}) + "\n")
                out.flush()
                ok += 1
            except httpx.HTTPError as ex:
                print(f"  {term}: {ex}")
                fail += 1
                if fail > 20 and ok == 0:
                    print("API appears unreachable/blocked — aborting.")
                    break
            if i % 25 == 0:
                print(f"  {i}/{len(todo)} (ok={ok} fail={fail})")
            time.sleep(DELAY_S)
    print(f"done: ok={ok} fail={fail}. Next: python3 scripts/tariff/ttbizlink_merge.py")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--terms", type=str, default=None,
                    help="comma-separated explicit terms instead of DB vocabulary")
    args = ap.parse_args()

    terms = ([t.strip() for t in args.terms.split(",") if t.strip()]
             if args.terms else vocabulary(args.limit))
    harvest(terms)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
