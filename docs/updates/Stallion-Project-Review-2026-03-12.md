STALLION 8 — V1

PROJECT REVIEW & STRATEGIC ASSESSMENT

Prepared for Mana Labs 8

March 2026

Based on full conversation review: architecture, backend, frontend,

broker sessions, ASYCUDA validation, UPSL engagement, and deployment.

01  Executive Summary

Stallion is a customs declaration workspace that generates ASYCUDA-compatible C82 SAD XML and duty worksheets from structured or extracted document data. It targets licensed customs brokers and freight operations in Trinidad and Tobago, starting with Universal Package Systems Limited (UPSL) as the first commercial client.

The project has reached a significant milestone: ASYCUDA accepted a Stallion-generated XML file after a series of structural hotfixes. The backend generates both the XML and the LB01 worksheet PDF. The frontend has a complete declaration workbench, a broker review interface, and a home page with operational context.

However, the conversation reveals several unresolved architectural issues, missing features, and integration gaps that need attention before Stallion is production-ready for UPSL. This review covers all of them.

02  What Works Well

Core Engine — Validated

The XML generation pipeline is the heart of Stallion and it works. ASYCUDA accepted the output after the structural hotfix session. The key fixes — root element ordering, null stubs, HS code splitting into Commodity_code + Precision, Gs_* valuation blocks, item_* lowercase naming, and exact stub counts — were all identified from a real broker-provided reference XML and applied successfully. This is no longer theoretical.

Worksheet Calculation — Correct

The worksheet service calculates CIF, duty, surcharge, and VAT correctly. The math was verified against a real filed C82 (HECA Medical Technologies, Assessment A 356). The LB01 PDF generation was rebuilt to match the broker's reference format, including running totals, dual CES lines, and the FACTOR computation. The formula chain (EX-WORKS + INLAND = FOB, FOB + freight + insurance = CIF, CIF * rate = local CIF, then duties cascade) is implemented correctly.

QA Tooling — Mature

Two diagnostic scripts exist: compare_xml.py (structural diff against ACE spec) and test_pack.py (end-to-end smoke test). The fact that these were written before the first broker test shows disciplined engineering. The preflight validation layer in the backend blocks bad declarations before they generate, which is production-quality behaviour.

Broker Session — Real Feedback Captured

A live session with a licensed customs agent produced concrete design decisions: 5-tab form layout confirmed, HS Code + Description identified as the primary manual verification fields, exchange rate source confirmed as CBTT by shipped-on-board date, vessel name identified as a common error field, and the physical sign-off workflow documented. This broker input directly shaped BrokerReview4.

Design System — Coherent

The Fraunces + JetBrains Mono typography system, the dark void / warm paper split-pane concept, and the CSS variable token system are consistent across BrokerReview4 and the workbench. The self-critique-and-rebuild cycle produced a measurably better interface. The contrast and font-size fixes (all sub-11px text bumped up, all low-contrast tokens darkened) were the right call.

03  What Needs Attention

3.1  Two Declaration Systems Running in Parallel

Status: CRITICAL — blocks demo coherence

The conversation identified this but it was never fully resolved. DeclarationEditor uses a zustand store with localStorage. StallionWorkbench + BrokerReview4 use the backend JSON file via the API. A declaration created in one system is invisible to the other. The home page reads from the store (localStorage), not the backend. Fixes were proposed and files were generated, but confirmation that the merge was deployed and working is absent from the conversation.

Recommendation: Retire DeclarationEditor entirely for Phase 1. Everything flows through the backend. Home page reads from /declarations API. Confirm this is deployed.

3.2  Frontend Dev Process Instability

Status: HIGH — affects demo reliability

The OpenClaw status reports mention repeated SIGKILL on the frontend dev process. The backend is stable under PM2 (22h+ uptime reported), but the frontend dev server is unreliable. For any demo or broker session, this must not be running in dev mode. A production build served via PM2 or nginx eliminates this entirely.

3.3  HS Code Preflight Bug

Status: CRITICAL — Generate Pack fails on all valid declarations

The preflight validator checks hs.isdigit() but HS codes are stored with dots (9021.29.00.00). This returns False, blocking every declaration from generating. The fix is a one-liner (strip dots before checking), but as of the last conversation checkpoint, confirmation that this was deployed is missing. If this bug is still live, the UPSL demo cannot proceed.

3.4  LB01 FOB Value Always Shows Zero

Status: HIGH — worksheet PDF shows wrong numbers

