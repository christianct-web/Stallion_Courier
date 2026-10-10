---
name: Stallion Trade Declarations
description: Arrivals docket and four-station job workspace for Trinidad & Tobago customs declarations.
colors:
  chrome: "#14100E"
  chrome-2: "#1F1915"
  chrome-line: "#3A302A"
  chrome-text: "#F1EAE0"
  chrome-dim: "#B3A596"
  paper: "#EFE9DF"
  sheet: "#F8F4ED"
  field: "#FFFDF9"
  line: "#DCD2C4"
  line-strong: "#C3B5A3"
  ink: "#1A1512"
  ink-2: "#3D342D"
  ink-3: "#66594D"
  accent: "#C2571B"
  accent-fill: "#B5501A"
  accent-hover: "#A34816"
  accent-ink: "#9C4413"
  accent-wash: "#F5E2D3"
  accent-on-dark: "#F3A16F"
  ok: "#1F5232"
  ok-wash: "#DFEADC"
  ok-on-dark: "#8FCBA4"
  warn: "#7E5300"
  warn-wash: "#F5E8C6"
  crit: "#A3241B"
  crit-wash: "#F5DDD8"
typography:
  display:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "clamp(30px, 3.4vw, 40px)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.02em"
    fontVariation: "\"opsz\" 96"
  headline:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "clamp(24px, 2.4vw, 30px)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "20px"
    fontWeight: 700
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Instrument Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  data:
    fontFamily: "JetBrains Mono, SFMono-Regular, ui-monospace, monospace"
    fontSize: "13px"
    fontFeature: "\"tnum\""
  money-total:
    fontFamily: "JetBrains Mono, SFMono-Regular, ui-monospace, monospace"
    fontSize: "22px"
    fontWeight: 700
    fontFeature: "\"tnum\""
  label:
    fontFamily: "JetBrains Mono, SFMono-Regular, ui-monospace, monospace"
    fontSize: "10.5px"
    fontWeight: 600
    letterSpacing: "0.08em"
rounded:
  tag: "3px"
  control: "4px"
  card: "5px"
  panel: "6px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "22px"
  xl: "36px"
components:
  button-primary:
    backgroundColor: "{colors.accent-fill}"
    textColor: "#FFFFFF"
    typography: "{typography.data}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "38px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "38px"
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.chrome-text}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "38px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "38px"
  button-sm:
    padding: "0 10px"
    height: "30px"
  input:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    typography: "{typography.data}"
    rounded: "{rounded.control}"
    padding: "7px 10px"
    height: "36px"
  queue-chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "34px"
  queue-chip-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.chrome-text}"
  tag:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.tag}"
    padding: "0 8px"
    height: "22px"
  status-approved:
    backgroundColor: "{colors.ok-wash}"
    textColor: "{colors.ok}"
    rounded: "{rounded.tag}"
    padding: "0 8px"
    height: "22px"
  status-pending:
    backgroundColor: "{colors.warn-wash}"
    textColor: "{colors.warn}"
    rounded: "{rounded.tag}"
    padding: "0 8px"
    height: "22px"
  status-correction:
    backgroundColor: "{colors.crit-wash}"
    textColor: "{colors.crit}"
    rounded: "{rounded.tag}"
    padding: "0 8px"
    height: "22px"
  status-submitted:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.chrome-text}"
    rounded: "{rounded.tag}"
    padding: "0 8px"
    height: "22px"
  panel:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.panel}"
    padding: "16px 22px 22px"
  day-rule:
    backgroundColor: "{colors.chrome}"
    textColor: "{colors.chrome-text}"
    typography: "{typography.title}"
    padding: "10px 18px"
  duty-rail:
    backgroundColor: "{colors.chrome}"
    textColor: "{colors.chrome-text}"
    rounded: "{rounded.panel}"
    padding: "20px 20px 18px"
    width: "300px"
---

# Design System: Stallion Trade Declarations

## Overview

**Creative North Star: "The Arrivals Docket"**

The Stallion declarations world reads like a harbour-office ledger: near-black chrome bands frame warm paper sheets, and every job is filed under the day its goods land. Near-black is the frame, paper is the working surface, and burnt orange is the single ember that says "act here". Forest green says "done". Nothing else carries hue except the status vocabulary.

Density is operational, not airy. Rows are 58px tall, panels pad at 22px, labels are small uppercase mono, and every reference, code, and figure is set in tabular JetBrains Mono so columns of money align. Fraunces carries headings only: the page title, step titles, panel titles, day names, station names. Instrument Sans carries prose. The pairing is fixed by Stallion's brand commitment (PRODUCT.md) and must not drift toward another family.

The signature is the station track: four pips joined by hairlines, green when done, orange when current, hollow otherwise. It appears small in each docket row and full-size as the sticky, clickable station rail inside a job. Problems surface first and in place: blocking fields flag their own label and border rather than raising a separate alert surface.

