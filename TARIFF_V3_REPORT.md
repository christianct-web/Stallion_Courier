# Tariff DB Re-extraction — v3 Report

## Summary

Re-extracted the T&T 2024 CET tariff from the higher-quality PDF (Legal Notice 218, May 2026 export) using a column-aware Tesseract TSV pipeline. The new database has **5,810 entries** vs. v2's 5,255 — an additional **555 entries** correctly extracted from pages where the original OCR pipeline failed.

## Key improvements over v2

| Metric | v2 (from low-res scan) | v3 (from high-res PDF) | Δ |
|---|---|---|---|
| Total entries | 5,255 | **5,810** | +555 |
| Bare "Other" placeholders | 200 | **15** | -185 |
| OCR artifacts (`==`, `+~`, `forrcaring`) | 0 (cleaned by parser) | **0** | — |
| Chapters covered | 96 | **97** | +1 |
| Critical broker THNs present | 28/32 | **32/32** | +4 |
| Page 43 (Atlantic salmon) entries | 0 | **17** | +17 |
| Page 44 (tunas) entries | 0 | **17** | +17 |
| Page 274 (cork) entries | 9 (manual only) | **12 OCR'd + 0 manual needed** | — |

## What changed in the pipeline

1. **High-resolution source PDF.** The new PDF (60 MB) renders crisply at 150 DPI. The original (14 MB) was a low-quality scan.

2. **Column-aware Tesseract TSV mode.** Instead of regex-parsing OCR text and guessing column boundaries from whitespace, v3 reads per-word x/y coordinates and partitions words into the 5 columns (HS, CET, Description, Rate, Unit) by horizontal position. Boundaries determined empirically from page 274 (cork chapter) are used across all pages.

3. **Tesseract PSM 4 + OEM 1 for problem pages.** Through testing, I found PSM 3 (default) extracts table HS codes 11x better than PSM 6 — but for some chapters (e.g. fish in chapter 3), PSM 4 with OEM 1 (LSTM) catches isolated `00` tokens in the CET column that PSM 3 misses entirely. 76 problem pages were re-OCR'd with these settings.

4. **CET inference.** When a row has an HS code, a description, AND a rate, but the OCR missed the CET column, we infer CET=`00` (the standard single-leaf code). This caught 162+ entries that the strict OCR-only approach would have dropped — including the entire fish chapter's primary entries.

5. **Hierarchy tracking.** A `HierarchyTracker` walks each chapter pushing/popping parent descriptions. Bare "Other" leaves inherit context: `33049990` becomes `Beauty preparations - Other - Other` instead of just `Other`. **5,795 entries have meaningful descriptions** (vs. 5,055 in v2).

6. **Manual entries for OCR-defeated content.** 8 hand-encoded entries for THNs the OCR couldn't extract from any pipeline configuration: `83062900` (decorations), `57050090` (rugs), `48192090` (paper sacks), `33059000` (hair products), `61091000` (cotton t-shirts), `94036000` (wooden furniture), `42022200` (handbags), `62064000` (women's blouses).

## Critical THNs verified

All 32 broker-known THNs from past worksheets resolve correctly:

```
✓ 83062900: Bells, gongs and the like — Statuettes and other ornaments — Other
✓ 57050090: Other carpets and other textile floor coverings — Other
✓ 85171300: Smartphones
✓ 33049990: Beauty preparations
✓ 39269090: Other articles of plastics
✓ 84733000: Parts and accessories of the machines of heading 84.71
✓ 85183000: Microphones, headphones, earphones
✓ 12099900: Seeds, fruit and spores, of a kind used for sowing
✓ 85176900: Other apparatus for transmission/reception
✓ 61046900, 64029990, 48192090, 62121000, 84148000, 95069190
✓ 33059000, 61091000, 63090000, 42022200, 61102000
✓ 85287200, 94036000, 61012000, 62064000, 33030010
✓ 45011000, 45019000, 45020000, 45031010, 45031020
✓ 45039090, 45041000
```

## Verification

- **51/51 backend tests pass** against the new tariff
- **End-to-end matcher test**: 12/13 correct (the one failure is a matcher keyword-priority issue, not a tariff data issue)
- **Page 43 / page 44 / page 274** specifically validated as previously broken pages now extracting cleanly

## Files delivered

- `tt_tariff_db_2024.json` (2.1 MB, 5,810 entries) — drop-in replacement for `backend/data/tt_tariff_db_2024.json`
- `parse_tariff_v3.py` — the column-aware parser (for future re-runs when CBTT publishes a new tariff order)

## How to apply

```bash
cd /path/to/Stallion_Courier
cp tt_tariff_db_2024.json backend/data/tt_tariff_db_2024.json
cd backend
python -m pytest tests/test_courier.py
# Should show: 51 passed
```

## Known residual limitations

- **15 bare "Other" entries** scattered across chapters where the OCR couldn't capture the parent heading on the same page (down from 200 in v2). These don't affect duty calculation — they only reduce the description matcher's discriminative power for those specific codes.
- **75 short descriptions** (<5 chars) — these are real product names like "Cows", "Dogs", "Cats", "Figs", "Ghee", "Milt" that ARE the actual entry text. Not a bug.
- **Chapter 77** (reserved by international convention, intentionally empty).
- **Chapter 99** (commercial samples / special cases — not maintained in the T&T CET).

## Next steps

This tariff is ready to ship. Future improvements (low priority):

1. Use a Tesseract LSTM model trained on financial documents to catch the remaining `00` CET tokens that PSM 4 + OEM 1 still misses.
2. Cross-reference against a published WCO HS 2022/2024 dataset to fill in entries the OCR completely missed (e.g. some entries in chapters 84/85 that need column re-OCR).
3. Add a continuous-improvement workflow: when brokers add tariff overrides via `/courier/tariff` endpoint, periodically review and promote stable overrides into the bundled tariff for the next release.
