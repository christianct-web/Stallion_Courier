# Stallion Design System

Source of truth: **`frontend/src/brand/stallion.ts`**. Every colour, type size and
radius in the app derives from that module. This document explains the identity
it encodes and the audit that produced it.

---

## 1. Identity

Stallion is dressed for **customs brokers in Trinidad & Tobago**, not for a
dev-tools audience. The product is read the way a declaration is read: dense
tables of codes, rates and TTD figures that have to be scanned accurately, often
one-handed on a phone in a warehouse.

| Element | Value | Rationale |
|---|---|---|
| Chrome | Warm near-black `#14100E` | Chestnut/ink, not blue-black |
| Content canvas | Warm paper `#EFE9DF` | Sits beside physical paper documents |
| Accent | Burnt orange `#C2571B` | One accent, doing real work |
| Success | Forest green `#1F5232` | Cleared / approved |
| Display | Fraunces (serif) | Editorial weight; carries the brand |
| Data | JetBrains Mono | Every numeral, code and label |

**Accent discipline.** One chromatic accent per screen, on the thing that
matters: the primary CTA, the active nav item, the figure being decided on.
Semantic colour (green/gold/red) stays as small tinted chips — never a full
surface. A screen of coloured backgrounds destroys the table scan.

**Numerals are always mono and always tabular.** TTD amounts, duty rates, HS/THN
codes, container and package counts. Digits must align down a column, and `0/O`
and `1/l` must stay distinguishable.

---

## 2. What the audit found

The palette had been copied by hand into **five** places that then drifted apart:

1. `index.css` — shadcn theme vars in a generic slate-blue "enterprise" theme
   (`--primary: 215 45% 25%`). Every one of the ~50 `ui/` components rendered
   in a different visual language than the page around it.
2. `components/courier/tokens.ts` — the real Stallion warm palette.
3. `components/typeScale.ts` — its own private `INK` / `INK_MID` / `AMBER`.
4. `TopNav.tsx` — its own `void_` / `ghost` / `ghostDim`.
5. **Ten page files**, each with a hand-copied `const C = { … }`.

Concrete drift this produced:

- **The chrome was the wrong temperature.** `#111318` / `#2E3748` / `#8A93A3`
  are cool blue-greys sitting against a warm paper content area — the single
  largest brand incoherence in the app.
- **Two greens, two hex apart** — `#1A5C3A` and `#1A5E3A`, both in use.
- **Two `inkLight` values** — `#4A453D` and `#6B6560`; a comment in `index.css`
  documented one while `tokens.ts` shipped the other.
- **Two blues** (`#1E4A8C` / `#1A4A8C`) and **two mid-greens** (`#2E7D52` /
  `#2E7D4F`).

### Contrast failures found and fixed

| Pair | Was | Now |
|---|---|---|
| Gold `#B8860B` on paper | **2.94:1** — effectively invisible | `#7A5600` → 5.51:1 |
| TopNav inactive link `#6B7585` on chrome | **3.99:1** | `#A89A8B` → 6.90:1 |
| Accent `#C65911` on paper | **3.92:1** | `#963A10` → 5.98:1 |
| White on accent (button fill) | **4.34:1** | `#A34410` → 6.19:1 |
| Tariff "FREE" pill `#2E7D4F` | **4.36:1** | `#1F5232` → 7.73:1 |
| Dashboard gold label | **4.45:1** | 5.51:1 |

**241 text elements were sized below 11px** (down to 8px), compensated for by a
CSS hack that matched serialised inline-style strings
(`#root [style*="font-size: 8px"] { font-size: 9.5px !important }`) and force-set
every Fraunces element to weight 700, flattening the heading hierarchy. The hack
is gone; the underlying sizes were raised to an 11px floor.

---

## 3. Rules

**Colour**

- Never write a hex literal in a component. Import from `@/brand/stallion`.
- Never add a colour without measuring it. Body/label text ≥ 4.5:1; non-text UI
  (focus rings, borders) ≥ 3:1.
- The accent has three variants, because one hex cannot be both brand-true and
  readable at every size:
  - `amber` `#C2571B` — marks, fills, borders, large display numerals
  - `amberDeep` `#A34410` — solid buttons carrying white labels
  - `amberText` `#963A10` — small accent text on paper
  - `amberOnDark` `#D4762B` — accents on the dark chrome (the brand hex only
    reaches 4.36:1 there, so dark-chrome accents *lighten* rather than darken)

**Typography**

- Fraunces for display, JetBrains Mono for data and labels. No UI sans.
- 11px is the floor. This app is used on a phone in the field.
- Spread a role from `components/typeScale.ts` rather than hand-typing
  `fontSize`/`fontWeight`/`color`.

**Geometry**

- Squared editorial cards — radii stay tight (3 / 6 / 10px). Stallion does not
  use the soft rounding of the consumer-facing products in the stable.
- Touch targets ≥ 44px.

**State must never rest on colour alone.** Active nav carries an accent rule plus
a weight change; status pills carry a text label, not just a tint.

---

## 4. Relationship to the wider portfolio

Stallion's burnt-orange-on-warm-paper with serif display is **grandfathered and
deliberate** — chestnut coat, paper documents, customs-broker audience. It is
not a template: do not reuse this palette for AI-facing products or investor
materials, and do not "upgrade" Stallion toward another product's palette for
cross-portfolio consistency. Each product in the stable is dressed for its own
buyer.
