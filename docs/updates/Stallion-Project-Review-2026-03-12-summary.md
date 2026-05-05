# Stallion Project Review — Summary (2026-03-12)

## Overall
- XML generation reached real milestone: ASYCUDA accepted a Stallion-generated file after structural fixes.
- Worksheet calculations and LB01 formatting are reported as validated against real broker references.
- UI and broker review workflow are largely in place, but production readiness still depends on closing critical integration/consistency gaps.

## Priority Issues Called Out in Review
- **3.1  Two Declaration Systems Running in Parallel** — CRITICAL — blocks demo coherence
- **3.2  Frontend Dev Process Instability** — HIGH — affects demo reliability
- **3.3  HS Code Preflight Bug** — CRITICAL — Generate Pack fails on all valid declarations
- **3.4  LB01 FOB Value Always Shows Zero** — HIGH — worksheet PDF shows wrong numbers
- **3.5  CBTT Rate Lookup Not Wired** — MEDIUM — functional but uses placeholder
- **3.6  Document Extraction Pipeline — Built but Untested** — HIGH — core UPSL value proposition
- **3.7  Spreadsheet Ingestion — Not Built** — MEDIUM — needed for UPSL backlog
- **3.8  Register Log and CSV Export — Not Built** — MEDIUM — promised in proposal
- **3.9  File-Based JSON Persistence** — LOW for Phase 1, HIGH for Phase 2
- **3.10  Port Number Inconsistency** — Status not detected

## Immediate Focus (as inferred from review)
1. Unify declaration source of truth (retire parallel localStorage flow for Phase 1).
2. Fix/verify HS code dot-notation preflight and LB01 FOB key mismatch.
3. Move frontend from fragile dev mode to stable served build for broker demos.
4. Complete real CBTT rate wiring and confirm broker-required rate type.
5. Run first real extraction accuracy test on UPSL docs; then implement spreadsheet ingestion + register CSV export.

## Source
- Full extracted review: `Stallion-Project-Review-2026-03-12.md`
- Original file: `Stallion-Project-Review-2026-03-12.docx`
