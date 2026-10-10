# Proposal: stop defaulting line country of origin to TT

Status: **approved and applied** (2026-10-10, by the project owner): no TT
origin fallback, and **CPC is chosen per line by the clerk or broker, whether
the line was extracted or not** (no 4000 default).

### What was applied
- New lines and extracted lines start with blank `cpc` and `country_of_origin`;
  extraction fills origin only when the document states it and never sets CPC.
- The pre-submission check lists blank CPC / origin as **blocking**, and
  `POST /sheets/{id}/xml` refuses (422) while any line lacks either.
- Verify shows a CPC and an origin picker on every line (table row and phone
  card), flagged "needed" until chosen; each records who chose it.
- Existing sheets keep their stored values. Where a stored CPC or origin was
  never chosen by a person or a document, the XML preflight warns
  ("never confirmed") rather than blocks.
- Worksheet XLSX shows the line's CPC as stored (blank if blank), not 4000.

- The 9898 rollup's consolidated household / personal effects lines take the
  CPC chosen on their source lines (approved 2026-10-10). Lines in one group
  that disagree block XML until a person picks one CPC for all of them.
- The 9898 rollup now applies **only to relieved entries** (`entry_mode:
  relieved` with `rollup_9898` on), approved 2026-10-10. Before this, the
  switch defaulted on for every sheet and the XML step checked nothing else,
  so a dutiable commercial import was consolidated into 9898 household /
  personal effects lines. Dutiable entries are now always itemised with their
  real HS codes. Verify shows the switch for relieved entries.

---

Original proposal follows.

## Finding

A Stallion sheet line gets a country of origin even when nobody gave one:

| Where | Code | Effect |
|---|---|---|
| `backend/app/services/sheet_service.py` `_blank_line()` | `"country_of_origin": "TT"` | Every line added by hand starts as Trinidad and Tobago origin. |
| `backend/app/routes/sheets.py` `extract_to_sheet` | `li.get("countryOfOrigin") or parsed.get("countryOfOrigin") or "TT"` | An invoice that doesn't state origin gives TT lines. |
| `backend/app/services/sheet_service.py` (single-line path, ~L605) | `rows[0].get("country_of_origin", "TT")` | Same fallback on the summary path. |
| `_blank_line()` | `"cpc": "4000"` | Every line starts on the CPC 4000 procedure. |

`preflight_warnings()` already flags a TT or blank origin, but only as a
warning: the XML still generates. FIXSPEC F6 lists silent country defaults as a
production bug. The pack path was fixed there; the Sheets path wasn't.

The new `field_sources` provenance (commit `ebd5deb`) shows which values are
defaults: an origin with no source entry was never confirmed by a document
or a person.

## Proposed change (for review)

```diff
--- a/backend/app/services/sheet_service.py
+++ b/backend/app/services/sheet_service.py
@@ def _blank_line()
-        "country_of_origin": "TT",
+        "country_of_origin": "",
--- a/backend/app/routes/sheets.py
+++ b/backend/app/routes/sheets.py
@@ def extract_to_sheet
-                "country_of_origin": li.get("countryOfOrigin") or parsed.get("countryOfOrigin") or "TT",
+                "country_of_origin": li.get("countryOfOrigin") or parsed.get("countryOfOrigin") or "",
@@
-            "country_of_origin": parsed.get("countryOfOrigin", "TT"),
+            "country_of_origin": parsed.get("countryOfOrigin") or "",
```

Plus one more: make a blank line origin a **blocking** pre-submission item
(`checklist_service.build_presubmission_report`, severity `critical`), so the
clerk has to choose it on Verify. The UI already deep-links to the field.

CPC `4000` is not in this diff. Whether 4000 is the right default for a
home-use C82 line is a broker call; if not, the same treatment applies.

## Expected difference

- **Duty, VAT, surcharge:** no change for any line whose origin is already
  set. Today's rates come from the HS code, not the origin (no preferential
  tariff is applied by origin in the Sheets engine). Please confirm this
  holds for CARICOM-origin goods.
- **XML:** lines with no stated origin would no longer carry `TT`. They would
  be blocked before generation instead.
- **Existing sheets:** unchanged. Stored lines keep their stored origin; only
  new lines and new extractions are affected.

## Decision needed

1. Approve dropping the TT fallback (blank and blocking instead)?
2. Keep CPC 4000 as the default for new lines, or blank it too?
