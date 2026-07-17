# Tariff DB Quality Pass — 2026-07-17

Scope: items 1–4 of the tariff remediation plan (analysis + non-destructive
fixes). Item 5 (VAT zero-rating schedule + specific-duty support) is
**pending broker sign-off** and intentionally not implemented.

## What was found (v3 DB, 5,810 entries)

| Problem | Count | Example |
|---|---|---|
| Raw Tesseract TSV dumps as descriptions | 76 (two at 10,475 chars) | `09101200`, `09102000` |
| Missing spice headings (OCR page failure) | 0906–0909 entirely absent | cinnamon, cloves, nutmeg |
| Phantom codes (6-digit prefix not in HS 2022) | 42 (40 excl. national ch 98/99) | `77283000`, `30111000`, `20411000` |
| Missing HS 2022 subheadings (no TT entry) | 710 | worst: ch84 (68), ch29 (49), ch85 (48) |
| Duty rates outside the attested CET set | 43 | `24039990` at **788%**, ch22 wine "58%" |
| Leading OCR junk in descriptions | 8+ | `_ | Dogfish…` |
| VAT uniformly 12.5% (no zero-rating) | all 5,810 | pending item 5 |

The "chapter 77" coverage claimed as a win in TARIFF_V3_REPORT.md is a
phantom entry — chapter 77 is reserved/empty in the HS.

## What was done

1. **HS 2022 reference** (`backend/data/hs2022_reference.json`): official
   6-digit nomenclature (5,613 subheadings) from the public WCO dataset.
   Used for phantom detection and description fallback.
2. **Spice salvage** (`scripts/tariff/salvage_spices.py`): re-parsed the
   Tesseract TSV accidentally embedded in the two ginger/saffron entries and
   recovered **17 missing codes** (0906–0909) with rates and units as
   printed in the CET. All flagged `recovered_from_ocr_dump` + needsReview.
   `09101100` was deliberately NOT added — its rate OCR-reads "4%" where the
   chapter pattern is 40%: **broker to confirm from the CET PDF.**
3. **Quarantine pass** (`scripts/tariff/quarantine.py`): replaced all 76
   dump descriptions with official HS 2022 text, stripped junk characters,
   flagged 43 nonstandard duty rates and 40 phantom codes with
   `needsReview` — **no rate was altered**. Machine report:
   `docs/tariff/quarantine_report.json`.
4. **TTBizLink merge** (`scripts/tariff/ttbizlink_merge.py`): aggregated the
   earlier Claude-chat scrape artifacts (363 unique 8-digit codes with
   official government wording, mojibake repaired). 275 entries gained an
   `officialDescription` (search now indexes it); 88 confirmed-real missing
   codes recorded in `docs/tariff/ttbizlink_missing_codes.json` — not
   inserted, because TTBizLink returns no duty rates.
5. **Search hardening** (`tariff_service.py`): quarantined entries score at
   half weight; official descriptions are searchable.
6. **CI gate** (`backend/tests/test_tariff_db.py`): 13 integrity tests —
   TSV-signature detection, rate whitelist, phantom-code check, critical
   broker THNs, salvaged codes — so a bad rebuild can never ship silently.

Result: **5,827 entries**, 0 corrupted descriptions, 175 flagged for broker
review, full suite 157 passed.

## Open work (in priority order)

1. **Broker confirmations** (needs the CET 2024 PDF or Arnim/Jason):
   - `09101100` ginger rate (OCR "4%", pattern says 40%).
   - The 43 flagged nonstandard rates — ch22/24 are specific duties ($/L)
     that the schema cannot yet represent (blocked on item 5 sign-off).
   - The 40 phantom codes: delete or correct each against the PDF.
2. **Rate lookup for the 88 TTBizLink-confirmed missing codes**
   (`ttbizlink_missing_codes.json`) — descriptions are official; rates must
   come from the CET PDF.
3. **Run the scaled harvester locally** (`scripts/tariff/ttbizlink_harvest.py`)
   — the government API is not reachable from the cloud sandbox (proxy 403).
   Run from an office machine, commit the JSONL, re-run the merge. The
   vocabulary derives from the DB's own descriptions, so coverage grows
   with each pass.
4. **Remaining 710 missing HS 2022 subheadings** — many are simply not in
   T&T's CET as separate national lines (legitimate), but ch84/85/29 gaps
   overlap with what brokers actually import. Cross-check against the PDF
   page ranges for those chapters, or wait for harvest coverage.
5. **Item 5 (after sign-off)**: VAT Schedule 2 zero-rating layer +
   `specificDuty` field for ch22/24, honoured by `courier_duty.py`.