pack_service.py reads worksheet.get('fob_foreign') but the calculate endpoint returns invoice_value_foreign. Different key names for the same value. The fix was written but deployment confirmation is missing.

3.5  CBTT Rate Lookup Not Wired

Status: MEDIUM — functional but uses placeholder

Both the workbench and BrokerReview4 have a CBTT lookup button, but it returns a hardcoded 6.7732. The broker confirmed the rate comes from the Central Bank of TT determined by the shipped-on-board date. The backend proxy route was written (GET /lookups/cbtt-rate) but the actual Central Bank API integration wasn't confirmed working. The broker also hasn't confirmed whether it's the buying rate, selling rate, or mid-rate.

3.6  Document Extraction Pipeline — Built but Untested

Status: HIGH — core UPSL value proposition

The extraction router was written with a detailed system prompt for Claude to read commercial invoices and AWBs. The upload UI (DocumentUpload.tsx) was built with batch and single modes, confidence scoring, and a bridge to BrokerReview4. However, no test extraction was run during the conversation. The system prompt was updated to remove C82 references (correct), but the actual accuracy of extraction on UPSL's documents is unknown. The first real test should use the HECA Medical invoice that was already provided.

3.7  Spreadsheet Ingestion — Not Built

Status: MEDIUM — needed for UPSL backlog

UPSL mentioned their backlog exists partly in spreadsheets. The conversation discussed building POST /extract/spreadsheet with Claude-powered column mapping, but no code was written. This is needed before the backlog clearance can begin. The architecture was outlined: upload XLSX/CSV, Claude maps column headers to Stallion fields, broker confirms mapping once, then batch-import.

3.8  Register Log and CSV Export — Not Built

Status: MEDIUM — promised in proposal

The broker maintains both a physical register and a spreadsheet log. The proposal promises this will be automated. The declarations.json has the data, but there's no /declarations/export-csv endpoint and no UI button. The DeclarationsList v2 redesign mentioned a register CSV download but confirmation that the route exists is missing.

3.9  File-Based JSON Persistence

Status: LOW for Phase 1, HIGH for Phase 2

All declarations are stored in data/declarations.json with full read-modify-write cycles and no file locking. For Phase 1 with one user this is fine. For Phase 2 with UPSL's team making concurrent edits, this will cause data loss. The Supabase migration was planned and the schema was written, but the migration itself wasn't executed.

3.10  Port Number Inconsistency

The README says 8020, test scripts hit 8021, PM2 runs on 8022. Three different port numbers across three different references. Settle on one and update everything. Minor but confusing for anyone else touching the codebase.

04  Feature Completeness Matrix

Feature

Status

Notes

XML generation (C82 SAD)

DONE

Accepted by ASYCUDA after hotfix

LB01 worksheet PDF

DONE

Matches broker reference format

Worksheet calculation engine

DONE

Math verified against real C82

Preflight validation

PARTIAL

HS dot-notation bug may still be live

Workbench (declaration entry)

DONE

Redesigned, split into 6 components

Broker review interface

DONE

BrokerReview4 with 5 tabs, lifecycle

Home page / dashboard

DONE

v2 with action queue and activity feed

Document extraction (PDF)

BUILT

Code exists, never tested on real docs

Spreadsheet ingestion

NOT BUILT

Architecture discussed, no code

CBTT rate lookup

PARTIAL

Button exists, returns hardcoded value

HS code tariff lookup

NOT BUILT

Discussed, never started

Draft saving (Supabase)

NOT BUILT

TODO markers in code, schema written

Register log + CSV export

NOT BUILT

Promised in proposal

Receipt number entry

PARTIAL

Backend supports it, UI incomplete

Printable approval summary

NOT BUILT

Discussed with broker, never built

WhatsApp alerts (OpenClaw)

NOT BUILT

Architecture clear, no implementation

Multi-tenancy / auth

NOT BUILT

Needed before any second client

Client onboarding script

DONE

onboard-client.sh written

Render deployment blueprint

DONE

render.yaml template ready

Supabase schema (RLS)

DONE

Written, not deployed

05  Deployment Confirmation Gaps

Throughout the conversation, numerous files were generated and provided for deployment. However, the conversation shows a recurring pattern: files are built and delivered, but deployment confirmation is inconsistent. Several critical fixes may or may not be live. Before the UPSL demo, every item in this list needs a binary yes/no answer.

Fix

File(s)

Confirmed Deployed?

HS code dot-notation bug

pack_service.py preflight

UNCONFIRMED

FOB key mismatch in LB01 PDF

pack_service.py

UNCONFIRMED

