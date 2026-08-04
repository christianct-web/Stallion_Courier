/**
 * typeScale.ts — ready-to-spread typography styles.
 *
 * Values derive from `@/brand/stallion` (the single source of truth); this
 * module just assembles them into CSSProperties objects so pages can spread a
 * named role instead of hand-typing fontSize/fontWeight/color literals.
 *
 * Pairing:
 *   Fraunces       — display serif: page titles, card titles
 *   JetBrains Mono — data + labels: eyebrows, table cells, reference codes,
 *                    and every numeral in the product
 */
import type { CSSProperties } from "react";
import { C, SERIF, MONO, SIZE, WEIGHT } from "@/brand/stallion";

export { SERIF, MONO };

/**
 * Tabular figures. Applied to anything that stacks in a column — TTD amounts,
 * duty rates, quantities — so digits line up vertically down a table.
 */
const TABULAR: CSSProperties = { fontVariantNumeric: "tabular-nums" };

export const type = {
  /** Page masthead — e.g. "Trade Declarations". */
  pageTitle: {
    fontFamily: SERIF,
    fontSize: SIZE.pageTitle,
    fontWeight: WEIGHT.bold,
    letterSpacing: "-0.02em",
    lineHeight: 1.05,
    color: C.ink,
  } as CSSProperties,

  /** Section heading below the masthead. */
  sectionTitle: {
    fontFamily: SERIF,
    fontSize: SIZE.sectionTitle,
    fontWeight: WEIGHT.bold,
    letterSpacing: "-0.015em",
    lineHeight: 1.15,
    color: C.ink,
  } as CSSProperties,

  /** Section / card title — e.g. "Import Declaration". */
  cardTitle: {
    fontFamily: SERIF,
    fontSize: SIZE.cardTitle,
    fontWeight: WEIGHT.bold,
    letterSpacing: "-0.01em",
    color: C.ink,
  } as CSSProperties,

  /** Accent tracked label above a title — e.g. "STALLION · TRADE MODULE". */
  eyebrow: {
    fontFamily: MONO,
    fontSize: SIZE.eyebrow,
    fontWeight: WEIGHT.bold,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: C.amberText,
  } as CSSProperties,

  /** Page / card subtitle — supporting sentence under a title. */
  subtitle: {
    fontFamily: MONO,
    fontSize: SIZE.caption,
    fontWeight: WEIGHT.medium,
    lineHeight: 1.5,
    color: C.inkMid,
  } as CSSProperties,

  /** Uppercase column header / field label inside tables and forms. */
  label: {
    fontFamily: MONO,
    fontSize: SIZE.label,
    fontWeight: WEIGHT.bold,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: C.inkMid,
  } as CSSProperties,

  /** Primary data cell — reference codes, names, the values that matter. */
  data: {
    fontFamily: MONO,
    fontSize: SIZE.data,
    fontWeight: WEIGHT.medium,
    color: C.ink,
    ...TABULAR,
  } as CSSProperties,

  /** Secondary data cell — supporting columns. */
  dataMuted: {
    fontFamily: MONO,
    fontSize: SIZE.data,
    fontWeight: WEIGHT.regular,
    color: C.inkLight,
    ...TABULAR,
  } as CSSProperties,

  /** Money. Always mono, always tabular, always right-aligned in tables. */
  money: {
    fontFamily: MONO,
    fontSize: SIZE.data,
    fontWeight: WEIGHT.semibold,
    color: C.ink,
    textAlign: "right",
    ...TABULAR,
  } as CSSProperties,

  /** Big stat-card number. */
  statNumber: {
    fontFamily: MONO,
    fontSize: SIZE.stat,
    fontWeight: WEIGHT.bold,
    lineHeight: 1,
    letterSpacing: "-0.01em",
    color: C.ink,
    ...TABULAR,
  } as CSSProperties,

  /** Stat-card caption above the number. */
  statLabel: {
    fontFamily: MONO,
    fontSize: SIZE.label,
    fontWeight: WEIGHT.bold,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: C.inkMid,
  } as CSSProperties,
} as const;

export type TypeScale = typeof type;
