/**
 * typeScale.ts — Stallion's shared typography scale.
 *
 * Single source of truth for the redesigned (heavier / darker / larger) type
 * system applied across the whole app. New pages and refactors should pull
 * styles from here instead of hand-typing fontSize/fontWeight literals, so the
 * "bolden / darken / enlarge" direction stays consistent everywhere.
 *
 * Pairing:
 *   Fraunces      — display serif: page titles, card titles, big numerals
 *   JetBrains Mono — data + labels: eyebrows, table cells, reference codes
 *
 * Colours mirror components/courier/tokens.ts (post-darkening):
 *   ink #18150F · inkMid #2C2820 · inkLight #4A453D · amber #C65911
 */

export const SERIF = "'Fraunces', Georgia, serif";
export const MONO = "'JetBrains Mono', 'SFMono-Regular', monospace";

const INK = "#18150F";
const INK_MID = "#2C2820";
const AMBER = "#C65911";

import type { CSSProperties } from "react";

/**
 * The scale. Each entry is a ready-to-spread CSSProperties object.
 * Values reflect the "push further" weight chosen for the redesign:
 *   titles 700, eyebrows 700 amber, body 500–600, never thin/grey.
 */
export const type = {
  /** Page masthead — e.g. "Trade Declarations". */
  pageTitle: {
    fontFamily: SERIF,
    fontSize: 34,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    lineHeight: 1.05,
    color: INK,
  } as CSSProperties,

  /** Section / card title — e.g. "Import Declaration". */
  cardTitle: {
    fontFamily: SERIF,
    fontSize: 17,
    fontWeight: 700,
    letterSpacing: "-0.01em",
    color: INK,
  } as CSSProperties,

  /** Amber tracked label above a title — e.g. "STALLION · TRADE MODULE". */
  eyebrow: {
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: AMBER,
  } as CSSProperties,

  /** Page / card subtitle — supporting sentence under a title. */
  subtitle: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.5,
    color: INK_MID,
  } as CSSProperties,

  /** Uppercase column header / field label inside tables and forms. */
  label: {
    fontFamily: MONO,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: INK_MID,
  } as CSSProperties,

  /** Primary data cell — reference codes, names, the values that matter. */
  data: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: 600,
    color: INK,
  } as CSSProperties,

  /** Secondary data cell — supporting columns. */
  dataMuted: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: 500,
    color: INK_MID,
  } as CSSProperties,

  /** Big stat-card number. */
  statNumber: {
    fontFamily: MONO,
    fontSize: 28,
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: "-0.01em",
    color: INK,
  } as CSSProperties,

  /** Stat-card caption above the number. */
  statLabel: {
    fontFamily: MONO,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: INK_MID,
  } as CSSProperties,
} as const;

export type TypeScale = typeof type;
