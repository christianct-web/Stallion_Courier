"""Tariff DB integrity gate — keeps OCR regressions out of the bundled tariff.

These tests encode the invariants established by the 2026-07 tariff quality
pass (scripts/tariff/quarantine.py + salvage_spices.py). Any future rebuild
of tt_tariff_db_2024.json must satisfy them or be quarantined first.
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

import pytest

DATA = Path(__file__).resolve().parent.parent / "data"

# Rates the CET DB attests at scale; anything else must carry needsReview.
DUTY_WHITELIST = {0, 5, 10, 15, 20, 25, 30, 40}
TSV_SIGNATURE = re.compile(r"(?:-?\d+\s+){6,}\d+\.\d{4,}")


@pytest.fixture(scope="module")
def db():
    return json.load(open(DATA / "tt_tariff_db_2024.json"))


@pytest.fixture(scope="module")
def entries(db):
    return db["entries"]


@pytest.fixture(scope="module")
def hs6():
    return json.load(open(DATA / "hs2022_reference.json"))["subheadings_6"]


def test_entry_count_matches_meta(db, entries):
    assert db["entry_count"] == len(entries)


def test_thns_are_unique_8_digit(entries):
    thns = [e["thn"] for e in entries]
    assert all(re.fullmatch(r"\d{8}", t) for t in thns)
    dupes = [t for t, c in Counter(thns).items() if c > 1]
    assert not dupes, f"duplicate THNs: {dupes[:10]}"


def test_no_raw_ocr_tsv_dumps_in_descriptions(entries):
    dumps = [e["thn"] for e in entries
             if TSV_SIGNATURE.search(e.get("description") or "")]
    assert not dumps, f"raw Tesseract TSV in descriptions: {dumps[:10]}"


def test_no_oversized_descriptions(entries):
    # Genuine official wording can run long (e.g. 03055400's species
    # enumeration is ~700 chars); OCR TSV dumps were 10,000+. The TSV
    # signature test above is the corruption gate — this is a sanity cap.
    huge = [e["thn"] for e in entries if len(e.get("description") or "") > 1000]
    assert not huge, f"descriptions >1000 chars: {huge[:10]}"


def test_no_empty_descriptions(entries):
    empty = [e["thn"] for e in entries if not (e.get("description") or "").strip()]
    assert not empty, f"empty descriptions: {empty[:10]}"


def test_no_leading_junk_characters(entries):
    junk = [e["thn"] for e in entries
            if re.match(r"^[\s_|~=—.\\-]+[A-Za-z(]", e.get("description") or "")]
    assert not junk, f"leading OCR junk: {junk[:10]}"


def test_unflagged_duty_rates_are_whitelisted(entries):
    bad = [
        (e["thn"], e["dutyPct"]) for e in entries
        if e.get("dutyPct") is not None
        and float(e["dutyPct"]) not in DUTY_WHITELIST
        and "nonstandard_duty_rate" not in (e.get("flags") or [])
    ]
    assert not bad, f"nonstandard duty rate without quarantine flag: {bad[:10]}"


def test_unflagged_codes_exist_in_hs2022(entries, hs6):
    phantoms = [
        e["thn"] for e in entries
        if int(e["thn"][:2]) < 98
        and e["thn"][:6] not in hs6
        and "code_not_in_hs2022" not in (e.get("flags") or [])
    ]
    assert not phantoms, f"phantom codes without quarantine flag: {phantoms[:10]}"


def test_flagged_entries_carry_needs_review(entries):
    missing = [e["thn"] for e in entries if e.get("flags") and not e.get("needsReview")]
    assert not missing, f"flagged but not needsReview: {missing[:10]}"


def test_salvaged_spice_headings_present(entries):
    thns = {e["thn"] for e in entries}
    for thn in ("09061100", "09062000", "09071000", "09081100",
                "09083100", "09092100", "09093100", "09096100"):
        assert thn in thns, f"salvaged spice code {thn} missing"


def test_critical_broker_thns_present(entries):
    # The 32 THNs from historical broker worksheets (TARIFF_V3_REPORT.md)
    thns = {e["thn"] for e in entries}
    critical = [
        "83062900", "57050090", "85171300", "33049990", "39269090",
        "84733000", "85183000", "12099900", "85176900", "61046900",
        "64029990", "48192090", "62121000", "84148000", "95069190",
        "33059000", "61091000", "63090000", "42022200", "61102000",
        "85287200", "94036000", "61012000", "62064000", "33030010",
        "45011000", "45019000", "45020000", "45031010", "45031020",
        "45039090", "45041000",
    ]
    missing = [t for t in critical if t not in thns]
    assert not missing, f"critical broker THNs missing: {missing}"


def test_vat_values_sane(entries):
    # Until the zero-rating schedule lands (broker sign-off pending), VAT is
    # uniformly 12.5 — but never null/negative/other.
    bad = [e["thn"] for e in entries if e.get("vatPct") not in (12.5, 0)]
    assert not bad, f"unexpected vatPct values: {bad[:10]}"