Root element ordering in XML

xml_builder.py

CONFIRMED (ASYCUDA accepted)

Null stubs in XML

xml_builder.py

CONFIRMED

Two-system merge (localStorage vs backend)

Multiple frontend files

UNCONFIRMED

BrokerReview4 production version

BrokerReview4.tsx

PARTIAL — stub was found

DeclarationsList v2

DeclarationsList.tsx

CONFIRMED per OpenClaw report

Workbench component split

6 component files + parent

UNCONFIRMED

Extraction router

extraction_router.py

UNCONFIRMED

Backend main.py v3 (with extraction)

main.py

UNCONFIRMED

Worksheet field alignment

models.py, worksheet_service.py

UNCONFIRMED

06  Strategic Assessment

What the Previous Conversation Got Right

The COO framing was effective. The diagnosis that you had a revenue pipeline problem, not a team problem, was correct. The decision to use Stallion as the first concrete product rather than selling abstract AI consulting was strategically sound. The broker session was well-structured and produced actionable design decisions. The UPSL engagement was handled correctly — Phase 1 as paid validation before committing to a full build.

What Could Have Been Done Better

Too many files generated without deployment verification. The conversation produced 30+ files across multiple sessions. Many were improvements on previous versions (BrokerReview went through 4 iterations, DeclarationsList through 2, the workbench was split and restyled). But the cycle was: build file, deliver file, move on to next topic. Confirming that each file was actually deployed, tested, and working before building the next one would have prevented the two-system problem and the unconfirmed deployment gaps.

The C82 reference XML should have been obtained earlier. The first broker test failed because the XML structure was wrong. The structural fixes (element ordering, null stubs, exact stub counts) only became clear after comparing against a real accepted XML. Getting that reference file at the start of the project, before writing the XML generator, would have saved the entire hotfix session.

The extraction pipeline was built before being needed. Document extraction code was written before UPSL sent any sample documents. When the samples arrived, the extraction system prompt still referenced C82 inputs and had to be rewritten. Building extraction after receiving real UPSL documents would have produced a better-calibrated system on the first pass.

Feature scope expanded faster than features were completed. The conversation moved from XML generation to worksheet PDFs to broker review UI to home page redesign to extraction to spreadsheet ingestion to CBTT lookups to HS code lookups — without fully completing any single feature end-to-end including deployment. A tighter focus on completing one feature before starting the next would have produced a more reliable system.

07  Priority Actions Before UPSL Demo

Priority

Action

Time Est.

Impact

P0

Confirm HS code bug is fixed — test Generate Pack on a dot-notation HS code

15 min

Unblocks all XML generation

P0

Confirm workbench persists to backend — create declaration, check /declarations API

15 min

Unblocks broker review flow

P0

Serve frontend as production build (npm run build + PM2/nginx)

30 min

Eliminates SIGKILL crashes

P1

Run extraction on HECA Medical invoice — first real test

1 hour

Validates core UPSL value prop

P1

Seed UPSL-DEMO-001 via seed script — confirm it appears in broker review

15 min

Demo readiness

P1

Walk full lifecycle: create in workbench, review in BrokerReview4, generate, download

1 hour

End-to-end smoke test

P2

Wire real CBTT rate lookup (confirm buying vs selling rate with broker)

2 hours

Removes placeholder

P2

Build register CSV export endpoint and button

2 hours

Fulfils proposal promise

P2

Build spreadsheet ingestion endpoint

1 day

Needed for UPSL backlog

P3

Add receipt number input to BrokerReview4 for exported declarations

1 hour

Completes lifecycle

P3

Build printable approval summary PDF

3 hours

Fulfils broker workflow need

08  Overall Verdict

Stallion is a real product with a validated core engine, a real first client, and a clear market. The XML generator works. The worksheet calculator works. The UI is well-designed and broker-informed. The UPSL proposal is professional and correctly scoped.

The risk is not in the concept or the market fit. The risk is in execution reliability. Too many features were started and not enough were finished and confirmed working. The deployment gap — where files exist but their live status is unknown — is the single biggest threat to the UPSL demo and Phase 1 delivery.

The path forward is narrow and clear: stop building new features, confirm everything that's been built is actually deployed and working, run one complete end-to-end test (create, review, generate, download, verify XML), and then demo to UPSL with confidence. Everything else — HS lookup, WhatsApp alerts, multi-tenancy, Supabase migration — comes after Phase 1 revenue is secured.

Build completion estimate: 75% to demoable MVP. The remaining 25% is deployment verification and integration testing, not new code.
