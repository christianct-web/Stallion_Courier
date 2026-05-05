# Stallion Competitive Content Snapshot (BrokerGenius dataset)

- Source: `https://api.apify.com/v2/datasets/HUPSRFlGP1mBHIDKw/items?format=json&view=markdown&clean=true`
- Downloaded to: `stallion/data/apify_items.json`
- Records: 120 URLs (all from `brokergenius.ai`)

## Quick findings
- Content mix is heavily **AI/product-positioning** + **customs compliance education**.
- Long-form depth exists (max ~1,662 words; p75 ~636; median ~323), meaning many posts are still short-to-medium and could be outranked by stronger technical guides.
- They lean hard on broad terms (`broker`, `ai`, `customs`, `import`, `compliance`) but have relatively low density around specific high-intent execution terms (`commodity code`, `trinidad`, deep local workflows).

## Frequency signals (presence by page)
- broker: 113
- ai: 105
- customs: 93
- import: 55
- compliance: 43
- tariff: 39
- classification: 35
- export: 34
- asycuda: 30
- hs code: 26
- caribbean: 23
- duty: 11
- commodity code: 4
- trinidad: 1

## Page-type split (heuristic)
- Article/Landing: 93
- Educational how-to/explainer: 16
- News/tariff updates: 4
- Core utility pages (home/blog/pricing/faq/terms/privacy/webinar): 7

## Stallion opportunities
1. Own **execution-layer content** they under-serve:
   - "How to validate ASYCUDA XML before submission"
   - "TTBizLink + ASYCUDA workflow map"
   - "HS classification QA checklist for brokers"
2. Build **Trinidad/Caribbean-local authority** clusters:
   - local regulatory guides, filing walkthroughs, recurring update logs.
3. Publish **high-intent conversion pages**:
   - "For customs brokers", "For importers", "For in-house trade teams" with CTA to pilot/demo.

## Technical parity check (Atlas + Circuit lens)

### Atlas (architecture/workflow view)
- The corpus shows strong high-level positioning around automation/compliance/customs, but limited publicly visible architecture depth.
- Signal counts across 120 pages:
  - customs-data context (ASYCUDA/XML/HS/tariff): 66 pages
  - compliance/validation/audit language: 71 pages
  - automation/workflow language: 56 pages
  - API/integration language: 22 pages
- Interpretation: competitor is content-strong, but architecture proof is under-documented publicly (few pages discuss concrete schemas, mapping strategy, validation internals, or deterministic workflows).

### Circuit (integration/API engineering view)
- Integration/API mentions exist, but deep implementation details are sparse:
  - `api` mentions: 21 pages
  - `integration` mentions: 17 pages
  - `endpoint`: 4 pages
  - `json`: 4 pages
  - `schema`: 8 pages
  - `mapping`: 2 pages
  - `xsd`: 1 page
- Interpretation: if Stallion can expose practical integration docs (payload examples, XML/XSD validation flow, field mapping tables, error catalogs), Stallion can appear technically stronger than BrokerGenius to serious buyers.

### Technical on-par verdict (from scraped public content only)
- On **public evidence**, Stallion can be on par quickly and exceed in technical credibility by publishing integration-grade docs.
- Unknown from this dataset: uptime, performance, SOC/compliance certs, internal architecture quality, true API robustness.

## Recommended next deliverables
- 10-page topic map for Stallion (SEO + sales intent)
- 3 pillar pages (1500+ words each)
- 6 BOFU landing pages tied to pains (classification errors, rejection loops, tariff volatility)
- 1 public technical docs mini-hub:
  - API overview + auth model
  - ASYCUDA XML validation playbook (XSD + error mapping)
  - TTBizLink integration sequence
  - Data contract examples (JSON/XML)
