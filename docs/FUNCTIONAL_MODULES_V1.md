# Stallion Functional Modules v1

## 1) Intake Service
**Purpose:** accept invoices/docs and establish declaration record.

Functions:
- file ingest (pdf/image/xml)
- checksum + duplicate detection
- document quality checks
- record initialization in `Draft`

## 2) Extraction Service
**Purpose:** structure invoice lines and header fields.

Functions:
- OCR/parser pipeline abstraction
- confidence scoring per extracted field
- extraction status + retry handling
- transition to `Extracted`

## 3) Mapping Service
**Purpose:** map extracted/ACE fields to SADDEC model.

Functions:
- profile-aware mapping (`general`, `vehicle`)
- mandatory field registry
- mapping diff view
- transition to `Mapped`

## 4) Validation Service
**Purpose:** deterministic compliance checks before export.

Functions:
- rules engine with severity (`blocker/warning/info`)
- profile checks and required fields checks
- validation snapshot + hash
- transition to `Validated` or `Exception`

## 5) Remediation Service
**Purpose:** fix blockers quickly with guidance.

Functions:
- explain-fix payload generation
- missing-field wizard
- assignment hints (`Operator` vs `Reviewer`)
- transition from `Exception` back to `Mapped`/`Validated`

## 6) Export Service
**Purpose:** generate submission-ready bundle safely.

Functions:
- XML generation
- schema/profile validation
- artifact bundle creation (xml + report + hash)
- transition to `Exported`

## 7) Submission Tracker
**Purpose:** capture handoff/submission completion.

Functions:
- manual submission confirmation flow
- external callback integration point
- transition to `Submitted`

## 8) Audit Service
**Purpose:** immutable trace for compliance and QA.

Functions:
- event logging (who/what/when)
- mandatory-field change history
- export/submission audit record
- archive controls

---

## Workbench UX Requirements (v1)
- Labeled action bar: Upload / Extract / Validate / Resolve / Export
- Submission Readiness panel (completion %, blockers, warnings, profile)
- Explain-Fix drawer linked to exact field paths
- Sticky validation state indicator (fresh/stale)
- Export gate with explicit blocker reasons
