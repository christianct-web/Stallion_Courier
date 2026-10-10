# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Clerk** — prepares trade declarations for Trinidad & Tobago Customs. Opens a job,
  uploads the commercial invoice / bill of lading for extraction, fills the
  fields extraction missed, classifies lines, and submits the job for review.
- **Broker** — reviews what clerks prepared, approves or sends it back for
  correction, then submits to Customs (ASYCUDA) and records the receipt.
- **Admin** — same surfaces as the broker plus user management.

Roles come from the session (`clerk | broker | admin`). Both clerk and broker
work out of the same declarations hub; the broker also needs a "waiting on my
review" queue.

## Product Purpose

Stallion prepares legal customs declarations (C82 import/export, C84
concessions, C75/C76 warehousing, C86 bill of sight) and produces the costing
worksheet and the ASYCUDA-compatible C82 SAD XML. Success means the right
duty, VAT and permits are declared the first time, and a job moves from
"documents in hand" to "XML generated" with nothing missed.

## Positioning

Extraction-first declaration prep built around T&T customs specifics
(CPC codes, TT tariff database, C84 concession relief, CBTT exchange
rate), with a broker-review lifecycle that is enforced server-side.

## Operating Context

The Stallion module workflow for one job (a "sheet" in the API):

1. **New job** — clerk enters the job reference number and picks the
   declaration type (Import C82, Export C82, C84, C75, C76, C86, manual
   worksheet).
2. **Documents** — upload invoice / BL (PDF or image) for extraction; lines
   and header fields auto-populate, with a checklist of what was and wasn't
   found.
3. **Verify** — fill missing data, classify HS codes, confirm values.
4. **Outputs** — preview the worksheet figures, download the worksheet
   (XLSX) and C84 claim, run the pre-submission check, generate the C82 XML.

Lifecycle: `draft → pending → approved → submitted → receipted`, with
`correction` reachable from pending/approved. Transitions are validated by the
backend transition map; the UI only offers what the map allows.

The Stallion Courier module (manifests, express shipments) is a separate,
mobile-first surface with its own shell and is out of scope for the hub.

## Capabilities and Constraints

- All duty/VAT/CIF figures are computed server-side (`sheet_service.recompute`);
  the UI displays them and never recomputes tax.
- Regulatory data (HS, rates, CPC, concessions) comes from the backend
  reference data and tariff DB, never from the UI.
- Zero is a value: presence checks use null/absence, not truthiness.
- Frontend: React 18 + Vite + TypeScript, inline-style components, react-router.
- See AGENTS.md for denylisted files and escalation rules.

## Brand Commitments

Stallion keeps its established look per the Mana Labs 8 house system:
near-black chrome, warm paper content canvas, burnt-orange accent (the
horse-S mark), forest green for success states, Fraunces serif display,
JetBrains Mono for numerals, codes, labels and technical text. Do not restyle
Stallion toward another family.

## Evidence on Hand

- Brand marks: `frontend/public/brand/stallion-horizontal.svg`,
  `stallion-mark.svg`.
- No customer testimonials, metrics, or case studies in the repo; do not
  fabricate any.

## Product Principles

1. The job is the unit of work — every screen answers "which job, what step,
   what's next".
2. Show what the machine extracted versus what a human confirmed.
3. Problems first: missing and critical items surface before everything else.
4. The lifecycle is law — never offer a transition the backend would refuse.
5. Numbers are the product — monospace, aligned, server-computed, never
   approximated.
