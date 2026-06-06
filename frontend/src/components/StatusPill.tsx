/**
 * StatusPill.tsx — the single source of truth for status badges across Stallion.
 *
 * Previously every list page (Sheets, Courier, Declarations, BrokerReview)
 * defined its own STATUS_STYLE map + StatusPill, so the same status could look
 * different depending on the screen. This component unifies them: one palette,
 * one shape, one label set. Lookup is case-insensitive and tolerant of the
 * several key spellings the various endpoints emit (e.g. "pending" vs
 * "pending_review", "Draft" vs "draft", "Exported" vs "submitted").
 *
 * Colours mirror components/courier/tokens.ts.
 */
import type { CSSProperties } from "react";
import { C } from "@/components/courier/tokens";

type PillStyle = { fg: string; bg: string; border: string; label: string };

// Canonical styles keyed by a normalised status token.
const STATUS_STYLE: Record<string, PillStyle> = {
  draft:            { fg: C.inkLight,   bg: C.paperAlt,    border: C.paperBorder,      label: "DRAFT" },
  pending:          { fg: C.warnText,   bg: C.warn,        border: C.warnBorder,       label: "BROKER REVIEW" },
  pending_review:   { fg: C.warnText,   bg: C.warn,        border: C.warnBorder,       label: "BROKER REVIEW" },
  correction:       { fg: C.critBorder, bg: C.critical,    border: C.critBorder,       label: "CORRECTION" },
  needs_correction: { fg: C.critBorder, bg: C.critical,    border: C.critBorder,       label: "CORRECTION" },
  rejected:         { fg: "#7A1E1E",    bg: C.critical,    border: "#7A1E1E55",        label: "REJECTED" },
  approved:         { fg: C.green,      bg: C.greenLight,  border: C.green + "55",     label: "APPROVED" },
  ready:            { fg: C.green,      bg: C.greenLight,  border: C.green + "55",     label: "READY" },
  examined:         { fg: C.amber,      bg: C.amberLight,  border: C.amber + "55",     label: "EXAMINED" },
  finalised:        { fg: C.green,      bg: C.greenLight,  border: C.green + "55",     label: "FINALISED" },
  submitted:        { fg: C.blue,       bg: C.blueLight,   border: C.blue + "55",      label: "SUBMITTED" },
  exported:         { fg: C.blue,       bg: C.blueLight,   border: C.blue + "55",      label: "SUBMITTED" },
  receipted:        { fg: C.purple,     bg: C.purpleLight, border: C.purple + "55",    label: "RECEIPTED" },
};

export function statusStyle(status: string | null | undefined): PillStyle {
  const key = (status ?? "").toString().trim().toLowerCase();
  return STATUS_STYLE[key] ?? STATUS_STYLE.draft;
}

export function StatusPill({ status, style }: { status: string; style?: CSSProperties }) {
  const s = statusStyle(status);
  return (
    <span style={{
      fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
      letterSpacing: "0.08em", color: s.fg, background: s.bg,
      border: `1px solid ${s.border}`, padding: "3px 8px", borderRadius: 3,
      display: "inline-block", whiteSpace: "nowrap", ...style,
    }}>{s.label}</span>
  );
}

export default StatusPill;
