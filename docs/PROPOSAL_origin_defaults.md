# Proposal: stop defaulting line country of origin to TT

Status: **proposed, not applied**. Under AGENTS.md this needs broker approval.

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
