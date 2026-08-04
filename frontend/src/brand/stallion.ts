/**
 * brand/stallion.ts — the single source of truth for Stallion's visual identity.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Colour was previously defined in five places that had drifted apart:
 *   1. index.css          — shadcn HSL vars in a generic slate-blue "enterprise"
 *                           theme, so every ui/ component rendered off-brand.
 *   2. courier/tokens.ts  — the real Stallion warm palette.
 *   3. typeScale.ts       — its own private INK / INK_MID / AMBER literals.
 *   4. TopNav.tsx         — its own void_ / ghost / ghostDim locals.
 *   5. ten page files     — each with a hand-copied `const C = { ... }`.
 * The copies had visibly diverged (two greens two hex apart, two different
 * inkLight values, a cool blue-grey chrome sitting against a warm paper body).
 * Everything now derives from here.
 *
 * IDENTITY
 * --------
 * Stallion dresses for customs brokers, not for a dev-tools audience: warm
 * near-black chrome, warm paper content, one burnt-orange accent doing real
 * work, forest green reserved for cleared/approved states. Display serif for
 * headings, mono for every number, code and label — because the job is reading
 * declarations, tariff codes and TTD figures accurately.
 *
 * ACCESSIBILITY CONTRACT
 * ----------------------
 * Every foreground/background pair named below is annotated with its measured
 * WCAG 2.1 contrast ratio against its intended backdrop. Body and label text
 * clears 4.5:1; non-text UI (focus rings, borders) clears 3:1. Do not introduce
 * a colour here without measuring it — several of the values this file replaces
 * were unreadable (gold #B8860B on paper measured 2.94:1).
 */

/* ── Canvas & chrome ──────────────────────────────────────────────────────
 * The chrome is warm near-black, NOT the cool blue-black (#111318 / #2E3748 /
 * #8A93A3) it used to be. That old chrome was sampled from a different design
 * lineage and fought the warm paper content area on every screen — the single
 * largest brand incoherence in the app. */

/** App chrome: top bar, bottom nav, dark panels. */
const VOID = "#14100E";
/** One step up from chrome — dark panel backgrounds. */
const VOID_MID = "#1C1714";
/** Raised surface on dark — active nav pill, dark cards. */
const VOID_SURFACE = "#241D19";
/** Hairline on dark chrome. */
const VOID_BORDER = "#332A24";

/** Primary text on dark chrome. 13.93:1 on VOID. */
const GHOST = "#E4DCD2";
/** Secondary text on dark chrome. 6.90:1 on VOID — the value it replaces
 *  (#6B7585 in TopNav) measured 3.99:1 and failed. */
const GHOST_DIM = "#A89A8B";

/* ── Paper (content) ─────────────────────────────────────────────────────── */

/** App background behind cards. */
const CANVAS = "#EFE9DF";
/** Card / primary content surface — lifts off CANVAS. */
const PAPER = "#F6F3EE";
/** Recessed tint: table headers, muted chips, disabled rows. */
const PAPER_ALT = "#E8E1D5";
/** Hairline divider on paper. */
const PAPER_BORDER = "#DCD5C8";
/** Stronger rule — section separators, input borders. */
const PAPER_MID = "#C7BFB0";

/* ── Ink ─────────────────────────────────────────────────────────────────── */

/** Primary text. 15.08:1 on CANVAS. */
const INK = "#18150F";
/** Secondary text. 12.15:1 on CANVAS. */
const INK_MID = "#2C2820";
/** Tertiary text / captions. 7.87:1 on CANVAS. */
const INK_LIGHT = "#4A453D";

/* ── Accent: burnt orange ────────────────────────────────────────────────
 * One chromatic accent per screen, doing real work — the primary CTA, the
 * active state, the one number that matters. Three variants because a single
 * hex cannot be both brand-true and readable at every size:
 *   ACCENT      brand hex. Marks, fills, borders, large display numerals.
 *   ACCENT_DEEP solid buttons with white labels (white on ACCENT is 4.49:1,
 *               a hair under the 4.5 threshold; on ACCENT_DEEP it is 6.19:1).
 *   ACCENT_TEXT small accent text on paper — eyebrows, links, table accents. */

const ACCENT = "#C2571B";
const ACCENT_DEEP = "#A34410";
/** 5.98:1 on CANVAS, 6.52:1 on PAPER. */
const ACCENT_TEXT = "#963A10";
/** Accent on dark chrome. 5.79:1 on VOID — the brand hex only reaches 4.36:1
 *  there, so dark-chrome accents lighten rather than darken. */
const ACCENT_ON_DARK = "#D4762B";
/** Soft accent wash for chips and highlighted rows. */
const ACCENT_LIGHT = "#FBEDE1";

/* ── Semantic states ─────────────────────────────────────────────────────
 * Semantic colour stays soft and small: tinted chips and icon fills, never a
 * whole surface. Customs work is read as a table — a screen of coloured
 * backgrounds destroys the scan. */

