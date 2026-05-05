# Stallion Phase 2 — Growth + Product Intelligence

Date: 2026-02-15 (UTC)
Owner: Christian / 28Keira

## Objective
Acquire first paying pilot customers while shipping OCR + HS-assist capabilities that reduce declaration prep time.

## Targets (30 days)
- 30 qualified outreach conversations
- 8 live product demos
- 3 pilot customers onboarded
- 1 paid conversion
- OCR-assisted intake reducing first-pass data-entry effort by >=30% on pilot samples

## ICP (Ideal Customer Profile)
1. Customs brokers (small/mid firms, 2–30 operators)
2. Freight forwarders handling own declaration prep
3. Import-heavy SMEs with in-house compliance teams

## Offer Positioning
"Stallion helps customs teams produce ASYCUDA-ready declaration packs faster with fewer manual errors."

Primary value claims:
- Worksheet-first workflow
- Pack generation (worksheet, SAD PDF, C82 XML, assessment, receipt)
- Validation guardrails to block bad submissions
- Upcoming OCR + HS suggestions for faster intake

## Pilot Offer (recommended)
- 14-day guided pilot
- Up to X declarations (define with lead)
- White-glove onboarding + direct support
- Pilot outcome report: time saved, error reduction, readiness score

## Outreach Engine

### Channel priority
1) Warm intros / existing network
2) WhatsApp + email direct outreach
3) LinkedIn founder-led outreach

### Message angles
- "Reduce declaration prep time"
- "Cut rework from missing/invalid fields"
- "Move from spreadsheet chaos to structured pack output"

### Cadence
- Day 1: Intro message
- Day 3: follow-up with short use-case
- Day 7: value recap + pilot invitation
- Day 12: close loop / last touch

## Scripts

### Initial outreach (short)
Hi {{name}}, we just released Stallion v1 for customs declaration teams. It helps operators produce ASYCUDA-ready packs faster and blocks submission errors before export. Open to a 15-minute walkthrough this week?

### Follow-up #1
Quick one, {{name}} — teams testing Stallion are using it to standardize worksheet + pack generation and reduce back-and-forth corrections. If useful, I can show a real flow in 15 minutes.

### Follow-up #2 (pilot ask)
If speed + accuracy are priorities this quarter, we can run a 14-day pilot with your team and give a before/after time + error report. Want details?

## Phase 2 Product Scope (OCR + HS)

### MVP scope
- Upload invoice/packing list docs (PDF/image)
- OCR extraction of key fields (supplier, invoice no, totals, item lines)
- HS suggestion service with confidence score
- Human review UI before write-back to worksheet

### Out of scope (for first cut)
- Full autonomous filing
- Multi-document reconciliation engine
- Customs decision automation

## Success Metrics
- Outreach response rate
- Demo-to-pilot conversion
- Pilot-to-paid conversion
- Avg prep time reduction per declaration
- Preflight error count trend over time

## Execution Queue (next 7 days)
1. Build lead list of first 50 targets (broker/forwarder/importer mix)
2. Prepare one-page pilot brief + demo script
3. Begin daily outreach cadence (10/day)
4. Start OCR ingestion endpoint + sample extraction schema
5. Add HS confidence + approval flow in UI

## Risks / Mitigation
- Low response rates -> tighten niche + stronger proof points
- Slow pilot onboarding -> use a 30-minute structured kickoff checklist
- OCR variability -> confidence threshold + manual override default

## Status Update — 2026-02-23

- Added competitive dataset analysis and launch kit assets (`stallion/data`, `stallion/launch-kit`).
- Completed ACE→SADDEC comparison and profile-based validation workflow in `workspace/inbox_drive`.
- Transformer pipeline validated end-to-end (dummy enrichment test pass); production run pending broker-provided real values.
- Next execution: replace dummy values, run final transform, validate, and package submission-ready XML.