**Key Characteristics:**
- Near-black chrome bands (top bar, job bar, day rules, duty rail, XML preview) over a warm paper canvas.
- One accent: burnt orange for the primary action, current station, today marker, focus ring, and "needed" flags.
- Forest green only for done and receipted states.
- Monospace for anything countable or codable; Fraunces only for headings; Instrument Sans for prose.
- Flat: depth comes from tonal paper layers and 1px warm-grey rules, never drop shadows.
- Squared, editorial corners (3-6px); the only full pill is the queue chip.

## Colors

A warm, low-saturation paper-and-soot palette with one burnt-orange ember and a strict status vocabulary.

### Primary
- **Burnt Ember** (accent): the current station pip and underline, the today marker, the focus outline (2px, 2px offset), the input focus border, and the caret. Non-text use on paper only; it is 3.72:1 on paper, so text in this hue on light grounds uses Ember Ink instead.
- **Button Ember** (accent-fill): the primary button fill, one shade under Burnt Ember so white 12px label text clears AA (5.09:1; Burnt Ember itself is 4.49:1).
- **Banked Ember** (accent-hover): primary button hover fill (6.01:1 with white).
- **Ember Ink** (accent-ink): orange-voiced text on paper: "needed" field flags, attention sub-lines on stations, text links ("Go to field"), hot queue counts.
- **Ember Wash** (accent-wash): text selection; the same family lightens further (#FFF8F2) for invalid-field and drag-over fills.
- **Ember on Dark** (accent-on-dark): the orange voice on chrome: payable totals in the job bar and duty rail, the "landed, not yet submitted" day name, blocking hints in the job bar, XML tag names.

### Secondary
- **Forest Ledger** (ok): done pips and track bars, done station badges, approved and receipted status text, "file done" states, C84 relief figures.
- **Forest Wash** (ok-wash): approved chip and OK banner/checklist grounds.
- **Forest on Dark** (ok-on-dark): relief rows in the duty rail.

### Tertiary
- **Customs Amber** (warn) on **Amber Wash** (warn-wash): in-review status, "to check" counts, "check" field flags (with a #C9A24A border and #FFFBEF fill).
- **Seal Red** (crit) on **Seal Wash** (crit-wash): sent-back status, blocking counts, missing-item icons, critical banners, destructive icon hovers.

### Neutral
- **Soot** (chrome): top-level bands: job bar, day rules, duty rail, code preview.
- **Banked Soot** (chrome-2): the confirm strip under the job bar and dark hovers.
- **Soot Rule** (chrome-line): 1px rules and outlines on chrome.
- **Lamplight** (chrome-text): primary text on chrome.
- **Ash** (chrome-dim): secondary text on chrome (dates, dt labels, meta).
- **Harbour Paper** (paper): the canvas, drawers, panel footers, type-code wells.
- **Sheet** (sheet): panels, docket rows, the sticky station rail, tags.
- **Field White** (field): inputs, drop zone, type cards, output cards, file rows.
- **Hairline** (line): default 1px dividers and panel borders.
- **Strong Hairline** (line-strong): control borders, table header rules, hollow pips, quiet day-rule underline.
- **Ink** (ink), **Ink 2** (ink-2), **Ink 3** (ink-3): primary, secondary, and tertiary text. Ink 3 is the floor for labels and meta (5.6:1 on paper).

### Named Rules
**The One Ember Rule.** Burnt orange is the only accent. It marks exactly one thing per context: the primary action, where the job is now, today, or what is needed. Status hues (amber, red) appear only inside status chips, counts, flags, and banners, never as decoration.

**The Green Means Done Rule.** Forest green is reserved for completed stations, approved and receipted states, and relief. Never use it for links, selection, or emphasis.

**The Chrome Frames, Paper Works Rule.** Near-black is for bands that frame or summarize (top bar, job bar, day rules, duty rail, code). Editable content always sits on paper, sheet, or field.

## Typography

**Display Font:** Fraunces (with Georgia, serif)
**Body Font:** Instrument Sans (with system-ui, -apple-system, Segoe UI, sans-serif)
**Label/Mono Font:** JetBrains Mono (with SFMono-Regular, ui-monospace, monospace)

**Character:** A heavy, slightly wonky optical-size serif for the ledger's headings against a precise tabular mono for everything a clerk reads as data. Prose stays in a quiet grotesque so the two loud voices never compete.

### Hierarchy
- **Display** (700, clamp(30px, 3.4vw, 40px), 1.05, opsz 96): the hub page title only.
- **Headline** (700, clamp(24px, 2.4vw, 30px), 1.1): the step title atop each station; the job reference in the job bar (24px).
- **Title** (700, 16-22px): panel titles (20px), new-job and empty-state titles (22px), drop-zone call (19px), day names (18px), rail and output-card titles (17px), station names (16px).
- **Body** (400, 14px, 1.45): prose, client names, ledes (13.5-14.5px). Ledes cap at 62-66ch.
- **Data** (mono, 12-13.5px, tabular): references (700, 13.5px), money, dates, vessels, codes, inputs (13px), buttons (600, 12px, 0.04em), chips (600, 11px).
- **Money total** (mono 700, 22px; 17px in the job bar): the payable figure, always Ember on Dark on chrome.
- **Label** (mono 600, 10.5px, 0.08em, uppercase): field labels, docket and table column heads, rail total captions. Group dividers inside a panel use 11px / 0.1em with a hairline beneath.

### Named Rules
**The Countable Is Mono Rule.** If it can be counted, keyed, or matched against a document (reference, HS code, BL, date, amount, status), it is JetBrains Mono with tabular numerals. Prose inputs opt out explicitly.

**The Serif Is For Headings Rule.** Fraunces is used only for headings and names of places in the route (stations, days, panels). Never in inputs, tables, or labels.

## Layout

The hub is a centred column (max 1440px, padding 36px clamp(16px, 4vw, 48px) 64px). The docket is a list of day groups 26px apart; each group is a dark day rule over a sheet of rows sharing one 9-column grid (72px / 1fr / 150px / 1.5fr / 128px / 196px / 104px / 128px / 40px, 14px gap) with a matching mono column head above. At 1240px the vessel column drops; at 900px rows become a two-column card (ref and client left, money right, track and status, then meta and time) and the column head hides. Queue chips wrap above the docket and become a horizontal scroller under 720px.

The job workspace stacks: chrome job bar, an optional confirm strip, a sticky station rail (sticks at 52px under the app bar), then a work grid (max 1480px) of main column plus a 300px sticky duty rail (top 132px). Under 1180px the rail drops beneath and stops sticking. Outputs-only steps use a single 860px centred column. Field grids auto-fill at minmax(190px, 1fr) with 14px row and 16px column gaps; wide fields span two.

Rhythm: 6px inside chips and pip groups, 10px between related controls, 14px between rows and grid cells, 22px panel padding and panel-to-panel gaps, 28-36px above the first content block.

## Elevation & Depth

The system is flat. Depth is tonal layering (paper canvas, sheet panels, field controls) separated by 1px warm-grey rules, plus the hard contrast of chrome bands. No surface casts a drop shadow. The only shadows are functional: a 3px ember halo on focused inputs, a 1px inset ring on the selected type card and receipted chip, and soft scroll-edge shadows on the horizontally scrolling lines table.

### Shadow Vocabulary
- **Focus halo** (`box-shadow: 0 0 0 3px rgba(194, 87, 27, 0.18)`): focused input, select, textarea.
- **Selected ring** (`box-shadow: inset 0 0 0 1px var(--accent)`): checked declaration-type card.
- **Receipted ring** (`box-shadow: inset 0 0 0 1px rgba(31, 82, 50, 0.45)`): receipted status chip.
- **Scroll edge** (`radial-gradient(farthest-side at 0 50%, rgba(26, 21, 18, 0.18), transparent)`): left/right edge of an overflowing table.

### Named Rules
**The Flat Docket Rule.** Surfaces never lift. If something needs to stand out, change its ground (sheet to chrome) or its rule weight, not its shadow.

## Shapes

Squared editorial corners: 3px for tags, status chips, counts, and type codes; 4px for buttons, icon buttons, inputs, file rows; 5px for type cards, output cards, banners, code blocks, and the day-rule/rows pair (5px top on the rule, 5px bottom on the rows so they read as one docket card); 6px for panels, the duty rail, the new-job panel, drop zone, and empty state. The queue chip is the only full pill (999px). Circles are reserved for the route: station pips (10px in rows, 28px in the rail), status dots (6px), checklist icons (22px). Borders are 1px; the drop zone and empty state use a dashed 1.5px / 1px strong hairline; the current station carries a 3px ember underline.

## Components

### Buttons
Mono, compact, and squared; they read like stamped labels.
- **Shape:** gently squared (4px), 38px tall, 16px side padding, mono 600 12px with 0.04em tracking; 15px icon at 8px gap.
- **Primary:** Burnt Ember fill, white text; hover Banked Ember. One per view: "New job", "Submit for review", "Continue to outputs".
- **Secondary:** Field White with a strong hairline border; hover lifts to pure white with an Ink 3 border.
- **Ink:** Ink fill, Lamplight text, for decisive non-accent actions.
- **Ghost:** transparent, Ink 2 text, 6% ink wash on hover. **Danger** variant only changes text to Seal Red.
- **On dark:** transparent with a Soot Rule border on chrome bands; hover Banked Soot.
- **Small:** 30px tall, 10px padding, 11px text. Icon buttons are 32px squares, transparent until hover.
- **Focus:** 2px ember outline, 2px offset, everywhere in the world. Disabled at 55% opacity.

### Chips
- **Queue chip:** 34px pill, strong hairline outline, mono 500 12px with a bold count; pressed state inverts to Ink fill and Lamplight text. "Hot" queues colour their count Ember Ink (light ember when pressed).
- **Status chip:** 22px, 3px corners, mono 600 11px with a 6px currentColor dot. Draft (6% ink wash), In review (amber), Sent back (red), Approved (green), Submitted (Ink fill), Receipted (green text, inset green ring, no fill).
- **Tag:** 22px, Sheet ground, strong hairline outline, mono 11px; declaration type in rows and the job bar.

### Cards / Containers
- **Corner Style:** 6px panels, 5px inner cards.
- **Background:** panels on Sheet; inner cards (type, output, file) on Field White; footers and drawers on Paper.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1px Hairline.
- **Internal Padding:** 18px 22px head, 16px 22px 22px body, 14px 22px footer with a top hairline.

### Inputs / Fields
- **Style:** Field White, strong hairline border, 4px corners, 36px tall, mono 13px, ember caret. Prose inputs switch to Instrument Sans 14px. Numbers right-align.
- **Label:** mono 600 10.5px uppercase Ink 3 above the control, 5px gap.
- **Focus:** border turns Burnt Ember plus the 3px ember halo.
- **Needed:** label and "· needed" flag turn Ember Ink; border Burnt Ember on a #FFF8F2 fill.
- **Check:** label and flag turn Customs Amber; border #C9A24A on #FFFBEF.
- **Disabled:** Sheet fill, Hairline border, Ink 2 text.

### Navigation
- **Station rail:** a sticky Sheet band of four equal stations divided by 26px hairlines. Each station is a 28px numbered pip, a Fraunces 16px name, and a mono 11px sub-line. Done pips fill Forest Ledger with a check; the current station fills Burnt Ember and gains a 3px ember underline; attention sub-lines turn Ember Ink. Scrolls horizontally on narrow screens.
- **Job bar:** a chrome band with a mono "Docket" back link, the Fraunces job reference, type tag, client in Ash, and on the right the payable figure (mono caption over Ember on Dark total), status chip, blocking hint, and the primary action.

### Station Track (signature)
Four 10px hollow pips joined by 10px hairline bars in strong hairline. Done pips and bars fill Forest Ledger; the current pip fills Burnt Ember with a 1.5px ember outline at 1.5px offset. An optional mono 11.5px label names the station. Pip changes ease over 0.4s on cubic-bezier(0.16, 1, 0.3, 1).

### Day Rule (signature)
A chrome band (10px 18px, 5px top corners) carrying a Fraunces 18px day name, mono date in Ash, and right-aligned mono meta (job count, payable total). Today prefixes a 9px ember dot with an offset ring; the overdue "landed" group turns its name Ember on Dark with a warning icon. Quiet groups (undated, earlier) drop the band to a transparent rule with a strong hairline underline.

### Duty Rail
A 300px chrome card: Fraunces 17px title, a mono 12.5px two-column dl of server-computed figures (Ash terms, Lamplight values, relief in Forest on Dark), then a Soot Rule divider and the payable total in mono 700 22px Ember on Dark, followed by the CIF factor and a provenance note.

## Do's and Don'ts

### Do:
- **Do** keep burnt orange to one role per context: primary action, current station, today, or needed.
- **Do** set references, codes, dates, and money in JetBrains Mono with tabular numerals, right-aligned in columns.
- **Do** use Ember Ink (accent-ink) for orange text on paper and Ember on Dark (accent-on-dark) for orange text on chrome; reserve Burnt Ember itself for fills, rules, pips, and focus.
- **Do** flag problems on the field itself (label colour, flag word, border, fill) and list them first in the checklist, blocking before "to check".
- **Do** reuse the station track wherever a job's progress is shown.
- **Do** separate surfaces with 1px Hairline rules and tonal steps (paper, sheet, field).
- **Do** honour reduced motion; every transition and reveal collapses to near-zero duration.

### Don't:
- **Don't** add drop shadows to panels, rows, or cards; the system is flat.
- **Don't** introduce a second accent hue, or use amber and red outside status chips, counts, flags, and banners.
- **Don't** use green for anything that is not done, approved, receipted, or relief.
- **Don't** set Fraunces in inputs, table cells, or labels.
- **Don't** put a mono label above a Fraunces heading as an eyebrow or kicker; headings stand alone, and uppercase mono labels name fields, columns, and field groups only.
- **Don't** build a stat-card row or a zebra-striped status table for the hub; jobs are grouped by arrival day.
- **Don't** round containers past 6px or use pills for anything but queue chips.