/** Cleared / approved / passed. 7.52:1 on CANVAS. Replaces the two near-
 *  identical greens (#1A5C3A and #1A5E3A) that had drifted apart. */
const GREEN = "#1F5232";
const GREEN_MID = "#2E7D52";
const GREEN_LIGHT = "#E6EFE8";

/** Attention / awaiting broker. 5.51:1 on CANVAS. Replaces gold #B8860B,
 *  which measured 2.94:1 on paper and was effectively invisible. */
const GOLD = "#7A5600";
const WARN = "#FBF0D8";
const WARN_BORDER = "#C89A1E";
/** 5.88:1 on WARN. */
const WARN_TEXT = "#7A5600";

/** Error / correction required. 5.71:1 on CRITICAL. */
const RED = "#B02020";
const CRITICAL = "#FBE6E4";
/** Terminal rejection — heavier than RED. 8.63:1 on CRITICAL. */
const REJECTED = "#7A1E1E";

/** Submitted / lodged with Customs. 7.60:1 on BLUE_LIGHT. */
const BLUE = "#1E4A8C";
const BLUE_LIGHT = "#EBF0F8";

/** Receipted. 7.45:1 on PURPLE_LIGHT. */
const PURPLE = "#5A3A8A";
const PURPLE_LIGHT = "#F0EBF7";

/**
 * The palette. Key names are kept backwards-compatible with the local `const C`
 * blocks this file replaces, so the ~1,200 existing inline styles keep working
 * unchanged — only the values behind them are corrected.
 */
export const C = {
  /* canvas + paper */
  canvas: CANVAS,
  paper: PAPER,
  paperAlt: PAPER_ALT,
  paperBorder: PAPER_BORDER,
  paperMid: PAPER_MID,

  /* ink */
  ink: INK,
  inkMid: INK_MID,
  inkLight: INK_LIGHT,

  /* dark chrome — `void_` is the alias used by pages that cannot shadow the
     `void` reserved word in their local scope. Both point at the same hex. */
  void: VOID,
  void_: VOID,
  voidMid: VOID_MID,
  voidSurface: VOID_SURFACE,
  voidBorder: VOID_BORDER,
  ghost: GHOST,
  ghostDim: GHOST_DIM,

  /* accent */
  amber: ACCENT,
  amberDeep: ACCENT_DEEP,
  amberText: ACCENT_TEXT,
  amberOnDark: ACCENT_ON_DARK,
  amberLight: ACCENT_LIGHT,

  /* semantic */
  green: GREEN,
  greenMid: GREEN_MID,
  greenLight: GREEN_LIGHT,
  gold: GOLD,
  warn: WARN,
  warnBorder: WARN_BORDER,
  warnText: WARN_TEXT,
  red: RED,
  critical: CRITICAL,
  critBorder: RED,
  blue: BLUE,
  blueLight: BLUE_LIGHT,
  purple: PURPLE,
  purpleLight: PURPLE_LIGHT,

  /* declaration-lifecycle aliases — these read as status names at the call
     site (`C.approved`) and keep the lifecycle vocabulary consistent with the
     backend's status tokens. */
  approved: GREEN,
  extracted: GREEN,
  pending: GOLD,
  correction: ACCENT_TEXT,
  rejected: REJECTED,
  submitted: BLUE,
  receipted: PURPLE,
} as const;

export type StallionPalette = typeof C;

/* ── Typography ──────────────────────────────────────────────────────────
 * Display serif + mono, no UI sans. The serif carries the brand; the mono
 * carries the data. Every numeral in the product — TTD amounts, HS/THN codes,
 * declaration references, container numbers — is mono so digits align in a
 * column and 0/O and 1/l stay distinguishable on a broker's phone. */

export const SERIF = "'Fraunces', Georgia, 'Times New Roman', serif";
export const MONO = "'JetBrains Mono', 'SFMono-Regular', Menlo, monospace";

/**
 * Type scale. Sizes are a real scale rather than the ad-hoc 8–11px literals
 * that were scattered through the pages: the smallest token here is 11px,
 * because this app is used one-handed on a phone in a warehouse.
 */
export const SIZE = {
  eyebrow: 11,
  label: 11,
  caption: 12,
  data: 13,
  body: 14,
  cardTitle: 17,
  sectionTitle: 22,
  pageTitle: 34,
  stat: 28,
} as const;

export const WEIGHT = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  black: 900,
} as const;

/* ── Geometry ────────────────────────────────────────────────────────────
 * Stallion uses squared editorial cards, not the soft rounding of the
 * consumer-facing products in the stable. Radii stay tight. */

export const RADIUS = {
  /** Chips, pills, inputs, buttons. */
  sm: 3,
  /** Cards and panels. */
  md: 6,
  /** Modals. */
  lg: 10,
} as const;

export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Minimum comfortable touch target (px). Field use is one-handed on a phone. */
export const TOUCH_TARGET = 44;

export default C;
