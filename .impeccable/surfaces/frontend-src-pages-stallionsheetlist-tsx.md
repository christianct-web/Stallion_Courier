---
version: 1
slug: "frontend-src-pages-stallionsheetlist-tsx"
primary_target: "frontend/src/pages/StallionSheetList.tsx"
related_targets: ["frontend/src/pages/StallionSheet.tsx"]
---

# Trade Declarations hub + job workspace

Scope: `/stallion/sheets` (hub) and `/stallion/sheet/:id` (job workspace). Mode: Operate.
Audience: clerks (prepare) and brokers (review/approve/submit). Job: open a job by
reference + type, extract documents, fill gaps and verify, then preview and generate
the worksheet and C82 XML. Constraints: server-computed money only; offer only the lifecycle
transitions the backend allows; Stallion brand (PRODUCT.md) is fixed.

## Direction contract

THESIS: The hub is an arrivals docket. Jobs are sorted by when the goods land, not as a
generic status table. The job is a four-station route: Setup, Documents, Verify, Outputs.
It refuses the stat-card row plus zebra table that every customs dashboard ships.

OWN-WORLD: Near-black chrome (#14100E) top bar and day rules. Warm paper canvas (#EFE9DF).
Burnt orange #C2571B is the only accent: primary action, active station, today marker.
Forest green #1F5232 is for done. Fraunces for the display and the day headings; JetBrains
Mono for references, codes, money and labels. Squared editorial cards, 1px warm-grey rules.

STORY: The clerk sees today's arrivals first and knows where each job stands from its
four-pip station track. Clicking a job lands on its next station. "New job" asks for the
reference and the type, then drops the clerk on Documents.

FIRST VIEWPORT: The black bar sits on top. Below it: eyebrow, the "Trade Declarations"
display title, and the date. The orange "New job" button is top right, with search next to
it. A row of queue chips (My review / Corrections / In progress / All) carries counts.
Then come the docket groups: a dark day rule (TODAY · SAT 10 OCT · n jobs) over rows of
mono time/vessel · reference · client · type · station track · status · payable.

SIGNATURE: The station track (four pips, done green, current orange, rest hollow). It
repeats as the clickable step rail inside the job.

FORM: Arrivals docket, dealt #6 of 7 (seed 42e7524e, roll degraded). The user chose it
over Reference-first desk and Split inbox.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
